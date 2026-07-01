import "server-only";
import { requireSession } from "@/lib/auth/guard";
import { activeChain } from "@/lib/config/chain";
import { governanceAvailable } from "@/config/contracts";
import { prisma } from "@/lib/db";
import { readProposalServer } from "@/lib/governance/serverReads";
import { json, badRequest } from "@/lib/http/responses";

/** GET → one proposal: on-chain tally + state merged with DB content. */
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

  if (!governanceAvailable(chainId)) {
    return json({ available: false, proposal: null });
  }

  try {
    const p = await readProposalServer(chainId, BigInt(id));
    const content = await prisma.governanceProposalContent.findUnique({
      where: { chainId_proposalId: { chainId, proposalId: id } },
    });
    return json({
      available: true,
      proposal: {
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
        title: content?.title ?? null,
        tag: content?.tag ?? null,
        body: content?.body ?? null,
      },
    });
  } catch {
    return json({ available: false, proposal: null });
  }
}
