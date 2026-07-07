import "server-only";
import { getAddress, recoverMessageAddress, type Hex } from "viem";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { json, badRequest, forbidden } from "@/lib/http/responses";
import { bitwillFileSchema } from "@/lib/validation/estate";
import { canonicalBitwillPayload, directiveHashOf } from "@/lib/bitwill/canonical";

/**
 * /api/bitwill (Wave 15 A) — the BitWill estate registry.
 *
 * A directive is a wallet-signed OFF-CHAIN declaration of intent: it names a
 * beneficiary for the citizen's estate record and can never hold or move
 * funds. The wallet signs CLIENT-SIDE; this route stores only public data
 * (addresses, the signature, hashes) and verifies EIP-191 recovery of the
 * canonical payload against one of the session user's VERIFIED LinkedWallet
 * addresses — a signature from an unlinked or unverified wallet is rejected.
 *
 * POST files a directive: in ONE transaction any existing ACTIVE directive is
 * marked SUPERSEDED and the new one is filed ACTIVE (at most one ACTIVE per
 * citizen, atomically). GET returns the caller's full directive history.
 */

export async function GET(req: Request): Promise<Response> {
  let userId: string;
  try {
    ({
      user: { id: userId },
    } = await requireSession(req));
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }

  const directives = await prisma.bitwillDirective.findMany({
    where: { ownerUserId: userId },
    orderBy: { createdAt: "desc" },
  });
  return json({ directives });
}

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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const parsed = bitwillFileSchema.safeParse(body);
  if (!parsed.success) {
    // Surface the non-custodial guard verbatim; every other schema failure is generic.
    const custom = parsed.error.issues.find((i) => i.code === "custom");
    return badRequest(custom?.message ?? "Please check the directive fields.");
  }
  const { beneficiaryName, beneficiaryContact, beneficiaryAddress, assetsMemo, signature } =
    parsed.data;
  const signerAddress = getAddress(parsed.data.signerAddress);

  // Rebuild the EXACT canonical payload the wallet signed and verify recovery.
  const payload = canonicalBitwillPayload({
    owner: signerAddress,
    beneficiaryName,
    beneficiaryContact,
    ...(beneficiaryAddress ? { beneficiaryAddress } : {}),
    assetsMemo,
  });
  let recovered: string;
  try {
    recovered = await recoverMessageAddress({ message: payload, signature: signature as Hex });
  } catch {
    return badRequest("The signature does not match the directive.");
  }
  if (getAddress(recovered) !== signerAddress) {
    return badRequest("The signature does not match the directive.");
  }

  // The signer must be one of the CALLER'S verified wallets (public addresses
  // only — the server never sees or wants key material).
  const linked = await prisma.linkedWallet.findFirst({
    where: { userId, address: signerAddress, verifiedAt: { not: null } },
    select: { id: true },
  });
  if (!linked) {
    return badRequest("Sign with a wallet that is verified for your account.");
  }

  const directiveHash = directiveHashOf(payload);
  const directive = await prisma.$transaction(async (tx) => {
    await tx.bitwillDirective.updateMany({
      where: { ownerUserId: userId, status: "ACTIVE" },
      data: { status: "SUPERSEDED" },
    });
    return tx.bitwillDirective.create({
      data: {
        ownerUserId: userId,
        beneficiaryName,
        beneficiaryContact,
        beneficiaryAddress: beneficiaryAddress ? getAddress(beneficiaryAddress) : null,
        assetsMemo,
        directiveHash,
        signerAddress,
        signature,
        status: "ACTIVE",
      },
    });
  });

  return json({ ok: true, directive });
}
