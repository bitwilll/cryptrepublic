import "server-only";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { rateLimit } from "@/lib/auth/ratelimit";
import { webauthnCredentialDeleteSchema } from "@/lib/validation/webauthn";
import { json, badRequest, forbidden, tooManyRequests } from "@/lib/http/responses";

/**
 * POST /api/auth/webauthn/credentials/delete — remove ONE of the LOGGED-IN
 * account's passkeys. Deleting the LAST passkey auto-disables the
 * require-passkey flag in the SAME transaction — an account can never be
 * locked into a factor it no longer has.
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

  const rl = rateLimit(`webauthn-manage:${userId}`, 30, 15 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const parsed = webauthnCredentialDeleteSchema.safeParse(body);
  if (!parsed.success) return badRequest();

  const result = await prisma.$transaction(async (tx) => {
    // Own-credential only: the userId filter means another account's
    // credentialId simply doesn't match (opaque 400, no existence oracle).
    const deleted = await tx.webAuthnCredential.deleteMany({
      where: { credentialId: parsed.data.credentialId, userId },
    });
    if (deleted.count === 0) return null;
    const remaining = await tx.webAuthnCredential.count({ where: { userId } });
    let passkey2faEnabled: boolean;
    if (remaining === 0) {
      const u = await tx.user.update({
        where: { id: userId },
        data: { passkey2faEnabled: false },
        select: { passkey2faEnabled: true },
      });
      passkey2faEnabled = u.passkey2faEnabled;
    } else {
      const u = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { passkey2faEnabled: true },
      });
      passkey2faEnabled = u.passkey2faEnabled;
    }
    return { remaining, passkey2faEnabled };
  });

  if (!result) return badRequest("No such passkey on this account.");
  return json({ ok: true, ...result });
}
