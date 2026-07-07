import "server-only";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { activeChain } from "@/lib/config/chain";
import { resolveApplicantAddress } from "@/lib/applications/applicant";
import { readPassportStatusServer } from "@/lib/passport/serverReads";
import { computeTrustScore } from "@/lib/trust/score";
import { buildTrustReport } from "@/lib/trust/factors";
import { json } from "@/lib/http/responses";

/**
 * GET /api/trust — the caller's OWN hybrid trust score decomposed into its
 * REAL factor ledger (Wave 15 — Identity). Reuses the Wave-12 computation
 * (lib/trust/score.ts) verbatim — this route invents no scoring; it only
 * decomposes what the referral gate already reads, so the two can never
 * disagree. The factor sum equals `score` (unit-tested in lib/trust/factors).
 * Graceful without a verified wallet: citizen-dependent signals compute to 0.
 * Read-only; a trust score is NEVER citizenship.
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
    select: { trustAdjustment: true },
  });
  const trustAdjustment = user?.trustAdjustment ?? 0;

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
  return json(buildTrustReport(trust));
}
