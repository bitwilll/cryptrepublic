import "server-only";
import { prisma } from "@/lib/db";
import { json } from "@/lib/http/responses";
import { guardAdminGet } from "@/lib/admin/routeGuard";
import { activeChain } from "@/lib/config/chain";
import { resolveApplicantAddress } from "@/lib/applications/applicant";
import { readHasPassportServer, readPassportStatusServer } from "@/lib/passport/serverReads";
import { computeTrustScore } from "@/lib/trust/score";

/**
 * GET /api/admin/users/[id]/referrals — a guarded read of a user's outgoing
 * referrals + their trust breakdown. `becameCitizen` per referral is CHAIN-
 * DERIVED (labeled), read live via readHasPassportServer against the referred
 * user's verified wallet — NEVER from CitizenshipApplication.status. Every
 * chain read is graceful (an unreachable chain → false, never a 500).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const actor = await guardAdminGet(req, {
    keyPrefix: "admin-user-referrals",
    limit: 60,
    windowMs: 60_000,
  });
  if (actor instanceof Response) return actor;

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, referralTokenBalance: true, trustAdjustment: true },
  });
  if (!user) return json({ error: "Not found." }, { status: 404 });

  const chainId = activeChain().primaryChainId;

  const address = await resolveApplicantAddress(id);
  let tokenId: bigint | null = null;
  if (address) {
    try {
      tokenId = (await readPassportStatusServer(chainId, address)).tokenId;
    } catch {
      tokenId = null;
    }
  }
  const trust = await computeTrustScore(
    chainId,
    { userId: id, address, tokenId },
    user.trustAdjustment,
  );

  const made = await prisma.referral.findMany({
    where: { referrerUserId: id },
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
        referredUserId: r.referredUserId,
        referredEmail: r.referred.email,
        whenTokenConsumed: r.whenTokenConsumed,
        createdAt: r.createdAt,
        becameCitizen, // chain-derived
      };
    }),
  );

  return json({
    user: {
      id: user.id,
      email: user.email,
      referralTokenBalance: user.referralTokenBalance,
      trustAdjustment: user.trustAdjustment,
    },
    trust: {
      finalScore: trust.finalScore,
      computed: trust.computed,
      adminAdjustment: trust.adminAdjustment,
      signals: trust.signals,
      chainDerived: true,
    },
    referrals,
  });
}
