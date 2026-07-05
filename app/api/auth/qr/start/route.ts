import { isAllowedOrigin } from "@/lib/auth/csrf";
import { rateLimit } from "@/lib/auth/ratelimit";
import { appHost, appUri } from "@/lib/auth/siwe";
import { activeChain } from "@/lib/config/chain";
import { createChallenge } from "@/lib/auth/qrLogin/challenge";
import { json, forbidden, tooManyRequests } from "@/lib/http/responses";

/**
 * POST /api/auth/qr/start — device A (UNAUTHENTICATED) opens a cross-device
 * wallet-QR login. Creates a single-use, short-TTL challenge and returns ONLY
 * the PUBLIC fields device A needs to render the QR + matchCode. No secret
 * leaves the server; the session is issued later, on device A's OWN status
 * poll — never here.
 */
export async function POST(req: Request): Promise<Response> {
  if (!isAllowedOrigin(req)) return forbidden();
  const rl = rateLimit(`qr-start:${req.headers.get("x-forwarded-for") ?? "local"}`, 30, 5 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  const { challengeId, nonce, matchCode } = await createChallenge();
  return json({
    challengeId,
    nonce,
    matchCode,
    domain: appHost(),
    uri: appUri(),
    chainId: activeChain().primaryChainId,
  });
}
