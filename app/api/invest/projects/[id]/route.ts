import "server-only";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { json, badRequest } from "@/lib/http/responses";
import { traderDisplay, traderDisplayMap } from "@/lib/store/display";
import { projectItem } from "@/lib/invest/projections";

/**
 * GET /api/invest/projects/[id] — project detail, session-gated. Everyone
 * receives the full public record (incl. description) plus aggregates and
 * their OWN pledge/endorsement. ONLY THE CREATOR additionally receives the
 * pledge ledger (pledger display names via the cached citizen-token map —
 * never an email or address — amount, note, status, date); every other
 * viewer gets `pledges: null`. 404 on an unknown id.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
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

  const row = await prisma.fundraisingProject.findUnique({
    where: { id },
    include: {
      pledges: {
        select: {
          userId: true,
          amountCoin: true,
          note: true,
          status: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
      },
      endorsements: { select: { userId: true } },
    },
  });
  if (!row) return json({ error: "Project not found." }, { status: 404 });

  const item = projectItem(row, userId, await traderDisplay(row.creatorUserId));
  const base = { project: { ...item, description: row.description } };

  if (row.creatorUserId !== userId) return json({ ...base, pledges: null });

  const pledgers = await traderDisplayMap(row.pledges.map((p) => p.userId));
  return json({
    ...base,
    pledges: row.pledges.map((p) => ({
      pledgerDisplay: pledgers.get(p.userId) ?? "Applicant",
      amountCoin: p.amountCoin,
      note: p.note,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
    })),
  });
}
