import "server-only";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { rateLimit } from "@/lib/auth/ratelimit";
import { verifySiweSignature, SiweError } from "@/lib/auth/siwe";
import { siweVerifySchema } from "@/lib/validation/auth";
import { json, badRequest, forbidden, tooManyRequests } from "@/lib/http/responses";

/**
 * POST /api/wallet/link — verify a wallet FOR THE LOGGED-IN ACCOUNT (SIWE
 * proof of key possession). This closes the gap where an email-registered
 * user could never satisfy `resolveApplicantAddress` (witness requests AND the
 * Wave-10 admin-mint override both resolve the mint/attestation destination
 * from a VERIFIED LinkedWallet — never a typed address).
 *
 * The SIWE core (domain/uri/chain binding + signature + single-use nonce) is
 * the SAME verifier the SIWE login uses — possession of the key is proven,
 * not asserted. Rules:
 *  - address already linked to ANOTHER account → 409 (a wallet belongs to one
 *    citizen; no silent re-parenting).
 *  - already linked to THIS account → verifiedAt refreshed (idempotent).
 *  - otherwise → created verified for this account.
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

  const rl = rateLimit(`wallet-link:${userId}`, 10, 15 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const parsed = siweVerifySchema.safeParse(body);
  if (!parsed.success) return badRequest();

  let address: string;
  try {
    ({ address } = await verifySiweSignature(parsed.data.message, parsed.data.signature));
  } catch (e) {
    if (e instanceof SiweError) return badRequest("Wallet signature verification failed.");
    throw e;
  }

  const existing = await prisma.linkedWallet.findUnique({ where: { address } });
  if (existing && existing.userId !== userId) {
    return json({ error: "This wallet is already linked to another account." }, { status: 409 });
  }
  if (existing) {
    await prisma.linkedWallet.update({ where: { address }, data: { verifiedAt: new Date() } });
  } else {
    await prisma.linkedWallet.create({
      data: { userId, address, chain: "EVM", verifiedAt: new Date() },
    });
  }
  return json({ ok: true, address });
}
