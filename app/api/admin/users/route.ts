import "server-only";
import { prisma } from "@/lib/db";
import { json, badRequest } from "@/lib/http/responses";
import { guardAdminGet, parseListQuery, USER_SELECT } from "@/lib/admin/routeGuard";

/**
 * GET /api/admin/users?q=&page=&pageSize= — paginated list + search (email OR
 * name contains). Select-ALLOWLISTED fields only — NEVER passwordHash
 * (constraint #4; the route test asserts on the serialized body).
 */
export async function GET(req: Request): Promise<Response> {
  const actor = await guardAdminGet(req);
  if (actor instanceof Response) return actor;

  const url = new URL(req.url);
  const pq = parseListQuery(url);
  if (!pq) return badRequest("Invalid pagination.");
  const q = url.searchParams.get("q");
  const where = q ? { OR: [{ email: { contains: q } }, { name: { contains: q } }] } : {};

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: { ...USER_SELECT, _count: { select: { sessions: true } } },
      orderBy: { createdAt: "desc" },
      skip: (pq.page - 1) * pq.pageSize,
      take: pq.pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  const users = rows.map(({ _count, ...u }) => ({ ...u, sessionCount: _count.sessions }));
  return json({ users, page: pq.page, pageSize: pq.pageSize, total });
}
