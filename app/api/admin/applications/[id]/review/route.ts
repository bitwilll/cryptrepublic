import "server-only";
import { prisma } from "@/lib/db";
import { json, badRequest } from "@/lib/http/responses";
import { guardAdminMutation } from "@/lib/admin/routeGuard";
import { writeAudit } from "@/lib/admin/audit";
import { applicationReviewSchema } from "@/lib/validation/admin";

/**
 * POST /api/admin/applications/[id]/review — body { kycStatus?, reviewNote? }
 * (at least one). OFF-CHAIN-HONEST (constraint #6): the `.strict()` schema
 * carries NO `status`/`citizenTokenId`/`sealTxHash` — a body containing any of
 * them is 400 by strictness. Admin review can never fake chain state; SEALED
 * remains chain-derived.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const actor = await guardAdminMutation(req, {
    keyPrefix: "admin-apps",
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
  const parsed = applicationReviewSchema.safeParse(body);
  if (!parsed.success) return badRequest("Provide kycStatus and/or reviewNote — nothing else.");

  const { id } = await params;
  const before = await prisma.citizenshipApplication.findUnique({ where: { id } });
  if (!before) return json({ error: "Not found." }, { status: 404 });

  const after = await prisma.$transaction(async (tx) => {
    const updated = await tx.citizenshipApplication.update({
      where: { id },
      data: {
        ...(parsed.data.kycStatus !== undefined ? { kycStatus: parsed.data.kycStatus } : {}),
        ...(parsed.data.reviewNote !== undefined ? { reviewNote: parsed.data.reviewNote } : {}),
      },
    });
    await writeAudit(tx, {
      actorUserId: actor.user.id,
      actorLabel: actor.actorLabel,
      action: "application.review",
      targetType: "APPLICATION",
      targetId: id,
      before,
      after: updated,
      userAgent: actor.userAgent,
    });
    return updated;
  });

  return json({
    ok: true,
    application: {
      id: after.id,
      status: after.status,
      kycStatus: after.kycStatus,
      reviewNote: after.reviewNote,
    },
  });
}
