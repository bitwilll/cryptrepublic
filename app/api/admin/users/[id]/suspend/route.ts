import "server-only";
import { prisma } from "@/lib/db";
import { json, badRequest } from "@/lib/http/responses";
import { guardAdminMutation, USER_SELECT } from "@/lib/admin/routeGuard";
import { writeAudit } from "@/lib/admin/audit";
import { suspendSchema } from "@/lib/validation/admin";

/**
 * POST /api/admin/users/[id]/suspend — body { suspended: boolean }.
 *
 * suspended:true → ONE $transaction: set suspendedAt + delete ALL of the user's
 * sessions + audit `user.suspend` (constraint #5). The session deleteMany is the
 * transactional TWIN of revokeAllForUser (same where-clause) — inlined because
 * revokeAllForUser uses the GLOBAL prisma client, not this tx.
 * suspended:false → clear suspendedAt + audit `user.unsuspend`.
 *
 * Guard: an admin cannot suspend THEMSELVES (400 — prevents self-lockout).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const actor = await guardAdminMutation(req, {
    keyPrefix: "admin-users",
    limit: 30,
    windowMs: 5 * 60_000,
  });
  if (actor instanceof Response) return actor;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const parsed = suspendSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the suspend fields.");

  const { id } = await params;
  if (parsed.data.suspended && id === actor.user.id) {
    return badRequest("You cannot suspend your own account.");
  }

  const before = await prisma.user.findUnique({ where: { id }, select: USER_SELECT });
  if (!before) return json({ error: "Not found." }, { status: 404 });

  const after = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id },
      data: { suspendedAt: parsed.data.suspended ? new Date() : null },
      select: USER_SELECT,
    });
    if (parsed.data.suspended) {
      await tx.session.deleteMany({ where: { userId: id } }); // revokeAllForUser, transactional
    }
    await writeAudit(tx, {
      actorUserId: actor.user.id,
      actorLabel: actor.actorLabel,
      action: parsed.data.suspended ? "user.suspend" : "user.unsuspend",
      targetType: "USER",
      targetId: id,
      before,
      after: updated,
      userAgent: actor.userAgent,
    });
    return updated;
  });

  return json({ ok: true, user: after });
}
