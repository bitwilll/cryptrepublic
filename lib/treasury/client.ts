import "client-only";
import { getAbiItem, zeroAddress } from "viem";
import { publicClientFor } from "@/lib/wallet/services/evmClients";
import { contractEntry, treasuryAddress } from "@/config/contracts";
import { treasuryAbi } from "./abi";

/**
 * Browser READ client for CryptTreasury. Real balances only — honest near-0 on a
 * fresh chain (NEVER the mockup's "$14.20M"). Allocation TARGETS come from Prisma
 * (governance intent); live balances from `balanceOf`. Treasury is READ-ONLY from
 * the UI (it moves only via executed governance proposals).
 */

export interface TreasuryReserves {
  cryptWei: bigint;
  ethWei: bigint;
}

export interface Disbursement {
  token: `0x${string}`;
  to: `0x${string}`;
  amount: bigint;
  blockNumber: bigint;
  txHash: `0x${string}`;
}

/** The registered $CRYPT token address (from the shared registry). */
function cryptTokenAddress(chainId: number): `0x${string}` {
  const addr = contractEntry(chainId).token;
  if (!addr) throw new Error(`$CRYPT token not deployed on chain ${chainId}`);
  return addr;
}

export async function readTreasuryReserves(chainId: number): Promise<TreasuryReserves> {
  const client = publicClientFor(chainId);
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

export async function readDisbursements(chainId: number): Promise<Disbursement[]> {
  const client = publicClientFor(chainId);
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
