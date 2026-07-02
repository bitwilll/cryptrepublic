import "server-only";
import { prisma } from "@/lib/db";
import { guardAdminGet } from "@/lib/admin/routeGuard";
import { toCsv, AUDIT_EXPORT_COLUMNS } from "@/lib/admin/csv";
import { csvResponse, auditExport } from "../shared";

/**
 * GET /api/admin/export/audit — the audit log report as CSV. beforeJson/afterJson
 * are ALREADY allowlist-serialized (lib/admin/audit.ts) so they carry no secret;
 * exported verbatim. Audited as admin.export.audit (EXPORT target) before the
 * body returns. Newest last for a stable, append-friendly report.
 */
const EXPORT_LIMIT = { keyPrefix: "admin-export", limit: 10, windowMs: 5 * 60_000 };

export async function GET(req: Request): Promise<Response> {
  const actor = await guardAdminGet(req, EXPORT_LIMIT);
  if (actor instanceof Response) return actor;

  const rows = await prisma.auditLog.findMany({
    select: {
      id: true,
      actorLabel: true,
      action: true,
      targetType: true,
      targetId: true,
      beforeJson: true,
      afterJson: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
    take: 50_000,
  });
  const csv = toCsv(rows, AUDIT_EXPORT_COLUMNS);
  await auditExport(actor, "audit", rows.length);
  return csvResponse(csv, "audit");
}
