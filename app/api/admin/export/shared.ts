import "server-only";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/admin/audit";
import type { AdminActor } from "@/lib/admin/routeGuard";

/**
 * Shared helpers for the three Wave-10 CSV export routes
 * (users / applications / audit). Exports are READS with no natural mutation
 * target, so each writes its audit row (action admin.export.<kind>, targetType
 * EXPORT) in a standalone transaction BEFORE the body returns — audited but not
 * bound to a mutation (constraint #4 permits this for exports).
 */

export type ExportKind = "users" | "applications" | "audit";

/** Build the download Response with a text/csv body + attachment filename. */
export function csvResponse(csv: string, kind: ExportKind): Response {
  const date = new Date().toISOString().slice(0, 10); // yyyy-mm-dd
  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="cryptrepublic-${kind}-${date}.csv"`,
      "cache-control": "no-store",
    },
  });
}

/** Write the audit row for an export (EXPORT target, tiny allowlist). */
export async function auditExport(
  actor: AdminActor,
  kind: ExportKind,
  rowCount: number,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await writeAudit(tx, {
      actorUserId: actor.user.id,
      actorLabel: actor.actorLabel,
      action: `admin.export.${kind}`,
      targetType: "EXPORT",
      targetId: kind,
      after: { kind, rowCount, requestedAt: new Date() },
      userAgent: actor.userAgent,
    });
  });
}
