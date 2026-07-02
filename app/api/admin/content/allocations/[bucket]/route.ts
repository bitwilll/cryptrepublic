import "server-only";
import { prisma } from "@/lib/db";
import { json, badRequest } from "@/lib/http/responses";
import { guardAdminMutation } from "@/lib/admin/routeGuard";
import { writeAudit } from "@/lib/admin/audit";
import { allocationSchema } from "@/lib/validation/admin";

/**
 * /api/admin/content/allocations/[bucket] — item update/delete. The sum rule
 * (sum of all OTHER rows + the new targetBps ≤ 10000) runs INSIDE the
 * transaction (constraint #7, AllocationOverflow mirror).
 */

const OVERFLOW_MSG = "Allocation targets exceed 100%.";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ bucket: string }> },
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
  const parsed = allocationSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the allocation fields.");
  const { bucket } = await params;
  if (parsed.data.bucket !== bucket) {
    return badRequest("The body bucket must match the path bucket.");
  }

  const before = await prisma.treasuryAllocation.findUnique({ where: { bucket } });
  if (!before) return json({ error: "Not found." }, { status: 404 });

  try {
    const after = await prisma.$transaction(async (tx) => {
      const others = await tx.treasuryAllocation.aggregate({
        where: { bucket: { not: bucket } },
        _sum: { targetBps: true },
      });
      if ((others._sum.targetBps ?? 0) + parsed.data.targetBps > 10_000) {
        throw new Error(OVERFLOW_MSG);
      }
      const row = await tx.treasuryAllocation.update({ where: { bucket }, data: parsed.data });
      await writeAudit(tx, {
        actorUserId: actor.user.id,
        actorLabel: actor.actorLabel,
        action: "content.allocation.update",
        targetType: "ALLOCATION",
        targetId: bucket,
        before,
        after: row,
        userAgent: actor.userAgent,
      });
      return row;
    });
    return json({ ok: true, allocation: after });
  } catch (e) {
    if (e instanceof Error && e.message === OVERFLOW_MSG) return badRequest(OVERFLOW_MSG);
    throw e;
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ bucket: string }> },
): Promise<Response> {
  const actor = await guardAdminMutation(req, {
    keyPrefix: "admin-content",
    limit: 60,
    windowMs: 5 * 60_000,
  });
  if (actor instanceof Response) return actor;

  const { bucket } = await params;
  const before = await prisma.treasuryAllocation.findUnique({ where: { bucket } });
  if (!before) return json({ error: "Not found." }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.treasuryAllocation.delete({ where: { bucket } });
    await writeAudit(tx, {
      actorUserId: actor.user.id,
      actorLabel: actor.actorLabel,
      action: "content.allocation.delete",
      targetType: "ALLOCATION",
      targetId: bucket,
      before,
      userAgent: actor.userAgent,
    });
  });

  return json({ ok: true });
}
