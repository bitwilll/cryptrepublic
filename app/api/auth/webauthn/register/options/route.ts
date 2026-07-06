import "server-only";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { rateLimit } from "@/lib/auth/ratelimit";
import { RP_NAME, rpId, storeChallenge, transportsFromString } from "@/lib/auth/webauthn/core";
import { json, forbidden, tooManyRequests } from "@/lib/http/responses";

/**
 * POST /api/auth/webauthn/register/options — begin enrolling a passkey for the
 * LOGGED-IN account. Issues browser ceremony options with a single-use,
 * user-bound challenge. `residentKey: "required"` makes the credential
 * discoverable so passkey sign-in works usernameless later.
 */
export async function POST(req: Request): Promise<Response> {
  if (!isAllowedOrigin(req)) return forbidden();

  let userId: string;
  let email: string | null;
  try {
    const { user } = await requireSession(req);
    userId = user.id;
    email = user.email;
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }

  const rl = rateLimit(`webauthn-reg:${userId}`, 20, 15 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  const existing = await prisma.webAuthnCredential.findMany({
    where: { userId },
    select: { credentialId: true, transports: true },
  });

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rpId(),
    userName: email ?? `citizen-${userId.slice(0, 8)}`,
    userID: new TextEncoder().encode(userId), // stable, opaque user handle
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: transportsFromString(c.transports) as AuthenticatorTransportFuture[] | undefined,
    })),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });

  await storeChallenge(options.challenge, "registration", userId);
  return json({ options });
}
