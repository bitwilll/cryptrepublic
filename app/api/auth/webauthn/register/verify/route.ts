import "server-only";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { rateLimit } from "@/lib/auth/ratelimit";
import {
  rpId,
  expectedOrigins,
  consumeChallenge,
  challengeFromClientData,
  publicKeyToString,
  transportsToString,
} from "@/lib/auth/webauthn/core";
import { webauthnRegisterVerifySchema } from "@/lib/validation/webauthn";
import { json, badRequest, forbidden, tooManyRequests } from "@/lib/http/responses";

/**
 * POST /api/auth/webauthn/register/verify — finish enrolling a passkey for the
 * LOGGED-IN account. Consumes the user-bound single-use challenge (taken from
 * the response's own clientDataJSON, so the verify is bound to exactly the
 * ceremony we issued), verifies the attestation, and stores ONLY public data:
 * the credential id, COSE public key, counter, and metadata.
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

  const rl = rateLimit(`webauthn-reg:${userId}`, 20, 15 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const parsed = webauthnRegisterVerifySchema.safeParse(body);
  if (!parsed.success) return badRequest();

  const challenge = challengeFromClientData(parsed.data.response.response.clientDataJSON);
  if (!challenge) return badRequest("Malformed passkey response.");
  if (!(await consumeChallenge(challenge, "registration", userId))) {
    return badRequest("This passkey enrollment is no longer valid — start again.");
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: parsed.data.response as unknown as RegistrationResponseJSON,
      expectedChallenge: challenge,
      expectedOrigin: expectedOrigins(),
      expectedRPID: rpId(),
    });
  } catch {
    return badRequest("Passkey verification failed.");
  }
  if (!verification.verified || !verification.registrationInfo) {
    return badRequest("Passkey verification failed.");
  }

  const info = verification.registrationInfo;
  try {
    const row = await prisma.webAuthnCredential.create({
      data: {
        credentialId: info.credential.id,
        userId,
        publicKey: publicKeyToString(info.credential.publicKey),
        counter: BigInt(info.credential.counter),
        transports: transportsToString(info.credential.transports),
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp,
        label: parsed.data.label?.trim() || null,
      },
    });
    return json({
      ok: true,
      credential: {
        id: row.credentialId,
        label: row.label,
        deviceType: row.deviceType,
        backedUp: row.backedUp,
        createdAt: row.createdAt.toISOString(),
      },
    });
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") {
      return json({ error: "This passkey is already registered." }, { status: 409 });
    }
    throw e;
  }
}
