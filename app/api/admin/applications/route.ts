import "server-only";
import { prisma } from "@/lib/db";
import { json, badRequest } from "@/lib/http/responses";
import { guardAdminGet, parseListQuery } from "@/lib/admin/routeGuard";
import { APP_STATUS_ORDER, type AppStatus } from "@/lib/applications/state";

/**
 * GET /api/admin/applications?status=&page=&pageSize= — list by status with the
 * user's email/name joined (allowlisted). `status` validates against the REAL
 * forward-only machine (lib/applications/state.ts APP_STATUS_ORDER), NOT the
 * stale APPLICATION_STATUSES union in lib/auth/types.ts (divergence noted in
 * the plan — do not "fix" it this wave).
 */
export async function GET(req: Request): Promise<Response> {
  const actor = await guardAdminGet(req);
  if (actor instanceof Response) return actor;

  const url = new URL(req.url);
  const pq = parseListQuery(url);
  if (!pq) return badRequest("Invalid pagination.");
  const status = url.searchParams.get("status");
  if (status !== null && !APP_STATUS_ORDER.includes(status as AppStatus)) {
    return badRequest("Unknown application status.");
  }
  const where = status ? { status } : {};

  // The user email/name join is done by hand (two queries + merge) instead of a
  // required-relation include: an include throws "Field user is required to
  // return data, got null" when a user (cascade-deleting their application) is
  // removed between the two engine queries — a real concurrent-admin scenario.
  const [rows, total] = await Promise.all([
    prisma.citizenshipApplication.findMany({
      where,
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
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      skip: (pq.page - 1) * pq.pageSize,
      take: pq.pageSize,
    }),
    prisma.citizenshipApplication.count({ where }),
  ]);
  const owners = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.userId))] } },
    select: { id: true, email: true, name: true },
  });
  const ownerById = new Map(owners.map((u) => [u.id, { email: u.email, name: u.name }]));
  const applications = rows.map((r) => ({
    ...r,
    user: ownerById.get(r.userId) ?? { email: null, name: null },
  }));

  return json({ applications, page: pq.page, pageSize: pq.pageSize, total });
}
