import "server-only";
import { prisma } from "@/lib/db";
import { json, badRequest } from "@/lib/http/responses";
import { guardAdminMutation, USER_SELECT } from "@/lib/admin/routeGuard";
import { writeAudit } from "@/lib/admin/audit";
import { trustAdjustSchema } from "@/lib/validation/admin";

/**
 * POST /api/admin/users/[id]/trust — body { adjustment: -100..100 }.
 * SETS the ABSOLUTE signed trust adjustment folded into the hybrid trust score
 * (clamp(computed + adminAdjustment, 0, 100) keeps the score in range). Absolute
 * (not incremental) → re-posting is idempotent; every POST writes a fresh
 * `trust.adjust` audit row (before→after). Standard admin guard stack + a single
 * $transaction (update + audit). The adjustment is the ONLY persisted trust
 * input — the rest of the score is computed on read; it is never citizenship.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const actor = await guardAdminMutation(req, {
    keyPrefix: "admin-trust",
    limit: 20,
    windowMs: 5 * 60_000,
  });
  if (actor instanceof Response) return actor;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const parsed = trustAdjustSchema.safeParse(body);
  if (!parsed.success)
    return badRequest("Trust adjustment must be an integer between -100 and 100.");

  const { id } = await params;
  const select = { ...USER_SELECT, trustAdjustment: true } as const;
  const before = await prisma.user.findUnique({ where: { id }, select });
  if (!before) return json({ error: "Not found." }, { status: 404 });

  const after = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id },
      data: { trustAdjustment: parsed.data.adjustment },
      select,
    });
    await writeAudit(tx, {
      actorUserId: actor.user.id,
      actorLabel: actor.actorLabel,
      action: "trust.adjust",
      targetType: "USER",
      targetId: id,
      before,
      after: updated,
      userAgent: actor.userAgent,
    });
    return updated;
  });

  return json({ ok: true, trustAdjustment: after.trustAdjustment });
}
