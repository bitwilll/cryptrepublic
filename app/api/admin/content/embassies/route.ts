import "server-only";
import { prisma } from "@/lib/db";
import { json, badRequest } from "@/lib/http/responses";
import { guardAdminGet, guardAdminMutation } from "@/lib/admin/routeGuard";
import { writeAudit } from "@/lib/admin/audit";
import { embassySchema } from "@/lib/validation/admin";

/** /api/admin/content/embassies — EmbassyDirectory CRUD (collection). */

export async function GET(req: Request): Promise<Response> {
  const actor = await guardAdminGet(req);
  if (actor instanceof Response) return actor;
  const embassies = await prisma.embassyDirectory.findMany({ orderBy: { code: "asc" } });
  return json({ embassies });
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
  const parsed = embassySchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the embassy fields.");

  const existing = await prisma.embassyDirectory.findUnique({
    where: { code: parsed.data.code },
  });
  if (existing) return badRequest("An embassy with this code already exists.");

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.embassyDirectory.create({ data: parsed.data });
    await writeAudit(tx, {
      actorUserId: actor.user.id,
      actorLabel: actor.actorLabel,
      action: "content.embassy.create",
      targetType: "EMBASSY",
      targetId: row.code,
      after: row,
      userAgent: actor.userAgent,
    });
    return row;
  });

  return json({ ok: true, embassy: created });
}
