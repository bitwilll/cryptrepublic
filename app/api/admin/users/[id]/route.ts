import "server-only";
import { prisma } from "@/lib/db";
import { json } from "@/lib/http/responses";
import { guardAdminGet, SESSION_SELECT, USER_SELECT } from "@/lib/admin/routeGuard";

/**
 * GET /api/admin/users/[id] — per-user detail. Sessions expose ONLY
 * id/userAgent/ipHash/createdAt/expiresAt (NEVER tokenHash — constraint #4).
 * The application's client-cache columns (sealTxHash/citizenTokenId/sealedAt)
 * are grouped under `chainCache` with an explicit `chainDerived: true` label —
 * the chain, not this payload, is authoritative (constraint #6).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const actor = await guardAdminGet(req);
  if (actor instanceof Response) return actor;

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      ...USER_SELECT,
      sessions: { select: SESSION_SELECT, orderBy: { createdAt: "desc" } },
      linkedWallets: { select: { address: true, chain: true, verifiedAt: true } },
      application: {
        select: {
          id: true,
          status: true,
          kycStatus: true,
          reviewNote: true,
          name: true,
          domicileCity: true,
          hostCountry: true,
          motto: true,
          applicantAddress: true,
          sealTxHash: true,
          citizenTokenId: true,
          sealedAt: true,
        },
      },
    },
  });
  if (!user) return json({ error: "Not found." }, { status: 404 });

  const { sessions, linkedWallets, application, ...profile } = user;
  return json({
    user: profile,
    sessions,
    linkedWallets,
    application: application
      ? {
          id: application.id,
          status: application.status,
          kycStatus: application.kycStatus,
          reviewNote: application.reviewNote,
          name: application.name,
          domicileCity: application.domicileCity,
          hostCountry: application.hostCountry,
          motto: application.motto,
          applicantAddress: application.applicantAddress,
          chainCache: {
            chainDerived: true as const, // client-reported cache — the chain is authoritative
            sealTxHash: application.sealTxHash,
            citizenTokenId: application.citizenTokenId,
            sealedAt: application.sealedAt,
          },
        }
      : null,
  });
}
