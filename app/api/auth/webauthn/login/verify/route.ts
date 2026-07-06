import "server-only";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import { prisma } from "@/lib/db";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { rateLimit } from "@/lib/auth/ratelimit";
import { createSession } from "@/lib/auth/session";
import {
  rpId,
  expectedOrigins,
  consumeChallenge,
  challengeFromClientData,
  publicKeyFromString,
  transportsFromString,
} from "@/lib/auth/webauthn/core";
import { webauthnLoginVerifySchema } from "@/lib/validation/webauthn";
import {
  json,
  badRequest,
  forbidden,
  tooManyRequests,
  withSessionCookie,
} from "@/lib/http/responses";

// ONE generic 401 for every auth-flavored failure (unknown credential, failed
// verify, suspended, stale challenge) — no credential/suspension oracle.
function passkeyAuthError(): Response {
  return json({ error: "Passkey sign-in failed." }, { status: 401 });
}

/**
 * POST /api/auth/webauthn/login/verify — complete a passkey sign-in
 * (UNAUTHENTICATED). Consumes the single-use challenge from the response's own
 * clientDataJSON, resolves the credential by the id the authenticator returned,
 * cryptographically verifies the assertion against the STORED PUBLIC KEY,
 * rejects a suspended user (generic), persists the new signature counter, and
 * issues the session — the same success tail as password login.
 */
export async function POST(req: Request): Promise<Response> {
  if (!isAllowedOrigin(req)) return forbidden();
  const rl = rateLimit(
    `webauthn-login:${req.headers.get("x-forwarded-for") ?? "local"}`,
    30,
    15 * 60_000,
  );
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const parsed = webauthnLoginVerifySchema.safeParse(body);
  if (!parsed.success) return badRequest();

  const challenge = challengeFromClientData(parsed.data.response.response.clientDataJSON);
  if (!challenge) return badRequest();
  if (!(await consumeChallenge(challenge, "authentication"))) return passkeyAuthError();

  const credential = await prisma.webAuthnCredential.findUnique({
    where: { credentialId: parsed.data.response.id },
    include: { user: { select: { id: true, suspendedAt: true } } },
  });
  if (!credential) return passkeyAuthError();

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: parsed.data.response as unknown as AuthenticationResponseJSON,
      expectedChallenge: challenge,
      expectedOrigin: expectedOrigins(),
      expectedRPID: rpId(),
      credential: {
        id: credential.credentialId,
        publicKey: publicKeyFromString(credential.publicKey),
        counter: Number(credential.counter),
        transports: transportsFromString(credential.transports) as
          | AuthenticatorTransportFuture[]
          | undefined,
      },
    });
  } catch {
    return passkeyAuthError();
  }
  if (!verification.verified) return passkeyAuthError();
  if (credential.user.suspendedAt) return passkeyAuthError();

  await prisma.webAuthnCredential.update({
    where: { id: credential.id },
    data: {
      counter: BigInt(verification.authenticationInfo.newCounter),
      lastUsedAt: new Date(),
    },
  });

  const { token } = await createSession(credential.user.id, {
    userAgent: req.headers.get("user-agent") ?? undefined,
  });
  return withSessionCookie(json({ ok: true, next: "/dashboard" }), token);
}
