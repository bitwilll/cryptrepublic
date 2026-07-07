import "server-only";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { json, badRequest, forbidden } from "@/lib/http/responses";

/**
 * POST /api/certificates/[serial]/revoke — the AUTHOR withdraws a certificate
 * (Wave 15 — Identity). Revocation is a public state flip (`revokedAt`), never
 * a delete: the record stays verifiable so /verify can honestly answer
 * REVOKED. Author-only (403 for anyone else — serials are public, so a 403
 * leaks nothing 404 wouldn't); revoking twice is a 400.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ serial: string }> },
): Promise<Response> {
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

  const { serial } = await params;
  if (!serial) return badRequest();

  const cert = await prisma.signedCertificate.findUnique({ where: { serial } });
  if (!cert) return json({ error: "Certificate not found." }, { status: 404 });
  if (cert.authorUserId !== userId) return forbidden();
  if (cert.revokedAt) return badRequest("Certificate already revoked.");

  const updated = await prisma.signedCertificate.update({
    where: { serial },
    data: { revokedAt: new Date() },
  });

  return json({ ok: true, serial: updated.serial, revokedAt: updated.revokedAt });
}
