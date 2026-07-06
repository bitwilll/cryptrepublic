import "server-only";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { rateLimit } from "@/lib/auth/ratelimit";
import { rpId, storeChallenge } from "@/lib/auth/webauthn/core";
import { json, forbidden, tooManyRequests } from "@/lib/http/responses";

/**
 * POST /api/auth/webauthn/login/options — begin a passkey sign-in
 * (UNAUTHENTICATED). Empty allowCredentials → the browser offers the user's
 * discoverable passkeys for this rpID; identity comes from the credential the
 * authenticator returns, verified server-side. The challenge is single-use.
 */
export async function POST(req: Request): Promise<Response> {
  if (!isAllowedOrigin(req)) return forbidden();
  const rl = rateLimit(
    `webauthn-login:${req.headers.get("x-forwarded-for") ?? "local"}`,
    30,
    15 * 60_000,
  );
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  const options = await generateAuthenticationOptions({
    rpID: rpId(),
    allowCredentials: [],
    userVerification: "preferred",
  });
  await storeChallenge(options.challenge, "authentication");
  return json({ options });
}
