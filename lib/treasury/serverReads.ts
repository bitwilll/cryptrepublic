import "server-only";
import { createPublicClient, getAbiItem, http, zeroAddress, type PublicClient } from "viem";
import { evmEntry } from "@/config/chains.config";
import { serverRpcUrl } from "@/lib/rpc/allowlist";
import { contractEntry, treasuryAddress } from "@/config/contracts";
import { treasuryAbi } from "./abi";
import type { Disbursement, TreasuryReserves } from "./client";

/** SERVER-SIDE CryptTreasury reads for route handlers. */
function serverClient(chainId: number): PublicClient {
  const entry = evmEntry(chainId);
  return createPublicClient({ chain: entry.viemChain, transport: http(serverRpcUrl(chainId)) });
}

function cryptTokenAddress(chainId: number): `0x${string}` {
  const addr = contractEntry(chainId).token;
  if (!addr) throw new Error(`$CRYPT token not deployed on chain ${chainId}`);
  return addr;
}

export async function readTreasuryReservesServer(chainId: number): Promise<TreasuryReserves> {
  const client = serverClient(chainId);
  const addr = treasuryAddress(chainId);
  const [cryptWei, ethWei] = await Promise.all([
    client.readContract({
      address: addr,
      abi: treasuryAbi,
      functionName: "balanceOf",
      args: [cryptTokenAddress(chainId)],
    }) as Promise<bigint>,
    client.readContract({
      address: addr,
      abi: treasuryAbi,
      functionName: "balanceOf",
      args: [zeroAddress],
    }) as Promise<bigint>,
  ]);
  return { cryptWei, ethWei };
}

export async function readDisbursementsServer(chainId: number): Promise<Disbursement[]> {
  const client = serverClient(chainId);
  const event = getAbiItem({ abi: treasuryAbi, name: "Disbursed" });
  const logs = await client.getLogs({
    address: treasuryAddress(chainId),
    event,
    fromBlock: 0n,
    toBlock: "latest",
  });
  return logs.map((l) => ({
    token: l.args.token as `0x${string}`,
    to: l.args.to as `0x${string}`,
    amount: l.args.amount as bigint,
    blockNumber: l.blockNumber ?? 0n,
    txHash: l.transactionHash as `0x${string}`,
  }));
}

/** On-chain allocation TARGET bps for a bucket key (0 when unset). */
export function readAllocationBpsServer(chainId: number, bucket: `0x${string}`): Promise<number> {
  return serverClient(chainId).readContract({
    address: treasuryAddress(chainId),
    abi: treasuryAbi,
    functionName: "allocationBps",
    args: [bucket],
  }) as Promise<number>;
}
