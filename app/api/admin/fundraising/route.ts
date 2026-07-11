import "server-only";
import type { FundraisingProject } from "@prisma/client";
import { prisma } from "@/lib/db";
import { json } from "@/lib/http/responses";
import { guardAdminGet } from "@/lib/admin/routeGuard";
import { traderDisplayMap } from "@/lib/store/display";
import { COMMUNITY_BACKED_THRESHOLD } from "@/lib/gov/types";

/**
 * GET /api/admin/fundraising (Wave 16) — the fundraising desk's three queues:
 *
 *   submitted — SUBMITTED projects awaiting a decision, oldest first (filing
 *               order), each with its endorsement count and the
 *               community-backed flag (>= 7 endorsements, witness-rule echo);
 *   active    — ACTIVE projects with pledgeCount and pledgedTotalCoin (PLEDGED
 *               rows only, summed as BigInt cents — decimal strings never
 *               touch a float);
 *   decided   — DECLINED / CLOSED / WITHDRAWN, newest 50.
 *
 * The creator is a tiny PUBLIC select (id/email/name) plus the public
 * "Citizen № N" display. REGISTRY ROWS ONLY: pledges are recorded commitments —
 * settlement is wallet-to-wallet; the Republic never holds funds.
 */

/** Sums decimal-string amounts (<= 2 dp) via BigInt cents; returns "123.45". */
function sumCoinAmounts(amounts: readonly string[]): string {
  let cents = 0n;
  for (const a of amounts) {
    const [whole = "0", frac = ""] = a.split(".");
    cents += BigInt(whole) * 100n + BigInt((frac + "00").slice(0, 2));
  }
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}

type CreatorRow = FundraisingProject & {
  creator: { id: string; email: string | null; name: string | null };
};

function baseProject(p: CreatorRow, citizens: Map<string, string>) {
  return {
    id: p.id,
    title: p.title,
    summary: p.summary,
    category: p.category,
    goalCoin: p.goalCoin,
    treasuryAddress: p.treasuryAddress,
    status: p.status,
    reviewNote: p.reviewNote,
    decidedBy: p.decidedBy,
    decidedAt: p.decidedAt === null ? null : p.decidedAt.toISOString(),
    createdAt: p.createdAt.toISOString(),
    creator: p.creator,
    creatorDisplay: citizens.get(p.creatorUserId) ?? "Applicant",
  };
}

export async function GET(req: Request): Promise<Response> {
  const actor = await guardAdminGet(req);
  if (actor instanceof Response) return actor;

  const creatorSelect = { select: { id: true, email: true, name: true } } as const;

  const [submitted, active, decided] = await Promise.all([
    prisma.fundraisingProject.findMany({
      where: { status: "SUBMITTED" },
      orderBy: { createdAt: "asc" },
      include: { creator: creatorSelect, _count: { select: { endorsements: true } } },
    }),
    prisma.fundraisingProject.findMany({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      include: {
        creator: creatorSelect,
        pledges: { where: { status: "PLEDGED" }, select: { amountCoin: true } },
      },
    }),
    prisma.fundraisingProject.findMany({
      where: { status: { in: ["DECLINED", "CLOSED", "WITHDRAWN"] } },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: { creator: creatorSelect },
    }),
  ]);

  const citizens = await traderDisplayMap(
    [...submitted, ...active, ...decided].map((p) => p.creatorUserId),
  );

  return json({
    submitted: submitted.map((p) => ({
      ...baseProject(p, citizens),
      endorsementCount: p._count.endorsements,
      communityBacked: p._count.endorsements >= COMMUNITY_BACKED_THRESHOLD,
    })),
    active: active.map((p) => ({
      ...baseProject(p, citizens),
      pledgeCount: p.pledges.length,
      pledgedTotalCoin: sumCoinAmounts(p.pledges.map((x) => x.amountCoin)),
    })),
    decided: decided.map((p) => baseProject(p, citizens)),
  });
}
