import "server-only";
import { createPublicClient, getAbiItem, http, type PublicClient } from "viem";
import { evmEntry } from "@/config/chains.config";
import { serverRpcUrl } from "@/lib/rpc/allowlist";
import { distributorAddress } from "@/config/contracts";
import { dividendsAbi } from "./abi";
import type { DividendClaim, EpochInfo } from "./client";

/** SERVER-SIDE DividendDistributor reads for route handlers. */
function serverClient(chainId: number): PublicClient {
  const entry = evmEntry(chainId);
  return createPublicClient({ chain: entry.viemChain, transport: http(serverRpcUrl(chainId)) });
}

export function readCurrentEpochServer(chainId: number): Promise<bigint> {
  return serverClient(chainId).readContract({
    address: distributorAddress(chainId),
    abi: dividendsAbi,
    functionName: "currentEpoch",
  }) as Promise<bigint>;
}

export async function readEpochServer(chainId: number, epochId: bigint): Promise<EpochInfo> {
  const tuple = (await serverClient(chainId).readContract({
    address: distributorAddress(chainId),
    abi: dividendsAbi,
    functionName: "epochs",
    args: [epochId],
  })) as readonly [bigint, bigint, bigint, bigint, boolean];
  const [amount, snapshotCitizens, perCitizen, openedAt, open] = tuple;
  return { epochId, amount, snapshotCitizens, perCitizen, openedAt, open };
}

export function readClaimableServer(
  chainId: number,
  epochId: bigint,
  tokenId: bigint,
): Promise<bigint> {
  return serverClient(chainId).readContract({
    address: distributorAddress(chainId),
    abi: dividendsAbi,
    functionName: "claimable",
    args: [epochId, tokenId],
  }) as Promise<bigint>;
}

export async function readDividendHistoryServer(
  chainId: number,
  tokenId: bigint,
): Promise<DividendClaim[]> {
  const client = serverClient(chainId);
  const event = getAbiItem({ abi: dividendsAbi, name: "DividendClaimed" });
  const logs = await client.getLogs({
    address: distributorAddress(chainId),
    event,
    args: { tokenId },
    fromBlock: 0n,
    toBlock: "latest",
  });
  return logs.map((l) => ({
    epochId: l.args.epochId as bigint,
    tokenId: l.args.tokenId as bigint,
    to: l.args.to as `0x${string}`,
    amount: l.args.amount as bigint,
    blockNumber: l.blockNumber ?? 0n,
    txHash: l.transactionHash as `0x${string}`,
  }));
}
