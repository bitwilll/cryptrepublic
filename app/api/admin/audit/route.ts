import "server-only";
import { prisma } from "@/lib/db";
import { json, badRequest } from "@/lib/http/responses";
import { guardAdminGet, parseListQuery } from "@/lib/admin/routeGuard";

/**
 * GET /api/admin/audit?action=&actorUserId=&page=&pageSize= — the read-only
 * audit trail, newest first. Rows are returned as stored: before/afterJson were
 * written through the serializer allowlist (lib/admin/audit.ts) and can never
 * contain passwordHash/tokenHash.
 */
export async function GET(req: Request): Promise<Response> {
  const actor = await guardAdminGet(req);
  if (actor instanceof Response) return actor;

  const url = new URL(req.url);
  const pq = parseListQuery(url);
  if (!pq) return badRequest("Invalid pagination.");
  const action = url.searchParams.get("action");
  const actorUserId = url.searchParams.get("actorUserId");
  const where = {
    ...(action ? { action } : {}),
    ...(actorUserId ? { actorUserId } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pq.page - 1) * pq.pageSize,
      take: pq.pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return json({ rows, page: pq.page, pageSize: pq.pageSize, total });
}
