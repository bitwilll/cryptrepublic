import "server-only";
import { prisma } from "@/lib/db";
import { json, badRequest } from "@/lib/http/responses";
import { guardAdminMutation } from "@/lib/admin/routeGuard";
import { writeAudit } from "@/lib/admin/audit";
import { constitutionSchema } from "@/lib/validation/admin";

/** /api/admin/content/constitution/[key] — item update/delete (body key must match the path). */

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ key: string }> },
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
  const parsed = constitutionSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the constitution fields.");
  const { key } = await params;
  if (parsed.data.key !== key) return badRequest("The body key must match the path key.");

  const before = await prisma.constitutionText.findUnique({ where: { key } });
  if (!before) return json({ error: "Not found." }, { status: 404 });

  const after = await prisma.$transaction(async (tx) => {
    const row = await tx.constitutionText.update({
      where: { key },
      data: { ...parsed.data, citation: parsed.data.citation ?? null },
    });
    await writeAudit(tx, {
      actorUserId: actor.user.id,
      actorLabel: actor.actorLabel,
      action: "content.constitution.update",
      targetType: "CONSTITUTION",
      targetId: key,
      before,
      after: row,
      userAgent: actor.userAgent,
    });
    return row;
  });

  return json({ ok: true, entry: after });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ key: string }> },
): Promise<Response> {
  const actor = await guardAdminMutation(req, {
    keyPrefix: "admin-content",
    limit: 60,
    windowMs: 5 * 60_000,
  });
  if (actor instanceof Response) return actor;

  const { key } = await params;
  const before = await prisma.constitutionText.findUnique({ where: { key } });
  if (!before) return json({ error: "Not found." }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.constitutionText.delete({ where: { key } });
    await writeAudit(tx, {
      actorUserId: actor.user.id,
      actorLabel: actor.actorLabel,
      action: "content.constitution.delete",
      targetType: "CONSTITUTION",
      targetId: key,
      before,
      userAgent: actor.userAgent,
    });
  });

  return json({ ok: true });
}
