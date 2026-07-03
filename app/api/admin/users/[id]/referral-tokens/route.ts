import "server-only";
import { prisma } from "@/lib/db";
import { json, badRequest } from "@/lib/http/responses";
import { guardAdminMutation, USER_SELECT } from "@/lib/admin/routeGuard";
import { writeAudit } from "@/lib/admin/audit";
import { referralTokenAllocateSchema } from "@/lib/validation/admin";

/**
 * POST /api/admin/users/[id]/referral-tokens — body { delta: 1..1000 }.
 * ADD-ONLY allocation of the off-chain referral-token quota (a User Int
 * counter — NOT an ERC-20). ONE $transaction: increment referralTokenBalance +
 * write a `referral.token.allocate` audit row (targetType USER). Guarded by the
 * standard admin stack (origin → requireAdmin → per-admin rate limit → strict
 * Zod); no secret column can serialize (the allowlist gates it).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const actor = await guardAdminMutation(req, {
    keyPrefix: "admin-referral-tokens",
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
  const parsed = referralTokenAllocateSchema.safeParse(body);
  if (!parsed.success) return badRequest("Allocate a positive number of tokens (1–1000).");

  const { id } = await params;
  const select = { ...USER_SELECT, referralTokenBalance: true } as const;
  const before = await prisma.user.findUnique({ where: { id }, select });
  if (!before) return json({ error: "Not found." }, { status: 404 });

  const after = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id },
      data: { referralTokenBalance: { increment: parsed.data.delta } },
      select,
    });
    await writeAudit(tx, {
      actorUserId: actor.user.id,
      actorLabel: actor.actorLabel,
      action: "referral.token.allocate",
      targetType: "USER",
      targetId: id,
      before,
      after: updated,
      userAgent: actor.userAgent,
    });
    return updated;
  });

  return json({ ok: true, referralTokenBalance: after.referralTokenBalance });
}
