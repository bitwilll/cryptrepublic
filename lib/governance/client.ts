import "client-only";
import { getAbiItem } from "viem";
import { publicClientFor } from "@/lib/wallet/services/evmClients";
import { governanceAddress } from "@/config/contracts";
import { governanceAbi, PROPOSAL_STATE } from "./abi";

/**
 * Browser READ client for CryptGovernance. Every read goes through the app's REAL
 * `publicClientFor(chainId)` -> `/api/rpc/<chainId>` proxy (CSP-safe). Tallies +
 * state ALWAYS read from chain (trustless); off-chain content (title/body/tag)
 * comes from Prisma via `/api/governance/*`. Writes live in `./write.ts`.
 */

export interface ProposalTally {
  forVotes: bigint;
  againstVotes: bigint;
  abstainVotes: bigint;
  snapshotCitizens: bigint;
}

export interface OnchainProposal {
  proposalId: bigint;
  state: string; // PROPOSAL_STATE[state]
  tally: ProposalTally;
  start: bigint;
  end: bigint;
  proposer: `0x${string}`;
  descriptionHash: `0x${string}`;
}

function stateLabel(ordinal: number): string {
  return PROPOSAL_STATE[ordinal] ?? "Pending";
}

export function readProposalCount(chainId: number): Promise<bigint> {
  return publicClientFor(chainId).readContract({
    address: governanceAddress(chainId),
    abi: governanceAbi,
    functionName: "proposalCount",
  }) as Promise<bigint>;
}

export async function readProposal(chainId: number, proposalId: bigint): Promise<OnchainProposal> {
  const client = publicClientFor(chainId);
  const addr = governanceAddress(chainId);
  const [votes, stateOrdinal, struct] = await Promise.all([
    client.readContract({
      address: addr,
      abi: governanceAbi,
      functionName: "getVotes",
      args: [proposalId],
    }) as Promise<readonly [bigint, bigint, bigint, bigint]>,
    client.readContract({
      address: addr,
      abi: governanceAbi,
      functionName: "state",
      args: [proposalId],
    }) as Promise<number>,
    client.readContract({
      address: addr,
      abi: governanceAbi,
      functionName: "proposals",
      args: [proposalId],
    }) as Promise<
      readonly [
        `0x${string}`, // proposer
        bigint, // start
        bigint, // end
        bigint, // snapshotCitizens
        bigint, // forVotes
        bigint, // againstVotes
        bigint, // abstainVotes
        boolean, // executed
        boolean, // cancelled
        `0x${string}`, // descriptionHash
        `0x${string}`, // target
        bigint, // value
        `0x${string}`, // callData
      ]
    >,
  ]);

  const [forVotes, againstVotes, abstainVotes, snapshotCitizens] = votes;
  return {
    proposalId,
    state: stateLabel(Number(stateOrdinal)),
    tally: { forVotes, againstVotes, abstainVotes, snapshotCitizens },
    proposer: struct[0],
    start: struct[1],
    end: struct[2],
    descriptionHash: struct[9],
  };
}

/** The caller's vote on a proposal (Vote enum ordinal; 0 = None/not-yet-voted). */
export function readMyVote(chainId: number, proposalId: bigint, tokenId: bigint): Promise<number> {
  return publicClientFor(chainId).readContract({
    address: governanceAddress(chainId),
    abi: governanceAbi,
    functionName: "voteByPassport",
    args: [proposalId, tokenId],
  }) as Promise<number>;
}

export async function readGovernanceParams(chainId: number): Promise<{
  quorumBps: number;
  votingPeriod: bigint;
  minCitizensForProposal: bigint;
}> {
  const client = publicClientFor(chainId);
  const addr = governanceAddress(chainId);
  const [quorumBps, votingPeriod, minCitizensForProposal] = await Promise.all([
    client.readContract({ address: addr, abi: governanceAbi, functionName: "quorumBps" }),
    client.readContract({ address: addr, abi: governanceAbi, functionName: "votingPeriod" }),
    client.readContract({
      address: addr,
      abi: governanceAbi,
      functionName: "minCitizensForProposal",
    }),
  ]);
  return {
    quorumBps: Number(quorumBps),
    votingPeriod: votingPeriod as bigint,
    minCitizensForProposal: minCitizensForProposal as bigint,
  };
}

/** VoteCast logs for a citizen's tokenId (their vote history — B1 stat row). */
export async function readMyVoteHistory(
  chainId: number,
  tokenId: bigint,
): Promise<{ proposalId: bigint; support: number; blockNumber: bigint }[]> {
  const client = publicClientFor(chainId);
  const event = getAbiItem({ abi: governanceAbi, name: "VoteCast" });
  const logs = await client.getLogs({
    address: governanceAddress(chainId),
    event,
    args: { tokenId },
    fromBlock: 0n,
    toBlock: "latest",
  });
  return logs.map((l) => ({
    proposalId: l.args.proposalId as bigint,
    support: Number(l.args.support),
    blockNumber: l.blockNumber ?? 0n,
  }));
}
