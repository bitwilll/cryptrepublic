import "server-only";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { json, badRequest, forbidden } from "@/lib/http/responses";
import { withdrawPledgeSchema } from "@/lib/validation/invest";

/**
 * POST /api/invest/pledges/withdraw — retract the caller's OWN pledge on a
 * project. Session + origin gated; withdrawPledgeSchema body. 404 when there
 * is no standing (PLEDGED) pledge — including when it was already withdrawn.
 * The row is kept (status → WITHDRAWN) so re-pledging later simply flips it
 * back. No funds move: the pledge was only ever a recorded commitment.
 */
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
  const parsed = withdrawPledgeSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Bad request.");

  const existing = await prisma.investmentPledge.findUnique({
    where: { projectId_userId: { projectId: parsed.data.projectId, userId } },
  });
  if (!existing || existing.status !== "PLEDGED") {
    return json({ error: "No standing pledge on this project." }, { status: 404 });
  }

  const pledge = await prisma.investmentPledge.update({
    where: { id: existing.id },
    data: { status: "WITHDRAWN" },
  });

  return json({
    ok: true,
    pledge: { projectId: pledge.projectId, status: pledge.status },
  });
}
