import "server-only";
import { prisma } from "@/lib/db";
import { json } from "@/lib/http/responses";
import { guardAdminMutation } from "@/lib/admin/routeGuard";
import { writeAudit } from "@/lib/admin/audit";

/**
 * DELETE /api/admin/content/comments/[id] — comment moderation. The deleted
 * comment's BODY is preserved in the audit row's beforeJson (constraint #7 —
 * moderation never silently destroys the record of what was said).
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const actor = await guardAdminMutation(req, {
    keyPrefix: "admin-content",
    limit: 60,
    windowMs: 5 * 60_000,
  });
  if (actor instanceof Response) return actor;

  const { id } = await params;
  const before = await prisma.proposalComment.findUnique({ where: { id } });
  if (!before) return json({ error: "Not found." }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.proposalComment.delete({ where: { id } });
    await writeAudit(tx, {
      actorUserId: actor.user.id,
      actorLabel: actor.actorLabel,
      action: "content.comment.delete",
      targetType: "COMMENT",
      targetId: id,
      before, // the removed body lives on in beforeJson
      userAgent: actor.userAgent,
    });
  });

  return json({ ok: true });
}
