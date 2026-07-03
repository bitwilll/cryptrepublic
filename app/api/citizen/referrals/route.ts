import "server-only";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { activeChain } from "@/lib/config/chain";
import { resolveApplicantAddress } from "@/lib/applications/applicant";
import { readHasPassportServer, readPassportStatusServer } from "@/lib/passport/serverReads";
import { computeTrustScore } from "@/lib/trust/score";
import { canCreateReferral } from "@/lib/referrals/gate";
import { json } from "@/lib/http/responses";

/**
 * GET /api/citizen/referrals — the caller's OWN trust score (READ-ONLY),
 * referral-token balance, whether they may create a referral right now, and
 * the people they have referred (each with a CHAIN-DERIVED becameCitizen).
 * Mirrors the obligations route: graceful when there is no verified wallet
 * (citizen-dependent signals compute to 0). The trust score is never
 * presented as citizenship.
 */
export async function GET(req: Request): Promise<Response> {
  let userId: string;
  try {
    ({
      user: { id: userId },
    } = await requireSession(req));
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralTokenBalance: true, trustAdjustment: true },
  });
  const trustAdjustment = user?.trustAdjustment ?? 0;
  const referralTokenBalance = user?.referralTokenBalance ?? 0;

  const chainId = activeChain().primaryChainId;
  const address = await resolveApplicantAddress(userId);
  let tokenId: bigint | null = null;
  if (address) {
    try {
      tokenId = (await readPassportStatusServer(chainId, address)).tokenId;
    } catch {
      tokenId = null;
    }
  }

  const trust = await computeTrustScore(chainId, { userId, address, tokenId }, trustAdjustment);
  const gate = await canCreateReferral(chainId, userId);

  const made = await prisma.referral.findMany({
    where: { referrerUserId: userId },
    select: {
      referredUserId: true,
      referred: { select: { email: true } },
      whenTokenConsumed: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  const referrals = await Promise.all(
    made.map(async (r) => {
      const addr = await resolveApplicantAddress(r.referredUserId);
      let becameCitizen = false;
      if (addr) {
        try {
          becameCitizen = await readHasPassportServer(chainId, addr);
        } catch {
          becameCitizen = false;
        }
      }
      return {
        referredEmail: r.referred.email,
        whenTokenConsumed: r.whenTokenConsumed,
        createdAt: r.createdAt,
        becameCitizen, // chain-derived
      };
    }),
  );

  return json({
    trustScore: trust.finalScore, // READ-ONLY to the citizen
    trustBreakdown: {
      computed: trust.computed,
      adminAdjustment: trust.adminAdjustment,
      signals: trust.signals,
    },
    referralTokenBalance,
    canCreateReferral: gate.allowed,
    createReason: gate.allowed ? null : gate.reason,
    referrals,
  });
}
