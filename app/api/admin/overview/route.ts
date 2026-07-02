import "server-only";
import { prisma } from "@/lib/db";
import { json } from "@/lib/http/responses";
import { guardAdminGet } from "@/lib/admin/routeGuard";
import { APP_STATUS_ORDER } from "@/lib/applications/state";

/**
 * GET /api/admin/overview — dashboard counts (users / applications-by-status /
 * content rows per model / flags) + the 10 most recent audit rows. Audit rows
 * are returned as stored: their before/afterJson snapshots were written through
 * the serializer allowlist and can never contain passwordHash/tokenHash.
 */
export async function GET(req: Request): Promise<Response> {
  const actor = await guardAdminGet(req);
  if (actor instanceof Response) return actor;

  const [
    totalUsers,
    suspendedUsers,
    adminUsers,
    appGroups,
    assets,
    embassies,
    census,
    allocations,
    constitution,
    proposalContent,
    comments,
    flags,
    recentAudit,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { suspendedAt: { not: null } } }),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.citizenshipApplication.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.assetCatalogEntry.count(),
    prisma.embassyDirectory.count(),
    prisma.cityCensus.count(),
    prisma.treasuryAllocation.count(),
    prisma.constitutionText.count(),
    prisma.governanceProposalContent.count(),
    prisma.proposalComment.count(),
    prisma.featureFlag.count(),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  const applications: Record<string, number> = {};
  for (const s of APP_STATUS_ORDER) applications[s] = 0;
  for (const g of appGroups) {
    applications[g.status] = g._count._all;
  }

  return json({
    users: { total: totalUsers, suspended: suspendedUsers, admins: adminUsers },
    applications,
    content: { assets, embassies, census, allocations, constitution, proposalContent, comments },
    flags,
    recentAudit,
  });
}
