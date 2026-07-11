import "server-only";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { json, badRequest, forbidden } from "@/lib/http/responses";

/**
 * POST /api/invest/projects/[id]/withdraw — the CREATOR pulls their filing.
 * Session + origin gated. Legal only from SUBMITTED|ACTIVE → WITHDRAWN
 * (terminal); Cabinet decisions (DECLINED/CLOSED) and prior withdrawals are
 * final → 400. Non-creator → 403; unknown id → 404. Withdrawal is a registry
 * transition only — no funds exist to return, because none were ever held.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
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

  const { id } = await params;
  if (!id) return badRequest();

  const project = await prisma.fundraisingProject.findUnique({ where: { id } });
  if (!project) return json({ error: "Project not found." }, { status: 404 });
  if (project.creatorUserId !== userId) return forbidden();
  if (project.status !== "SUBMITTED" && project.status !== "ACTIVE") {
    return badRequest(`Cannot withdraw a ${project.status} filing.`);
  }

  const updated = await prisma.fundraisingProject.update({
    where: { id: project.id },
    data: { status: "WITHDRAWN" },
  });

  return json({ ok: true, project: { id: updated.id, status: updated.status } });
}
