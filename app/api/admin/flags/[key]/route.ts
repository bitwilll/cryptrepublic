import "server-only";
import { prisma } from "@/lib/db";
import { json } from "@/lib/http/responses";
import { guardAdminMutation } from "@/lib/admin/routeGuard";
import { writeAudit } from "@/lib/admin/audit";

/**
 * DELETE /api/admin/flags/[key] — removes the row (consumers fall back to the
 * DECLARED default). The deleted row is preserved in the audit's beforeJson.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ key: string }> },
): Promise<Response> {
  const actor = await guardAdminMutation(req, {
    keyPrefix: "admin-flags",
    limit: 30,
    windowMs: 5 * 60_000,
  });
  if (actor instanceof Response) return actor;

  const { key } = await params;
  const before = await prisma.featureFlag.findUnique({ where: { key } });
  if (!before) return json({ error: "Not found." }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.featureFlag.delete({ where: { key } });
    await writeAudit(tx, {
      actorUserId: actor.user.id,
      actorLabel: actor.actorLabel,
      action: "flag.delete",
      targetType: "FLAG",
      targetId: key,
      before,
      userAgent: actor.userAgent,
    });
  });

  return json({ ok: true });
}
