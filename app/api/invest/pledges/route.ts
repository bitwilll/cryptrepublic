import "server-only";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { json, badRequest, forbidden } from "@/lib/http/responses";
import { pledgeSchema } from "@/lib/validation/invest";

/**
 * GET /api/invest/pledges — the caller's OWN pledge ledger (MY PLEDGES tab):
 * every pledge row they hold, any status, newest activity first, each with
 * the project's title/status/goal for context. Session-gated; only ever the
 * caller's rows.
 *
 * POST /api/invest/pledges — record or amend a pledge of intent. Session +
 * origin gated; pledgeSchema body. The project must be ACTIVE (400 otherwise;
 * 404 unknown) and not the caller's own (400). One row per (project, citizen)
 * — an upsert: first pledge creates PLEDGED; a repeat updates amount/note and
 * flips a WITHDRAWN pledge back to PLEDGED. A pledge is a RECORDED COMMITMENT
 * only — settlement is wallet-to-wallet; the Republic never holds funds.
 */
export async function GET(req: Request): Promise<Response> {
  let userId: string;
  try {
    ({
      user: { id: userId },
    } = await requireSession(req));
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }

  const rows = await prisma.investmentPledge.findMany({
    where: { userId },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    include: {
      project: { select: { id: true, title: true, status: true, goalCoin: true } },
    },
  });

  return json({
    pledges: rows.map((p) => ({
      projectId: p.project.id,
      projectTitle: p.project.title,
      projectStatus: p.project.status,
      goalCoin: p.project.goalCoin,
      amountCoin: p.amountCoin,
      note: p.note,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
  });
}

export async function POST(req: Request): Promise<Response> {
  if (!isAllowedOrigin(req)) return forbidden();

  let userId: string;
  try {
    ({
      user: { id: userId },
    } = await requireSession(req));
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const parsed = pledgeSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Bad request.");
  const { projectId, amountCoin, note } = parsed.data;

  const project = await prisma.fundraisingProject.findUnique({
    where: { id: projectId },
    select: { id: true, creatorUserId: true, status: true },
  });
  if (!project) return json({ error: "Project not found." }, { status: 404 });
  if (project.creatorUserId === userId) {
    return badRequest("You cannot pledge to your own project.");
  }
  if (project.status !== "ACTIVE") {
    return badRequest("Only active projects accept pledges.");
  }

  const pledge = await prisma.investmentPledge.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: { projectId, userId, amountCoin, note: note ?? null },
    update: { amountCoin, note: note ?? null, status: "PLEDGED" },
  });

  return json({
    ok: true,
    pledge: {
      projectId: pledge.projectId,
      amountCoin: pledge.amountCoin,
      note: pledge.note,
      status: pledge.status,
      createdAt: pledge.createdAt.toISOString(),
    },
  });
}
