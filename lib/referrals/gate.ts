import "server-only";
import { prisma } from "@/lib/db";
import { resolveApplicantAddress } from "@/lib/applications/applicant";
import { readPassportStatusServer } from "@/lib/passport/serverReads";
import { computeTrustScore } from "@/lib/trust/score";

/**
 * The referral CREATE gate (Wave 12). Decides whether `referrerUserId` may
 * create a referral right now:
 *   allowed && !viaToken  → trust finalScore > 50 (FREE — no token spent)
 *   allowed && viaToken   → finalScore <= 50 AND tokenBalance > 0 (spend one)
 *   !allowed              → finalScore <= 50 AND tokenBalance === 0
 * Exactly 50 is NOT a bypass. This function is READ-ONLY — the create route
 * decrements the balance transactionally (with a race guard). Referral tokens
 * are an OFF-CHAIN admin-allocated quota (a User Int counter), not an ERC-20.
 * TODO(future): an on-chain referral token is a documented deferral.
 */
export interface CreateGateResult {
  allowed: boolean;
  viaToken: boolean; // true → the create must consume one token
  reason: string; // human message when !allowed (surfaced by the route)
  finalScore: number;
  tokenBalance: number;
}

const TRUST_BYPASS_THRESHOLD = 50; // finalScore > 50 refers for free

export async function canCreateReferral(
  chainId: number,
  referrerUserId: string,
): Promise<CreateGateResult> {
  const user = await prisma.user.findUnique({
    where: { id: referrerUserId },
    select: { referralTokenBalance: true, trustAdjustment: true },
  });
  const tokenBalance = user?.referralTokenBalance ?? 0;
  const adminAdjustment = user?.trustAdjustment ?? 0;

  // Resolve the referrer's chain identity for the trust score (graceful).
  const address = await resolveApplicantAddress(referrerUserId);
  let tokenId: bigint | null = null;
  if (address) {
    try {
      tokenId = (await readPassportStatusServer(chainId, address)).tokenId;
    } catch {
      tokenId = null;
    }
  }

  const { finalScore } = await computeTrustScore(
    chainId,
    { userId: referrerUserId, address, tokenId },
    adminAdjustment,
  );

  if (finalScore > TRUST_BYPASS_THRESHOLD) {
    return { allowed: true, viaToken: false, reason: "", finalScore, tokenBalance };
  }
  if (tokenBalance > 0) {
    return { allowed: true, viaToken: true, reason: "", finalScore, tokenBalance };
  }
  return {
    allowed: false,
    viaToken: false,
    reason: "You need a referral token or a trust score above 50 to refer someone.",
    finalScore,
    tokenBalance,
  };
}
