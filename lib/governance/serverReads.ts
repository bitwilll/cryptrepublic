import "server-only";
import { createPublicClient, http, type PublicClient } from "viem";
import { evmEntry } from "@/config/chains.config";
import { serverRpcUrl } from "@/lib/rpc/allowlist";
import { governanceAddress } from "@/config/contracts";
import { governanceAbi, PROPOSAL_STATE } from "./abi";
import type { OnchainProposal } from "./client";

/**
 * SERVER-SIDE governance reads for route handlers (route handlers can't import
 * the client-only `./client.ts`). Same reads via `createPublicClient(serverRpcUrl)`.
 */
function serverClient(chainId: number): PublicClient {
  const entry = evmEntry(chainId);
  return createPublicClient({ chain: entry.viemChain, transport: http(serverRpcUrl(chainId)) });
}

export function readProposalCountServer(chainId: number): Promise<bigint> {
  return serverClient(chainId).readContract({
    address: governanceAddress(chainId),
    abi: governanceAbi,
    functionName: "proposalCount",
  }) as Promise<bigint>;
}

export async function readProposalServer(
  chainId: number,
  proposalId: bigint,
): Promise<OnchainProposal> {
  const client = serverClient(chainId);
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
        `0x${string}`,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        boolean,
        boolean,
        `0x${string}`,
        `0x${string}`,
        bigint,
        `0x${string}`,
      ]
    >,
  ]);
  const [forVotes, againstVotes, abstainVotes, snapshotCitizens] = votes;
  return {
    proposalId,
    state: PROPOSAL_STATE[Number(stateOrdinal)] ?? "Pending",
    tally: { forVotes, againstVotes, abstainVotes, snapshotCitizens },
    proposer: struct[0],
    start: struct[1],
    end: struct[2],
    descriptionHash: struct[9],
  };
}

export function readMyVoteServer(
  chainId: number,
  proposalId: bigint,
  tokenId: bigint,
): Promise<number> {
  return serverClient(chainId).readContract({
    address: governanceAddress(chainId),
    abi: governanceAbi,
    functionName: "voteByPassport",
    args: [proposalId, tokenId],
  }) as Promise<number>;
}

/**
 * The on-chain proposer + descriptionHash for a proposalId (via the full
 * `proposals()` struct getter). Used by the propose-embassy authorship binding
 * (B6 / A5): the route rejects unless `proposer === resolvedAddress` and
 * `keccak256(content) === descriptionHash`.
 */
export async function readGovernanceParamServer(
  chainId: number,
  proposalId: bigint,
): Promise<{ proposer: `0x${string}`; descriptionHash: `0x${string}` }> {
  const struct = (await serverClient(chainId).readContract({
    address: governanceAddress(chainId),
    abi: governanceAbi,
    functionName: "proposals",
    args: [proposalId],
  })) as readonly [
    `0x${string}`,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    boolean,
    boolean,
    `0x${string}`,
    `0x${string}`,
    bigint,
    `0x${string}`,
  ];
  return { proposer: struct[0], descriptionHash: struct[9] };
}
