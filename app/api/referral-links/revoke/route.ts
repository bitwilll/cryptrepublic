import "server-only";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { referralLinkRevokeSchema } from "@/lib/validation/reports";
import { json, badRequest, forbidden } from "@/lib/http/responses";

/**
 * POST /api/referral-links/revoke (Wave 17). OWNER-ONLY: the guarded
 * updateMany matches on { id, ownerUserId } so another citizen's link id is
 * indistinguishable from an unknown one (generic 400 — no link enumeration).
 * Idempotent: revoking an already-revoked own link returns ok without moving
 * revokedAt. Existing Referral edges made through the link remain — revocation
 * only stops FUTURE signups from binding.
 */
export async function POST(req: Request): Promise<Response> {
  if (!isAllowedOrigin(req)) return forbidden();

  let userId: string;
  try {
    ({
      user: { id: userId },
    } = await requireSession(req));
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const parsed = referralLinkRevokeSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Bad request.");

  const res = await prisma.referralLink.updateMany({
    where: { id: parsed.data.linkId, ownerUserId: userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (res.count === 0) {
    // Already revoked (mine) → idempotent ok; unknown or not mine → generic 400.
    const mine = await prisma.referralLink.findFirst({
      where: { id: parsed.data.linkId, ownerUserId: userId },
      select: { revokedAt: true },
    });
    if (mine?.revokedAt) return json({ ok: true, alreadyRevoked: true });
    return badRequest("No such link.");
  }
  return json({ ok: true });
}
