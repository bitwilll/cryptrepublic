import "server-only";
import { prisma } from "@/lib/db";
import { json, badRequest } from "@/lib/http/responses";
import { guardAdminMutation, SESSION_SELECT, USER_SELECT } from "@/lib/admin/routeGuard";
import { writeAudit } from "@/lib/admin/audit";
import { sessionsRevokeSchema } from "@/lib/validation/admin";

/**
 * POST /api/admin/users/[id]/sessions/revoke — body { sessionId } XOR { all: true }.
 *
 * OWNERSHIP BINDING (post-review addendum #1): the single-session delete pins
 * BOTH the session id AND the path user id — `deleteMany({ id, userId })` — and
 * returns 404 when zero rows match, so an admin can never revoke ANOTHER user's
 * session under a mismatched audit target.
 *
 * Audit: targetType SESSION (targetId = sessionId, before = the allowlisted
 * session row) for single; targetType USER (targetId = userId, before = the
 * allowlisted user snapshot — the serializer is per-record, so the bulk row
 * snapshots the TARGET USER, not each session) for {all:true}.
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
  const parsed = sessionsRevokeSchema.safeParse(body);
  if (!parsed.success) return badRequest("Provide { sessionId } or { all: true }.");

  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id }, select: USER_SELECT });
  if (!target) return json({ error: "Not found." }, { status: 404 });

  if ("sessionId" in parsed.data) {
    const sessionId = parsed.data.sessionId;
    const revoked = await prisma.$transaction(async (tx) => {
      const row = await tx.session.findFirst({
        where: { id: sessionId, userId: id }, // ownership-bound lookup
        select: { ...SESSION_SELECT, userId: true },
      });
      if (!row) return null;
      const del = await tx.session.deleteMany({ where: { id: sessionId, userId: id } });
      if (del.count === 0) return null;
      await writeAudit(tx, {
        actorUserId: actor.user.id,
        actorLabel: actor.actorLabel,
        action: "user.sessions.revoke",
        targetType: "SESSION",
        targetId: sessionId,
        before: row,
        userAgent: actor.userAgent,
      });
      return del.count;
    });
    if (revoked === null) return json({ error: "Not found." }, { status: 404 });
    return json({ ok: true, revoked });
  }

  const revoked = await prisma.$transaction(async (tx) => {
    const del = await tx.session.deleteMany({ where: { userId: id } });
    await writeAudit(tx, {
      actorUserId: actor.user.id,
      actorLabel: actor.actorLabel,
      action: "user.sessions.revoke",
      targetType: "USER",
      targetId: id,
      before: target,
      userAgent: actor.userAgent,
    });
    return del.count;
  });
  return json({ ok: true, revoked });
}
