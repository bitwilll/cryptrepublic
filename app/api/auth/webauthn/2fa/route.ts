import "server-only";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { rateLimit } from "@/lib/auth/ratelimit";
import { webauthn2faSchema } from "@/lib/validation/webauthn";
import { json, badRequest, forbidden, tooManyRequests } from "@/lib/http/responses";

/**
 * POST /api/auth/webauthn/2fa — toggle "require a passkey to complete password
 * sign-in" for the LOGGED-IN account. Enabling requires at least one enrolled
 * passkey (no lockout by construction; deleting the last passkey auto-disables
 * the flag on the delete route). A UV-gated passkey is inherently multi-factor
 * (possession + biometric/PIN), so the flag's meaning is exactly: password
 * alone is never sufficient for this account.
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
  const parsed = webauthn2faSchema.safeParse(body);
  if (!parsed.success) return badRequest();

  if (parsed.data.enabled) {
    const passkeys = await prisma.webAuthnCredential.count({ where: { userId } });
    if (passkeys === 0) {
      return badRequest("Add a passkey first — this setting requires one to sign in.");
    }
  }

  const u = await prisma.user.update({
    where: { id: userId },
    data: { passkey2faEnabled: parsed.data.enabled },
    select: { passkey2faEnabled: true },
  });
  return json({ ok: true, passkey2faEnabled: u.passkey2faEnabled });
}
