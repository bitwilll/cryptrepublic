import "server-only";
import { SiweMessage } from "siwe";
import { prisma } from "@/lib/db";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { rateLimit } from "@/lib/auth/ratelimit";
import { verifySiweSignature, SiweError } from "@/lib/auth/siwe";
import { resolveUserByWalletAddress } from "@/lib/referrals/lookup";
import { loadPendingChallenge } from "@/lib/auth/qrLogin/challenge";
import { qrApproveSchema } from "@/lib/validation/qrLogin";
import { json, badRequest, forbidden, tooManyRequests } from "@/lib/http/responses";

// Opaque wording for "no such / already used / expired / suspended" — no
// existence-or-suspension oracle for device B.
const INVALID = "This login request is no longer valid.";

/**
 * POST /api/auth/qr/approve — device B (holds the wallet) approves a login it
 * scanned. It proves key possession with a SIWE signature (the SAME core the
 * SIWE login uses: domain/uri/chain bound + single-use nonce consumed), binds
 * that signature to THIS challenge (`siwe.nonce === challenge.nonce`), resolves
 * the recovered address to an EXISTING verified-wallet account (NEVER creates
 * one), rejects a suspended user, and atomically marks the challenge approved.
 * Device B receives no session — only device A's status poll does.
 */
export async function POST(req: Request): Promise<Response> {
  if (!isAllowedOrigin(req)) return forbidden();
  const rl = rateLimit(
    `qr-approve:${req.headers.get("x-forwarded-for") ?? "local"}`,
    30,
    5 * 60_000,
  );
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const parsed = qrApproveSchema.safeParse(body);
  if (!parsed.success) return badRequest();

  // Load BEFORE verify so an already-approved/expired challenge is rejected
  // without burning the wallet's SIWE nonce.
  const challenge = await loadPendingChallenge(parsed.data.challengeId);
  if (!challenge) return badRequest(INVALID);

  let address: string;
  try {
    ({ address } = await verifySiweSignature(parsed.data.message, parsed.data.signature));
  } catch (e) {
    if (e instanceof SiweError) return badRequest("Wallet signature verification failed.");
    throw e;
  }

  // Bind the signature to THIS challenge (the SIWE nonce IS the challenge nonce).
  let siweNonce: string;
  try {
    siweNonce = new SiweMessage(parsed.data.message).nonce;
  } catch {
    return badRequest("Wallet signature verification failed.");
  }
  if (siweNonce !== challenge.nonce) {
    return badRequest("This signature is for a different login request.");
  }

  // EXISTING account with a VERIFIED wallet only — QR login never creates one.
  const userId = await resolveUserByWalletAddress(address);
  if (!userId) return badRequest("No CryptRepublic account is linked to that wallet.");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { suspendedAt: true },
  });
  if (!user || user.suspendedAt) return badRequest(INVALID);

  // Atomic single-use approve: still pending + unexpired → approved + bound.
  const res = await prisma.walletLoginChallenge.updateMany({
    where: { id: challenge.id, status: "pending", expiresAt: { gt: new Date() } },
    data: { status: "approved", userId },
  });
  if (res.count === 0) return badRequest(INVALID);

  return json({ ok: true, matchCode: challenge.matchCode });
}
