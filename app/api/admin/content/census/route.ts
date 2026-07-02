import "server-only";
import { prisma } from "@/lib/db";
import { json, badRequest } from "@/lib/http/responses";
import { guardAdminGet, guardAdminMutation } from "@/lib/admin/routeGuard";
import { writeAudit } from "@/lib/admin/audit";
import { censusSchema } from "@/lib/validation/admin";

/**
 * /api/admin/content/census — CityCensus CRUD (collection). seededCount stays a
 * labeled SEEDED SNAPSHOT (the UI tags are UI-level and STAY — constraint #7);
 * live per-city population is aggregated from minted citizens, never from here.
 */

export async function GET(req: Request): Promise<Response> {
  const actor = await guardAdminGet(req);
  if (actor instanceof Response) return actor;
  const census = await prisma.cityCensus.findMany({ orderBy: { code: "asc" } });
  return json({ census });
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
  const parsed = censusSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the census fields.");

  const existing = await prisma.cityCensus.findUnique({ where: { code: parsed.data.code } });
  if (existing) return badRequest("A census node with this code already exists.");

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.cityCensus.create({ data: parsed.data });
    await writeAudit(tx, {
      actorUserId: actor.user.id,
      actorLabel: actor.actorLabel,
      action: "content.census.create",
      targetType: "CENSUS",
      targetId: row.code,
      after: row,
      userAgent: actor.userAgent,
    });
    return row;
  });

  return json({ ok: true, census: created });
}
