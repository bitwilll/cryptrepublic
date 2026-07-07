import "server-only";
import { prisma } from "@/lib/db";
import { json, badRequest } from "@/lib/http/responses";
import { guardAdminMutation } from "@/lib/admin/routeGuard";
import { writeAudit } from "@/lib/admin/audit";
import { storeRemoveSchema } from "@/lib/validation/estate";

/**
 * PATCH /api/admin/services/store/[id] (Wave 15 C) — listing MODERATION, not
 * deletion: { action: "remove", reason } sets status REMOVED and preserves the
 * row (what was said lives on in the audit snapshots — the comment-moderation
 * precedent). The reason is required (3..300) and recorded on the audit
 * after-snapshot as `removedReason`. Removing an already-REMOVED listing is a
 * 400. Update + audit commit in ONE transaction.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const actor = await guardAdminMutation(req, {
    keyPrefix: "admin-services",
    limit: 60,
    windowMs: 5 * 60_000,
  });
  if (actor instanceof Response) return actor;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const parsed = storeRemoveSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the removal fields.");
  const { reason } = parsed.data;

  const { id } = await params;
  const before = await prisma.storeListing.findUnique({ where: { id } });
  if (!before) return json({ error: "Not found." }, { status: 404 });
  if (before.status === "REMOVED") return badRequest("This listing is already removed.");

  const after = await prisma.$transaction(async (tx) => {
    const updated = await tx.storeListing.update({
      where: { id },
      data: { status: "REMOVED" },
    });
    await writeAudit(tx, {
      actorUserId: actor.user.id,
      actorLabel: actor.actorLabel,
      action: "listing.remove",
      targetType: "STORE_LISTING",
      targetId: id,
      before,
      after: { ...updated, removedReason: reason },
      userAgent: actor.userAgent,
    });
    return updated;
  });

  return json({ ok: true, listing: after });
}
