import "server-only";
import { prisma } from "@/lib/db";
import { json, badRequest } from "@/lib/http/responses";
import { guardAdminGet, guardAdminMutation } from "@/lib/admin/routeGuard";
import { writeAudit } from "@/lib/admin/audit";
import { flagSchema } from "@/lib/validation/admin";
import { FLAG_DEFAULTS } from "@/lib/flags/defaults";

/**
 * /api/admin/flags — FeatureFlag admin CRUD. GET returns the DB rows PLUS the
 * declared defaults so the UI can show EFFECTIVE values (missing row → the
 * declared default; undeclared key → false). POST is an upsert (+ flag.upsert
 * audit — before only when a row existed).
 */

export async function GET(req: Request): Promise<Response> {
  const actor = await guardAdminGet(req);
  if (actor instanceof Response) return actor;
  const flags = await prisma.featureFlag.findMany({ orderBy: { key: "asc" } });
  return json({ flags, defaults: FLAG_DEFAULTS });
}

export async function POST(req: Request): Promise<Response> {
  const actor = await guardAdminMutation(req, {
    keyPrefix: "admin-flags",
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
  const parsed = flagSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the flag fields.");
  const data = parsed.data;

  const before = await prisma.featureFlag.findUnique({ where: { key: data.key } });
  const after = await prisma.$transaction(async (tx) => {
    const row = await tx.featureFlag.upsert({
      where: { key: data.key },
      update: { enabled: data.enabled, description: data.description ?? null },
      create: { key: data.key, enabled: data.enabled, description: data.description ?? null },
    });
    await writeAudit(tx, {
      actorUserId: actor.user.id,
      actorLabel: actor.actorLabel,
      action: "flag.upsert",
      targetType: "FLAG",
      targetId: data.key,
      ...(before ? { before } : {}),
      after: row,
      userAgent: actor.userAgent,
    });
    return row;
  });

  return json({ ok: true, flag: after });
}
