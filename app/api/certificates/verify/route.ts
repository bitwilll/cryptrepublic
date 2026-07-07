import "server-only";
import { recoverMessageAddress, getAddress } from "viem";
import { prisma } from "@/lib/db";
import { canonicalPayload } from "@/lib/certificates/canonical";
import { certificateSerialSchema } from "@/lib/validation/certificates";
import { json, badRequest } from "@/lib/http/responses";
import type { CertificateKind } from "@/lib/services/types";

/**
 * GET /api/certificates/verify?serial=… — PUBLIC verification (Wave 15 —
 * Identity): no session, no origin gate (read-only public record). Returns the
 * certificate's public fields plus:
 *   - signatureValid: the stored signature recovered over the REBUILT
 *     canonical payload equals the stored signer (pure cryptography — no
 *     chain call, no trust in the write path).
 *   - signerHeldPassportRecord: whether the signer's linked account HELD a
 *     sealed-passport RECORD at our cached `citizenTokenId` (an off-chain
 *     cache — named honestly; it is NOT a live chain read).
 * 404 for an unknown serial.
 */
export async function GET(req: Request): Promise<Response> {
  const serial = new URL(req.url).searchParams.get("serial") ?? "";
  if (!certificateSerialSchema.safeParse(serial.trim().toUpperCase()).success) {
    return badRequest("Provide a certificate serial (CR-YYYY-XXXXXX).");
  }

  const cert = await prisma.signedCertificate.findUnique({
    where: { serial: serial.trim().toUpperCase() },
  });
  if (!cert) return json({ error: "Certificate not found." }, { status: 404 });

  // Recompute the recovery — correctness over trust in the stored row.
  let signatureValid = false;
  try {
    const recovered = await recoverMessageAddress({
      message: canonicalPayload({
        kind: cert.kind as CertificateKind,
        title: cert.title,
        subject: cert.subject,
        contentHash: cert.contentHash,
      }),
      signature: cert.signature as `0x${string}`,
    });
    signatureValid = getAddress(recovered) === getAddress(cert.signerAddress);
  } catch {
    signatureValid = false;
  }

  // Cached passport RECORD of the signer's account (no chain call — honest name).
  const wallet = await prisma.linkedWallet.findUnique({
    where: { address: cert.signerAddress },
    select: { userId: true },
  });
  let signerHeldPassportRecord = false;
  if (wallet) {
    const application = await prisma.citizenshipApplication.findUnique({
      where: { userId: wallet.userId },
      select: { citizenTokenId: true },
    });
    signerHeldPassportRecord = application?.citizenTokenId != null;
  }

  return json({
    serial: cert.serial,
    kind: cert.kind,
    title: cert.title,
    subject: cert.subject,
    contentHash: cert.contentHash,
    signerAddress: cert.signerAddress,
    signature: cert.signature,
    issuedAt: cert.createdAt,
    revoked: cert.revokedAt != null,
    revokedAt: cert.revokedAt,
    signatureValid,
    signerHeldPassportRecord,
  });
}
