import "server-only";
import { prisma } from "@/lib/db";
import { json, badRequest } from "@/lib/http/responses";
import { guardAdminGet, guardAdminMutation } from "@/lib/admin/routeGuard";
import { writeAudit } from "@/lib/admin/audit";
import { constitutionSchema } from "@/lib/validation/admin";

/** /api/admin/content/constitution — ConstitutionText CRUD (collection, keyed by `key`). */

export async function GET(req: Request): Promise<Response> {
  const actor = await guardAdminGet(req);
  if (actor instanceof Response) return actor;
  const entries = await prisma.constitutionText.findMany({ orderBy: { key: "asc" } });
  return json({ entries });
}

export async function POST(req: Request): Promise<Response> {
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

  const existing = await prisma.constitutionText.findUnique({
    where: { key: parsed.data.key },
  });
  if (existing) return badRequest("A constitution entry with this key already exists.");

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.constitutionText.create({
      data: { ...parsed.data, citation: parsed.data.citation ?? null },
    });
    await writeAudit(tx, {
      actorUserId: actor.user.id,
      actorLabel: actor.actorLabel,
      action: "content.constitution.create",
      targetType: "CONSTITUTION",
      targetId: row.key,
      after: row,
      userAgent: actor.userAgent,
    });
    return row;
  });

  return json({ ok: true, entry: created });
}
