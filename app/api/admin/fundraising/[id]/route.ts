import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { json, badRequest } from "@/lib/http/responses";
import { guardAdminMutation } from "@/lib/admin/routeGuard";
import { writeAudit } from "@/lib/admin/audit";

/**
 * POST /api/admin/fundraising/[id] (Wave 16) — the fundraising decision
 * machine. Transitions:
 *
 *   approve: SUBMITTED → ACTIVE     (sets decidedBy/decidedAt)
 *   decline: SUBMITTED → DECLINED   (note REQUIRED, 400 without)
 *   close:   ACTIVE    → CLOSED
 *
 * Anything else is a 400; an unknown project is a 404. Every decision stamps
 * decidedBy/decidedAt and writes its AuditLog row IN THE SAME transaction
 * (Wave 9 convention). REGISTRY STATE ONLY — approving or closing a project
 * moves no funds; pledges settle wallet-to-wallet outside the Republic.
 */

const DECISION_ACTIONS = ["approve", "decline", "close"] as const;
type DecisionAction = (typeof DECISION_ACTIONS)[number];

const decisionSchema = z
  .object({
    action: z.enum(DECISION_ACTIONS),
    note: z.string().min(3).max(500).optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.action === "decline" && d.note === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["note"],
        message: "A decline requires a review note.",
      });
    }
  });

const TRANSITIONS: Record<DecisionAction, { from: string; to: string }> = {
  approve: { from: "SUBMITTED", to: "ACTIVE" },
  decline: { from: "SUBMITTED", to: "DECLINED" },
  close: { from: "ACTIVE", to: "CLOSED" },
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const actor = await guardAdminMutation(req, {
    keyPrefix: "admin-fundraising",
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
  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) {
    const custom = parsed.error.issues.find((i) => i.code === "custom");
    return badRequest(custom?.message ?? "Please check the decision fields.");
  }
  const { action, note } = parsed.data;

  const { id } = await params;
  const before = await prisma.fundraisingProject.findUnique({ where: { id } });
  if (!before) return json({ error: "Not found." }, { status: 404 });

  const transition = TRANSITIONS[action];
  if (before.status !== transition.from) {
    return badRequest(`A ${before.status} project cannot be ${action}d.`);
  }

  const after = await prisma.$transaction(async (tx) => {
    const updated = await tx.fundraisingProject.update({
      where: { id },
      data: {
        status: transition.to,
        decidedBy: actor.user.id,
        decidedAt: new Date(),
        ...(note !== undefined ? { reviewNote: note } : {}),
      },
    });
    await writeAudit(tx, {
      actorUserId: actor.user.id,
      actorLabel: actor.actorLabel,
      action: `fundraising.${action}`,
      targetType: "FUNDRAISING_PROJECT",
      targetId: id,
      before,
      after: updated,
      userAgent: actor.userAgent,
    });
    return updated;
  });

  return json({
    ok: true,
    project: {
      id: after.id,
      status: after.status,
      reviewNote: after.reviewNote,
      decidedBy: after.decidedBy,
      decidedAt: after.decidedAt === null ? null : after.decidedAt.toISOString(),
    },
  });
}
