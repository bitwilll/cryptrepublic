import "server-only";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { activeChain } from "@/lib/config/chain";
import { referralLinkCreateSchema } from "@/lib/validation/reports";
import {
  createReferralLink,
  referralLinkGate,
  MAX_ACTIVE_LINKS_PER_USER,
} from "@/lib/referrals/links";
import { json, badRequest, forbidden } from "@/lib/http/responses";

/**
 * /api/referral-links (Wave 17). Shareable, score-gated signup links.
 *
 * GET  — MY links (never anyone else's) + per-link uses (Referral rows bound
 *        via viaLinkId) + the gate state so the UI can render locked/unlocked.
 * POST — mint a link. Ordinary citizen mutation (origin + session, no audit —
 *        the ReferralLink row IS the record). 403 with { finalScore,
 *        threshold } when the score gate holds (> 65 strict); 400 at the cap
 *        of 3 active links. PRIVACY: the payload carries only the caller's own
 *        data — codes, labels, and counts; never another citizen's identity.
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

  const chainId = activeChain().primaryChainId;
  const [gate, links] = await Promise.all([
    referralLinkGate(chainId, userId),
    prisma.referralLink.findMany({
      where: { ownerUserId: userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
  ]);

  const counts =
    links.length > 0
      ? await prisma.referral.groupBy({
          by: ["viaLinkId"],
          where: { viaLinkId: { in: links.map((l) => l.id) } },
          _count: { _all: true },
        })
      : [];
  const uses = new Map(counts.map((c) => [c.viaLinkId, c._count._all]));

  return json({
    gate,
    maxActive: MAX_ACTIVE_LINKS_PER_USER,
    links: links.map((l) => ({
      id: l.id,
      code: l.code,
      label: l.label,
      createdAt: l.createdAt.toISOString(),
      revokedAt: l.revokedAt ? l.revokedAt.toISOString() : null,
      uses: uses.get(l.id) ?? 0,
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
  const parsed = referralLinkCreateSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Bad request.");

  const chainId = activeChain().primaryChainId;
  const result = await createReferralLink(chainId, userId, parsed.data.label);

  if (!result.ok) {
    if (result.reason === "GATED") {
      return json(
        {
          error: `Referral links unlock above a standing of ${result.threshold}.`,
          finalScore: result.finalScore,
          threshold: result.threshold,
        },
        { status: 403 },
      );
    }
    return badRequest(
      `You already hold ${result.maxActive} active referral links — revoke one first.`,
    );
  }

  return json({
    ok: true,
    link: {
      id: result.link.id,
      code: result.link.code,
      label: result.link.label,
      createdAt: result.link.createdAt.toISOString(),
      revokedAt: null,
      uses: 0,
    },
  });
}
