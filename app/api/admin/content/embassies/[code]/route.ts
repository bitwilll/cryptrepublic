import "server-only";
import { prisma } from "@/lib/db";
import { json, badRequest } from "@/lib/http/responses";
import { guardAdminMutation } from "@/lib/admin/routeGuard";
import { writeAudit } from "@/lib/admin/audit";
import { embassySchema } from "@/lib/validation/admin";

/** /api/admin/content/embassies/[code] — item update/delete (body code must match the path). */

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const actor = await guardAdminMutation(req, {
    keyPrefix: "admin-content",
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
  const parsed = embassySchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the embassy fields.");
  const { code } = await params;
  if (parsed.data.code !== code) return badRequest("The body code must match the path code.");

  const before = await prisma.embassyDirectory.findUnique({ where: { code } });
  if (!before) return json({ error: "Not found." }, { status: 404 });

  const after = await prisma.$transaction(async (tx) => {
    const row = await tx.embassyDirectory.update({ where: { code }, data: parsed.data });
    await writeAudit(tx, {
      actorUserId: actor.user.id,
      actorLabel: actor.actorLabel,
      action: "content.embassy.update",
      targetType: "EMBASSY",
      targetId: code,
      before,
      after: row,
      userAgent: actor.userAgent,
    });
    return row;
  });

  return json({ ok: true, embassy: after });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const actor = await guardAdminMutation(req, {
    keyPrefix: "admin-content",
    limit: 60,
    windowMs: 5 * 60_000,
  });
  if (actor instanceof Response) return actor;

  const { code } = await params;
  const before = await prisma.embassyDirectory.findUnique({ where: { code } });
  if (!before) return json({ error: "Not found." }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.embassyDirectory.delete({ where: { code } });
    await writeAudit(tx, {
      actorUserId: actor.user.id,
      actorLabel: actor.actorLabel,
      action: "content.embassy.delete",
      targetType: "EMBASSY",
      targetId: code,
      before,
      userAgent: actor.userAgent,
    });
  });

  return json({ ok: true });
}
