import "server-only";
import { getAddress } from "viem";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { json, badRequest, forbidden } from "@/lib/http/responses";
import { createProjectSchema } from "@/lib/validation/invest";
import { traderDisplayMap } from "@/lib/store/display";
import { MAX_OPEN_FUNDRAISERS_PER_CITIZEN } from "@/lib/gov/types";
import { projectItem, PROJECT_INCLUDE } from "@/lib/invest/projections";

/**
 * GET /api/invest/projects — the fundraising register, session-gated.
 * ?status=ACTIVE (default) is the investable board; ?status=SUBMITTED is the
 * community ENDORSEMENT QUEUE (visible to every citizen — endorsements are
 * the pre-Cabinet signal); ?mine=1 returns the caller's own filings in EVERY
 * status. Each item carries aggregates (BigInt-cents pledge total, pledge /
 * endorsement counts, community-backed at 7) plus the caller's own pledge and
 * endorsement — never anyone else's rows. Projects and pledges are REGISTRY
 * ROWS only: the Republic never holds or moves funds.
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

  const url = new URL(req.url);
  let where: { creatorUserId: string } | { status: string };
  if (url.searchParams.get("mine") === "1") {
    where = { creatorUserId: userId };
  } else {
    const status = url.searchParams.get("status") ?? "ACTIVE";
    if (status !== "ACTIVE" && status !== "SUBMITTED") {
      return badRequest("Unknown status filter.");
    }
    where = { status };
  }

  const rows = await prisma.fundraisingProject.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: PROJECT_INCLUDE,
  });
  const creators = await traderDisplayMap(rows.map((r) => r.creatorUserId));

  return json({
    projects: rows.map((r) => projectItem(r, userId, creators.get(r.creatorUserId) ?? "Applicant")),
  });
}

/**
 * POST /api/invest/projects — file a fundraiser. Session + origin gated;
 * body validated by createProjectSchema. The optional treasuryAddress must
 * arrive ALREADY CHECKSUMMED (viem getAddress round-trip — 400 on mismatch):
 * it is published for direct wallet-to-wallet contributions, so a mistyped
 * character must never slip onto the register. The open-fundraiser cap
 * (1 non-terminal filing per citizen: SUBMITTED|ACTIVE) is enforced INSIDE
 * the create transaction. New filings start SUBMITTED.
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
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Bad request.");

  if (parsed.data.treasuryAddress !== undefined) {
    let checksummed: string;
    try {
      checksummed = getAddress(parsed.data.treasuryAddress);
    } catch {
      return badRequest("Treasury address is not a valid EVM address.");
    }
    if (checksummed !== parsed.data.treasuryAddress) {
      return badRequest(
        "Treasury address failed its checksum — paste the checksummed (mixed-case) form exactly.",
      );
    }
  }

  const CAP = Symbol("open-cap");
  try {
    const project = await prisma.$transaction(async (tx) => {
      const open = await tx.fundraisingProject.count({
        where: { creatorUserId: userId, status: { in: ["SUBMITTED", "ACTIVE"] } },
      });
      if (open >= MAX_OPEN_FUNDRAISERS_PER_CITIZEN) throw CAP;
      return tx.fundraisingProject.create({
        data: { creatorUserId: userId, ...parsed.data },
      });
    });
    return json({
      ok: true,
      project: {
        id: project.id,
        title: project.title,
        summary: project.summary,
        description: project.description,
        category: project.category,
        goalCoin: project.goalCoin,
        treasuryAddress: project.treasuryAddress,
        status: project.status,
        createdAt: project.createdAt.toISOString(),
      },
    });
  } catch (err) {
    if (err === CAP) {
      return badRequest("You already have an open fundraiser — withdraw it before filing another.");
    }
    throw err;
  }
}
