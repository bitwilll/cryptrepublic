import "server-only";
import { randomUUID } from "node:crypto";
import { recoverMessageAddress, getAddress } from "viem";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { canonicalPayload, sha256HexOfText } from "@/lib/certificates/canonical";
import { certificateSerial } from "@/lib/certificates/serial";
import { certificateCreateSchema } from "@/lib/validation/certificates";
import { json, badRequest, forbidden } from "@/lib/http/responses";

/**
 * POST /api/certificates — record a wallet-signed certificate (Wave 15 —
 * Identity). The signature was produced CLIENT-SIDE by the citizen's own
 * wallet over the canonical payload; the server REBUILDS that payload from
 * the submitted fields and recovers the signer with viem — the recovered
 * address must be one of the session user's VERIFIED LinkedWallet addresses
 * (possession was proven at link time via SIWE; the certificate signature
 * proves it again for this exact payload). For MESSAGE certificates the
 * content hash is additionally recomputed from the message text server-side.
 * Stores ONLY public data (title, subject, hash, address, signature) — never
 * a key, seed, or file byte. GET — the caller's own certificates, newest
 * first.
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const parsed = certificateCreateSchema.safeParse(body);
  if (!parsed.success) return badRequest();
  const { kind, title, subject, contentHash, signature } = parsed.data;

  // MESSAGE mode is fully server-checkable: the content IS the subject text.
  if (kind === "MESSAGE" && (await sha256HexOfText(subject)) !== contentHash.toLowerCase()) {
    return badRequest("Content hash does not match the message text.");
  }

  const payload = canonicalPayload({ kind, title, subject, contentHash });
  let signerAddress: string;
  try {
    signerAddress = getAddress(
      await recoverMessageAddress({ message: payload, signature: signature as `0x${string}` }),
    );
  } catch {
    return badRequest("Signature does not match a linked wallet.");
  }

  const wallet = await prisma.linkedWallet.findUnique({ where: { address: signerAddress } });
  if (!wallet || wallet.userId !== userId || !wallet.verifiedAt) {
    return badRequest("Signature does not match a linked wallet.");
  }

  // The id is generated HERE so the serial (a pure derivation of the id) can be
  // written in the same insert — `serial` is NOT NULL + unique.
  const id = randomUUID();
  const cert = await prisma.signedCertificate.create({
    data: {
      id,
      serial: certificateSerial(id, new Date()),
      authorUserId: userId,
      kind,
      title,
      subject,
      contentHash: contentHash.toLowerCase(),
      signerAddress,
      signature,
    },
  });

  return json({
    ok: true,
    certificate: {
      serial: cert.serial,
      kind: cert.kind,
      title: cert.title,
      subject: cert.subject,
      contentHash: cert.contentHash,
      signerAddress: cert.signerAddress,
      signature: cert.signature,
      issuedAt: cert.createdAt,
      revokedAt: cert.revokedAt,
    },
  });
}

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

  const rows = await prisma.signedCertificate.findMany({
    where: { authorUserId: userId },
    orderBy: { createdAt: "desc" },
  });

  return json({
    certificates: rows.map((c) => ({
      serial: c.serial,
      kind: c.kind,
      title: c.title,
      subject: c.subject,
      contentHash: c.contentHash,
      signerAddress: c.signerAddress,
      signature: c.signature,
      issuedAt: c.createdAt,
      revokedAt: c.revokedAt,
    })),
  });
}
