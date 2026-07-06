import { loginSchema, normalizeEmail } from "@/lib/validation/auth";
import { verifyPassword, DUMMY_HASH } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { isLocked, registerFailedLogin, resetFailedLogins } from "@/lib/auth/lockout";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { rateLimit } from "@/lib/auth/ratelimit";
import { prisma } from "@/lib/db";
import {
  json,
  badRequest,
  forbidden,
  genericAuthError,
  tooManyRequests,
  withSessionCookie,
} from "@/lib/http/responses";

export async function POST(req: Request): Promise<Response> {
  if (!isAllowedOrigin(req)) return forbidden();
  const rl = rateLimit(`login:${req.headers.get("x-forwarded-for") ?? "local"}`, 20, 15 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return genericAuthError();

  const email = normalizeEmail(parsed.data.email);
  const user = await prisma.user.findUnique({ where: { email } });

  // Always run a verify against a real or DUMMY_HASH so the DOMINANT cost (the
  // Argon2id verify) is paid on every path — this equalizes the primary timing
  // channel between unknown-email and known-email. NOTE (honest scope): a
  // successful login additionally does resetFailedLogins + createSession
  // (two extra DB round-trips), so a determined attacker with many samples
  // could still statistically separate "valid credentials" from "unknown
  // email" by end-to-end latency. That residual channel is narrow and
  // high-noise; the response BODY is identical (genericAuthError) on every
  // failure, so there is no cheap enumeration oracle.
  const hash = user?.passwordHash ?? DUMMY_HASH;
  const passwordOk = await verifyPassword(hash, parsed.data.passphrase);

  if (!user || !user.passwordHash) return genericAuthError();

  // Suspended (Wave 9): reject with the SAME generic body — no suspension oracle
  // on login (enumeration resistance). Distinct from the lockout time window below.
  if (user.suspendedAt) return genericAuthError();

  // Lockout is a time window. If still active, reject. If it EXPIRED, reset the
  // failed count so the user starts fresh (see documented semantics in lib/auth/lockout.ts).
  if (isLocked(user)) return genericAuthError();
  if (user.lockedUntil !== null) {
    // lockedUntil set but no longer in the future → lock expired; clear the counter before re-checking.
    await resetFailedLogins(user.id);
  }

  if (!passwordOk) {
    await registerFailedLogin(user.id);
    return genericAuthError();
  }

  await resetFailedLogins(user.id);

  // Wave 14 — require-passkey step-up: when enabled (and the account still has
  // a passkey — never lock out an account whose last passkey was removed), a
  // correct password DOES NOT issue a session. The client is told to finish
  // with the standard passkey ceremony, which issues the session itself. This
  // fires only AFTER a correct password, so it leaks nothing to enumeration.
  if (user.passkey2faEnabled) {
    const passkeys = await prisma.webAuthnCredential.count({ where: { userId: user.id } });
    if (passkeys > 0) {
      return json({ ok: true, twoFactor: true });
    }
  }

  const { token } = await createSession(user.id, {
    userAgent: req.headers.get("user-agent") ?? undefined,
  });
  return withSessionCookie(json({ ok: true, next: "/dashboard" }), token);
}
