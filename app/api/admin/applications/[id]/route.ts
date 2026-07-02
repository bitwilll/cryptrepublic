import "server-only";
import { prisma } from "@/lib/db";
import { json } from "@/lib/http/responses";
import { guardAdminGet } from "@/lib/admin/routeGuard";
import { resolveApplicantAddress } from "@/lib/applications/applicant";

/**
 * GET /api/admin/applications/[id] — full application detail incl. the witness
 * signatures (PUBLIC data: checksummed addresses + EIP-712 signatures). The
 * client-cache columns are grouped under `chainCache` with an explicit
 * `chainDerived: true` label — SEALED state is chain-derived, never admin-set
 * (constraint #6).
 *
 * Wave 10 A4: the payload ALSO carries `resolvedMintTo` — the LIVE
 * `resolveApplicantAddress(userId)` resolution (verified LinkedWallet,
 * checksummed, or null). This is the SAME source the approve-mint route uses
 * for the mint `to`; the UI gates the admin-mint affordance on THIS field,
 * NEVER on the stored `applicantAddress` column (a witness-request-time
 * snapshot — null for the witness-free case, stale otherwise).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const actor = await guardAdminGet(req);
  if (actor instanceof Response) return actor;

  const { id } = await params;
  const app = await prisma.citizenshipApplication.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      status: true,
      kycStatus: true,
      reviewNote: true,
      name: true,
      domicileCity: true,
      hostCountry: true,
      motto: true,
      oathAcceptedAt: true,
      applicantAddress: true,
      witnessNonce: true,
      witnessDeadline: true,
      sealTxHash: true,
      citizenTokenId: true,
      sealedAt: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { email: true, name: true } },
      witnessSignatures: {
        select: {
          id: true,
          witnessAddress: true,
          signature: true,
          nonce: true,
          deadline: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!app) return json({ error: "Not found." }, { status: 404 });

  const { sealTxHash, citizenTokenId, sealedAt, ...rest } = app;
  return json({
    application: {
      ...rest,
      // LIVE verified-wallet resolution — the mint-gate source (== approve-mint's `to`).
      resolvedMintTo: await resolveApplicantAddress(app.userId),
      chainCache: {
        chainDerived: true as const, // client-reported cache — the chain is authoritative
        sealTxHash,
        citizenTokenId,
        sealedAt,
      },
    },
  });
}
