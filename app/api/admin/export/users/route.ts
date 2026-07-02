import "server-only";
import { prisma } from "@/lib/db";
import { guardAdminGet, USER_SELECT } from "@/lib/admin/routeGuard";
import { toCsv, USERS_EXPORT_COLUMNS } from "@/lib/admin/csv";
import { csvResponse, auditExport } from "../shared";

/**
 * GET /api/admin/export/users — the full users report as CSV (field-allowlisted
 * via USER_SELECT / USERS_EXPORT_COLUMNS, so passwordHash can NEVER leak). A
 * READ, but AUDITED (admin.export.users, targetType EXPORT) before the body
 * returns. guardAdminGet with a per-admin rate limit (exports scan the table).
 */
const EXPORT_LIMIT = { keyPrefix: "admin-export", limit: 10, windowMs: 5 * 60_000 };

export async function GET(req: Request): Promise<Response> {
  const actor = await guardAdminGet(req, EXPORT_LIMIT);
  if (actor instanceof Response) return actor;

  const rows = await prisma.user.findMany({
    select: USER_SELECT,
    orderBy: { createdAt: "asc" },
    take: 50_000,
  });
  const csv = toCsv(rows, USERS_EXPORT_COLUMNS);
  await auditExport(actor, "users", rows.length);
  return csvResponse(csv, "users");
}
