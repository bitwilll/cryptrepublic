import "server-only";
import { prisma } from "@/lib/db";
import { guardAdminGet } from "@/lib/admin/routeGuard";
import { toCsv, APPLICATIONS_EXPORT_COLUMNS } from "@/lib/admin/csv";
import { csvResponse, auditExport } from "../shared";

/**
 * GET /api/admin/export/applications — the citizenship applications report as
 * CSV. PUBLIC application fields only (incl. the Wave-10 off-chain-intent
 * adminApprovedAt/adminApprovedBy columns); never a token. Audited as
 * admin.export.applications (EXPORT target) before the body returns.
 */
const EXPORT_LIMIT = { keyPrefix: "admin-export", limit: 10, windowMs: 5 * 60_000 };

export async function GET(req: Request): Promise<Response> {
  const actor = await guardAdminGet(req, EXPORT_LIMIT);
  if (actor instanceof Response) return actor;

  const rows = await prisma.citizenshipApplication.findMany({
    select: {
      id: true,
      userId: true,
      status: true,
      kycStatus: true,
      name: true,
      domicileCity: true,
      hostCountry: true,
      motto: true,
      applicantAddress: true,
      adminApprovedAt: true,
      adminApprovedBy: true,
      reviewNote: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "asc" },
    take: 50_000,
  });
  const csv = toCsv(rows, APPLICATIONS_EXPORT_COLUMNS);
  await auditExport(actor, "applications", rows.length);
  return csvResponse(csv, "applications");
}
