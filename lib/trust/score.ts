import "server-only";
import type { Address } from "viem";
import {
  readHasPassportServer,
  readCitizenMintedLogsServer,
  readHeadBlockServer,
} from "@/lib/passport/serverReads";
import { readProposalCountServer, readMyVoteServer } from "@/lib/governance/serverReads";
import { readDividendHistoryServer } from "@/lib/dividends/serverReads";
import { resolveApplicantAddress } from "@/lib/applications/applicant";
import { prisma } from "@/lib/db";

/**
 * Hybrid trust score (Wave 12, extended Wave 17). The `computed` component is
 * derived ONLY from honest signals (chain-real or DB-real; never fabricated);
 * the persisted inputs are `User.trustAdjustment` (admin-set, audited) and
 * VERIFIED CitizenReport penalties (officer/admin-decided, audited). The score
 * is computed ON READ and surfaced READ-ONLY — it is NEVER citizenship (that
 * stays chain-derived). `finalScore > 50` bypasses the referral-token cost;
 * `finalScore > 65` unlocks shareable referral links (lib/referrals/gate.ts).
 *
 * Positive signals: five bounded chain sub-scores (each max 20) + a civic
 * activity sub-score (max 10, from DB-real acts: witness attestations given,
 * certificates issued, project endorsements) → computed clamped 0..100.
 * Negative signal (Wave 17, per the Penal Code): the summed penalties of
 * VERIFIED conduct reports. finalScore = clamp(computed + adjustment +
 * penalPoints, −100, 100) — the statute allows negative standing.
 *
 * TODO(future): a server-side STAKE signal — staking is a client-only reader
 * today; add a server stake read when one exists (rebalance the caps).
 */

// ≈ one day on a 2s-block chain (Base): 1 tenure point per ~43.2k blocks,
// capped at 20 (≈20 days of citizenship reaches the tenure ceiling).
export const TENURE_BLOCKS_PER_POINT = 43_200;
const SUBSCORE_CAP = 20;
export const CIVIC_ACTIVITY_CAP = 10;
export const SCORE_FLOOR = -100;

export interface TrustSubject {
  userId: string;
  address: Address | null; // the verified wallet (null → not resolvable)
  tokenId: bigint | null; // passport tokenId (null → not a citizen)
}

export interface TrustSignals {
  isCitizen: boolean;
  tenureBlocks: number;
  referralsBecameCitizens: number;
  governanceVotes: number;
  dividendClaims: number;
  // Wave 17 — DB-real civic activity (2 pts / attestation, 1 pt each otherwise; combined cap 10)
  witnessAttestationsGiven: number;
  certificatesIssued: number;
  projectEndorsementsGiven: number;
  // Wave 17 — penal record: sum of VERIFIED report penalties (<= 0) + count
  penalPoints: number;
  verifiedReportCount: number;
}

export interface TrustScore {
  computed: number; // 0..100 (sum of honest sub-scores, pre-adjustment)
  adminAdjustment: number; // the persisted signed delta
  finalScore: number; // clamp(computed + adminAdjustment + penalPoints, -100, 100)
  signals: TrustSignals;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Every chain read is best-effort — an unreachable chain degrades to `fallback`. */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

async function tenureBlocksOf(chainId: number, address: Address, tokenId: bigint): Promise<number> {
  const [logs, head] = await Promise.all([
    safe(
      () => readCitizenMintedLogsServer(chainId),
      [] as Awaited<ReturnType<typeof readCitizenMintedLogsServer>>,
    ),
    safe(() => readHeadBlockServer(chainId), 0n),
  ]);
  const mine = logs.find(
    (l) => l.tokenId === tokenId || l.citizen.toLowerCase() === address.toLowerCase(),
  );
  if (!mine || head <= mine.mintBlock) return 0;
  return Number(head - mine.mintBlock);
}

async function countReferralsBecameCitizens(
  chainId: number,
  referrerUserId: string,
): Promise<number> {
  const edges = await safe(
    () => prisma.referral.findMany({ where: { referrerUserId }, select: { referredUserId: true } }),
    [] as { referredUserId: string }[],
  );
  let count = 0;
  for (const e of edges) {
    const addr = await safe(() => resolveApplicantAddress(e.referredUserId), null);
    if (!addr) continue;
    if (await safe(() => readHasPassportServer(chainId, addr), false)) count++;
  }
  return count;
}

async function countGovernanceVotes(chainId: number, tokenId: bigint): Promise<number> {
  const count = await safe(() => readProposalCountServer(chainId), 0n);
  let votes = 0;
  for (let id = 1n; id <= count; id++) {
    const v = await safe(() => readMyVoteServer(chainId, id, tokenId), 0);
    if (v !== 0) votes++;
  }
  return votes;
}

async function civicActivityOf(userId: string): Promise<{
  witnessAttestationsGiven: number;
  certificatesIssued: number;
  projectEndorsementsGiven: number;
}> {
  const wallets = await safe(
    () =>
      prisma.linkedWallet.findMany({
        where: { userId, verifiedAt: { not: null } },
        select: { address: true },
      }),
    [] as { address: string }[],
  );
  const witnessAttestationsGiven =
    wallets.length > 0
      ? await safe(
          () =>
            prisma.witnessSignature.count({
              where: { witnessAddress: { in: wallets.map((w) => w.address) } },
            }),
          0,
        )
      : 0;
  const certificatesIssued = await safe(
    () => prisma.signedCertificate.count({ where: { authorUserId: userId, revokedAt: null } }),
    0,
  );
  const projectEndorsementsGiven = await safe(
    () => prisma.projectEndorsement.count({ where: { userId } }),
    0,
  );
  return { witnessAttestationsGiven, certificatesIssued, projectEndorsementsGiven };
}

async function penalRecordOf(userId: string): Promise<{ penalPoints: number; count: number }> {
  const agg = await safe(
    () =>
      prisma.citizenReport.aggregate({
        where: { subjectUserId: userId, status: "VERIFIED" },
        _sum: { penalty: true },
        _count: { _all: true },
      }),
    null as { _sum: { penalty: number | null }; _count: { _all: number } } | null,
  );
  return {
    penalPoints: agg?._sum.penalty ?? 0,
    count: agg?._count._all ?? 0,
  };
}

export async function computeTrustScore(
  chainId: number,
  subject: TrustSubject,
  adminAdjustment: number,
): Promise<TrustScore> {
  const isCitizen = subject.address
    ? await safe(() => readHasPassportServer(chainId, subject.address as Address), false)
    : false;

  const tenureBlocks =
    isCitizen && subject.address && subject.tokenId != null
      ? await tenureBlocksOf(chainId, subject.address, subject.tokenId)
      : 0;

  // Independent of the referrer's OWN citizenship (a non-citizen may still have
  // referred people who became citizens).
  const referralsBecameCitizens = await countReferralsBecameCitizens(chainId, subject.userId);

  const governanceVotes =
    isCitizen && subject.tokenId != null ? await countGovernanceVotes(chainId, subject.tokenId) : 0;

  const dividendClaims =
    isCitizen && subject.tokenId != null
      ? (await safe(() => readDividendHistoryServer(chainId, subject.tokenId as bigint), [])).length
      : 0;

  const civic = await civicActivityOf(subject.userId);
  const penal = await penalRecordOf(subject.userId);

  const signals: TrustSignals = {
    isCitizen,
    tenureBlocks,
    referralsBecameCitizens,
    governanceVotes,
    dividendClaims,
    ...civic,
    penalPoints: penal.penalPoints,
    verifiedReportCount: penal.count,
  };

  const civicActivityPoints = Math.min(
    CIVIC_ACTIVITY_CAP,
    civic.witnessAttestationsGiven * 2 + civic.certificatesIssued + civic.projectEndorsementsGiven,
  );

  const computed = clamp(
    (isCitizen ? SUBSCORE_CAP : 0) +
      Math.min(SUBSCORE_CAP, Math.floor(tenureBlocks / TENURE_BLOCKS_PER_POINT)) +
      Math.min(SUBSCORE_CAP, referralsBecameCitizens * 4) +
      Math.min(SUBSCORE_CAP, governanceVotes * 4) +
      Math.min(SUBSCORE_CAP, dividendClaims * 4) +
      civicActivityPoints,
    0,
    100,
  );
  // Penal record applies AFTER the 0..100 computed clamp; the statute allows
  // negative standing, so the final band is -100..100.
  const finalScore = clamp(computed + adminAdjustment + signals.penalPoints, SCORE_FLOOR, 100);
  return { computed, adminAdjustment, finalScore, signals };
}
