import "server-only";
import type { InsuranceApplication } from "@prisma/client";
import { prisma } from "@/lib/db";
import { json, badRequest } from "@/lib/http/responses";
import { guardAdminMutation } from "@/lib/admin/routeGuard";
import { writeAudit } from "@/lib/admin/audit";
import { insuranceReviewSchema, type InsuranceReviewAction } from "@/lib/validation/estate";

/**
 * PATCH /api/admin/services/insurance/[id] (Wave 15 C) — review-state machine
 * for a cover application. Transitions:
 *
 *   review:  SUBMITTED             → IN_REVIEW
 *   approve: SUBMITTED | IN_REVIEW → APPROVED
 *   decline: SUBMITTED | IN_REVIEW → DECLINED   (reviewNote REQUIRED, 3..500)
 *
 * APPROVED/DECLINED are terminal (a re-decision is a 400). The update and its
 * audit row commit in ONE transaction (Wave 9 convention). Registry-state
 * only — approving cover moves no funds and collects no premium.
 */

const TRANSITIONS: Record<InsuranceReviewAction, { from: readonly string[]; to: string }> = {
  review: { from: ["SUBMITTED"], to: "IN_REVIEW" },
  approve: { from: ["SUBMITTED", "IN_REVIEW"], to: "APPROVED" },
  decline: { from: ["SUBMITTED", "IN_REVIEW"], to: "DECLINED" },
};

function serialize(a: InsuranceApplication) {
  return { ...a, valueUsd: a.valueUsd === null ? null : a.valueUsd.toString() };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const actor = await guardAdminMutation(req, {
    keyPrefix: "admin-services",
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
  const parsed = insuranceReviewSchema.safeParse(body);
  if (!parsed.success) {
    const custom = parsed.error.issues.find((i) => i.code === "custom");
    return badRequest(custom?.message ?? "Please check the review fields.");
  }
  const { action, reviewNote } = parsed.data;

  const { id } = await params;
  const before = await prisma.insuranceApplication.findUnique({ where: { id } });
  if (!before) return json({ error: "Not found." }, { status: 404 });

  const transition = TRANSITIONS[action];
  if (!transition.from.includes(before.status)) {
    return badRequest(`A ${before.status} application cannot be ${action}ed.`);
  }

  const after = await prisma.$transaction(async (tx) => {
    const updated = await tx.insuranceApplication.update({
      where: { id },
      data: {
        status: transition.to,
        ...(reviewNote !== undefined ? { reviewNote } : {}),
      },
    });
    await writeAudit(tx, {
      actorUserId: actor.user.id,
      actorLabel: actor.actorLabel,
      action: `insurance.${action}`,
      targetType: "INSURANCE_APPLICATION",
      targetId: id,
      before,
      after: updated,
      userAgent: actor.userAgent,
    });
    return updated;
  });

  return json({ ok: true, application: serialize(after) });
}
