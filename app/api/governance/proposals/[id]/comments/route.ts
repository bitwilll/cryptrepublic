import "server-only";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { activeChain } from "@/lib/config/chain";
import { prisma } from "@/lib/db";
import { resolveApplicantAddress } from "@/lib/applications/applicant";
import { readHasPassportServer, readPassportStatusServer } from "@/lib/passport/serverReads";
import { commentSchema } from "@/lib/validation/dashboard";
import { rateLimit } from "@/lib/auth/ratelimit";
import { json, badRequest, forbidden, tooManyRequests } from "@/lib/http/responses";

/** GET → the dissent thread for a proposal (DB content). */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await requireSession(req);
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }
  const { id } = await params;
  if (!/^\d+$/.test(id)) return badRequest("Invalid proposal id.");
  const chainId = activeChain().primaryChainId;

  const parent = await prisma.governanceProposalContent.findUnique({
    where: { chainId_proposalId: { chainId, proposalId: id } },
  });
  if (!parent) return json({ comments: [] });

  const comments = await prisma.proposalComment.findMany({
    where: { proposalContentId: parent.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      authorAddress: true,
      citizenTokenId: true,
      body: true,
      upvotes: true,
      createdAt: true,
    },
  });
  return json({ comments });
}

/**
 * POST → add a dissent comment. Citizen-gated: resolve the caller's VERIFIED EVM
 * address via `resolveApplicantAddress` (never a client field) and verify passport
 * ownership on-chain via `readHasPassportServer`. NEVER trust a client isCitizen.
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

  // Per-user rate limit (Wave 8 B1): 10 comments / 5 min. Keyed on the session
  // user id (never IP) so one authenticated user cannot flood the thread.
  const rl = rateLimit(`comment:${userId}`, 10, 5 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  const { id } = await params;
  if (!/^\d+$/.test(id)) return badRequest("Invalid proposal id.");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the comment fields.");
  if (parsed.data.proposalId !== id) {
    return badRequest("Proposal id mismatch.");
  }

  const chainId = activeChain().primaryChainId;

  // Citizen gate — verified wallet + on-chain passport ownership.
  const address = await resolveApplicantAddress(userId);
  if (!address) return forbidden();
  const isCitizen = await readHasPassportServer(chainId, address);
  if (!isCitizen) return forbidden();

  // The comment attaches to the proposal's off-chain content row; ensure it exists.
  const parent = await prisma.governanceProposalContent.upsert({
    where: { chainId_proposalId: { chainId, proposalId: id } },
    update: {},
    create: {
      chainId,
      proposalId: id,
      title: `Proposal #${id}`,
      tag: "PROCEDURAL",
      body: "",
    },
  });

  // Resolve the citizen tokenId for display (best-effort; never blocks the write).
  let citizenTokenId: string | null = null;
  try {
    const status = await readPassportStatusServer(chainId, address);
    citizenTokenId = status.tokenId?.toString() ?? null;
  } catch {
    citizenTokenId = null;
  }

  const comment = await prisma.proposalComment.create({
    data: {
      proposalContentId: parent.id,
      authorAddress: address,
      citizenTokenId,
      body: parsed.data.body,
    },
    select: {
      id: true,
      authorAddress: true,
      citizenTokenId: true,
      body: true,
      upvotes: true,
      createdAt: true,
    },
  });

  return json({ ok: true, comment });
}
