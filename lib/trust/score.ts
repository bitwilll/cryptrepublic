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
 * Hybrid trust score (Wave 12). The `computed` component is derived ONLY from
 * honest, chain-real signals (never fabricated); the sole persisted input is
 * `User.trustAdjustment` (an admin-set, audited signed delta). The score is
 * computed ON READ (no cache column) and surfaced READ-ONLY to the citizen —
 * it is NEVER citizenship (that stays chain-derived). `finalScore > 50`
 * bypasses the referral-token cost (see lib/referrals/gate.ts).
 *
 * Five bounded sub-scores (each max 20 → computed in 0..100 before clamp):
 *   isCitizen (20) · tenure (20) · referrals-who-became-citizens (20) ·
 *   governance votes (20) · dividend claims (20).
 *
 * TODO(future): a server-side STAKE signal — staking is a client-only reader
 * today; add a server stake read as a 6th signal when one exists (rebalance
 * the caps). Deferred this wave (Constraint #6).
 */

// ≈ one day on a 2s-block chain (Base): 1 tenure point per ~43.2k blocks,
// capped at 20 (≈20 days of citizenship reaches the tenure ceiling).
export const TENURE_BLOCKS_PER_POINT = 43_200;
const SUBSCORE_CAP = 20;

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
}

export interface TrustScore {
  computed: number; // 0..100 (sum of honest sub-scores, pre-adjustment)
  adminAdjustment: number; // the persisted signed delta
  finalScore: number; // clamp(computed + adminAdjustment, 0, 100)
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

  const signals: TrustSignals = {
    isCitizen,
    tenureBlocks,
    referralsBecameCitizens,
    governanceVotes,
    dividendClaims,
  };

  const computed = clamp(
    (isCitizen ? SUBSCORE_CAP : 0) +
      Math.min(SUBSCORE_CAP, Math.floor(tenureBlocks / TENURE_BLOCKS_PER_POINT)) +
      Math.min(SUBSCORE_CAP, referralsBecameCitizens * 4) +
      Math.min(SUBSCORE_CAP, governanceVotes * 4) +
      Math.min(SUBSCORE_CAP, dividendClaims * 4),
    0,
    100,
  );
  const finalScore = clamp(computed + adminAdjustment, 0, 100);
  return { computed, adminAdjustment, finalScore, signals };
}
