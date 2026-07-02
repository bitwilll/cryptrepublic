import "server-only";
import { prisma } from "@/lib/db";
import { json, badRequest } from "@/lib/http/responses";
import { guardAdminMutation, USER_SELECT } from "@/lib/admin/routeGuard";
import { writeAudit } from "@/lib/admin/audit";
import { kycSetSchema } from "@/lib/validation/admin";

/**
 * POST /api/admin/users/[id]/kyc — body { kycStatus: KycStatus }. The schema has
 * NO `role` field: a body containing `role` is 400 by `.strict()` — there is no
 * promotion path through any admin API (constraint #2).
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
  const parsed = kycSetSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the kycStatus field.");

  const { id } = await params;
  const before = await prisma.user.findUnique({ where: { id }, select: USER_SELECT });
  if (!before) return json({ error: "Not found." }, { status: 404 });

  const after = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id },
      data: { kycStatus: parsed.data.kycStatus },
      select: USER_SELECT,
    });
    await writeAudit(tx, {
      actorUserId: actor.user.id,
      actorLabel: actor.actorLabel,
      action: "user.kyc.set",
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
