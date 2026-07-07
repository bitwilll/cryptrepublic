import "server-only";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { json, badRequest, forbidden } from "@/lib/http/responses";
import { bitwillRevokeSchema } from "@/lib/validation/estate";

/**
 * POST /api/bitwill/revoke (Wave 15 A) — sets the caller's ACTIVE directive to
 * REVOKED. The body is EMPTY ({}, strict): the target is resolved from the
 * session, never from a client-supplied id (unspoofable ownership). Revoking
 * with no ACTIVE directive on file is a 400.
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
  if (!bitwillRevokeSchema.safeParse(body).success) return badRequest();

  const res = await prisma.bitwillDirective.updateMany({
    where: { ownerUserId: userId, status: "ACTIVE" },
    data: { status: "REVOKED", revokedAt: new Date() },
  });
  if (res.count === 0) return badRequest("No active directive to revoke.");

  return json({ ok: true });
}
