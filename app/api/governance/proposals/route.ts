import "server-only";
import { requireSession } from "@/lib/auth/guard";
import { activeChain } from "@/lib/config/chain";
import { governanceAvailable } from "@/config/contracts";
import { prisma } from "@/lib/db";
import { readProposalCountServer, readProposalServer } from "@/lib/governance/serverReads";
import { json } from "@/lib/http/responses";

/**
 * GET (?status=open|all) → MERGE on-chain tallies + state (trustless) with DB
 * `GovernanceProposalContent` (title/tag/body — off-chain by nature). A FRESH
 * chain has 0 proposals -> `[]` (honest empty). Graceful when governance is
 * unregistered (constraint #11).
 */
export async function GET(req: Request): Promise<Response> {
  try {
    await requireSession(req);
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }
  const url = new URL(req.url);
  const status = url.searchParams.get("status") === "all" ? "all" : "open";
  const chainId = activeChain().primaryChainId;

  if (!governanceAvailable(chainId)) {
    return json({ available: false, proposals: [] });
  }

  let count: bigint;
  try {
    count = await readProposalCountServer(chainId);
  } catch {
    return json({ available: false, proposals: [] });
  }

  if (count === 0n) {
    return json({ available: true, proposals: [] }); // honest empty
  }

  // Fetch DB content for all known proposalIds (1..count).
  const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1));
  const content = await prisma.governanceProposalContent.findMany({
    where: { chainId, proposalId: { in: ids.map((n) => n.toString()) } },
  });
  const contentById = new Map(content.map((c) => [c.proposalId, c]));

  const onchain = await Promise.all(ids.map((id) => readProposalServer(chainId, id)));

  let proposals = onchain.map((p) => {
    const c = contentById.get(p.proposalId.toString());
    return {
      proposalId: p.proposalId.toString(),
      state: p.state,
      tally: {
        forVotes: p.tally.forVotes.toString(),
        againstVotes: p.tally.againstVotes.toString(),
        abstainVotes: p.tally.abstainVotes.toString(),
        snapshotCitizens: p.tally.snapshotCitizens.toString(),
      },
      start: p.start.toString(),
      end: p.end.toString(),
      proposer: p.proposer,
      descriptionHash: p.descriptionHash,
      title: c?.title ?? null,
      tag: c?.tag ?? null,
      body: c?.body ?? null,
    };
  });

  if (status === "open") {
    proposals = proposals.filter((p) => p.state === "Active");
  }

  return json({ available: true, proposals });
}
