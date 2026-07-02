import "server-only";
import { prisma } from "@/lib/db";
import { json, badRequest } from "@/lib/http/responses";
import { guardAdminMutation } from "@/lib/admin/routeGuard";
import { writeAudit } from "@/lib/admin/audit";
import { censusSchema } from "@/lib/validation/admin";

/** /api/admin/content/census/[code] — item update/delete (body code must match the path). */

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
  const parsed = censusSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the census fields.");
  const { code } = await params;
  if (parsed.data.code !== code) return badRequest("The body code must match the path code.");

  const before = await prisma.cityCensus.findUnique({ where: { code } });
  if (!before) return json({ error: "Not found." }, { status: 404 });

  const after = await prisma.$transaction(async (tx) => {
    const row = await tx.cityCensus.update({ where: { code }, data: parsed.data });
    await writeAudit(tx, {
      actorUserId: actor.user.id,
      actorLabel: actor.actorLabel,
      action: "content.census.update",
      targetType: "CENSUS",
      targetId: code,
      before,
      after: row,
      userAgent: actor.userAgent,
    });
    return row;
  });

  return json({ ok: true, census: after });
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
  const before = await prisma.cityCensus.findUnique({ where: { code } });
  if (!before) return json({ error: "Not found." }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.cityCensus.delete({ where: { code } });
    await writeAudit(tx, {
      actorUserId: actor.user.id,
      actorLabel: actor.actorLabel,
      action: "content.census.delete",
      targetType: "CENSUS",
      targetId: code,
      before,
      userAgent: actor.userAgent,
    });
  });

  return json({ ok: true });
}
