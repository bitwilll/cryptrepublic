import "client-only";
import { getAbiItem } from "viem";
import { publicClientFor } from "@/lib/wallet/services/evmClients";
import { distributorAddress } from "@/config/contracts";
import { dividendsAbi } from "./abi";

/**
 * Browser READ client for DividendDistributor. `claimable` is the CONTRACT
 * accrual — NEVER the mockup's `annualYield / citizenN / 4` math. On a fresh
 * chain `currentEpoch == 0` (no epoch open) and every screen renders an honest
 * "no dividend epoch open yet" state. Writes live in `./write.ts`.
 */

export interface EpochInfo {
  epochId: bigint;
  amount: bigint;
  snapshotCitizens: bigint;
  perCitizen: bigint;
  openedAt: bigint;
  open: boolean;
}

export interface DividendClaim {
  epochId: bigint;
  tokenId: bigint;
  to: `0x${string}`;
  amount: bigint;
  blockNumber: bigint;
  txHash: `0x${string}`;
}

export function readCurrentEpoch(chainId: number): Promise<bigint> {
  return publicClientFor(chainId).readContract({
    address: distributorAddress(chainId),
    abi: dividendsAbi,
    functionName: "currentEpoch",
  }) as Promise<bigint>;
}

export async function readEpoch(chainId: number, epochId: bigint): Promise<EpochInfo> {
  const tuple = (await publicClientFor(chainId).readContract({
    address: distributorAddress(chainId),
    abi: dividendsAbi,
    functionName: "epochs",
    args: [epochId],
  })) as readonly [bigint, bigint, bigint, bigint, boolean];
  const [amount, snapshotCitizens, perCitizen, openedAt, open] = tuple;
  return { epochId, amount, snapshotCitizens, perCitizen, openedAt, open };
}

export function readClaimable(chainId: number, epochId: bigint, tokenId: bigint): Promise<bigint> {
  return publicClientFor(chainId).readContract({
    address: distributorAddress(chainId),
    abi: dividendsAbi,
    functionName: "claimable",
    args: [epochId, tokenId],
  }) as Promise<bigint>;
}

export function readClaimed(chainId: number, epochId: bigint, tokenId: bigint): Promise<boolean> {
  return publicClientFor(chainId).readContract({
    address: distributorAddress(chainId),
    abi: dividendsAbi,
    functionName: "claimed",
    args: [epochId, tokenId],
  }) as Promise<boolean>;
}

/** DividendClaimed logs for a citizen's tokenId (their claim history). */
export async function readDividendHistory(
  chainId: number,
  tokenId: bigint,
): Promise<DividendClaim[]> {
  const client = publicClientFor(chainId);
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
