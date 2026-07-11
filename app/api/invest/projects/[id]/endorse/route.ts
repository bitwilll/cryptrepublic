import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { json, badRequest, forbidden } from "@/lib/http/responses";
import { COMMUNITY_BACKED_THRESHOLD } from "@/lib/gov/types";

/**
 * POST + DELETE /api/invest/projects/[id]/endorse — the community-approval
 * signal on the ENDORSEMENT QUEUE. Session + origin gated (both verbs
 * mutate). Only SUBMITTED filings can be (un)endorsed, never your own; one
 * endorsement per citizen (@@unique — a repeat POST is idempotent, DELETE
 * removes). Both verbs return the fresh count + the community-backed flag
 * (>= 7, the witness-rule echo) so the queue card updates in place.
 */

type Guard = { ok: true; userId: string; projectId: string } | { ok: false; res: Response };

async function guardEndorsement(req: Request, params: Promise<{ id: string }>): Promise<Guard> {
  if (!isAllowedOrigin(req)) return { ok: false, res: forbidden() };

  let userId: string;
  try {
    ({
      user: { id: userId },
    } = await requireSession(req));
  } catch (res) {
    if (res instanceof Response) return { ok: false, res };
    throw res;
  }

  const { id } = await params;
  if (!id) return { ok: false, res: badRequest() };

  const project = await prisma.fundraisingProject.findUnique({
    where: { id },
    select: { id: true, creatorUserId: true, status: true },
  });
  if (!project) {
    return { ok: false, res: json({ error: "Project not found." }, { status: 404 }) };
  }
  if (project.creatorUserId === userId) {
    return { ok: false, res: badRequest("You cannot endorse your own filing.") };
  }
  if (project.status !== "SUBMITTED") {
    return { ok: false, res: badRequest("Only submitted filings take endorsements.") };
  }
  return { ok: true, userId, projectId: project.id };
}

async function endorsementTally(projectId: string) {
  const endorsementCount = await prisma.projectEndorsement.count({ where: { projectId } });
  return { endorsementCount, communityBacked: endorsementCount >= COMMUNITY_BACKED_THRESHOLD };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await guardEndorsement(req, params);
  if (!guard.ok) return guard.res;

  try {
    await prisma.projectEndorsement.create({
      data: { projectId: guard.projectId, userId: guard.userId },
    });
  } catch (err) {
    // P2002 (unique violation) = already endorsed — idempotent success.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) {
      throw err;
    }
  }

  return json({ ok: true, endorsed: true, ...(await endorsementTally(guard.projectId)) });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await guardEndorsement(req, params);
  if (!guard.ok) return guard.res;

  await prisma.projectEndorsement.deleteMany({
    where: { projectId: guard.projectId, userId: guard.userId },
  });

  return json({ ok: true, endorsed: false, ...(await endorsementTally(guard.projectId)) });
}
