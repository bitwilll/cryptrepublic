import "server-only";
import { requireSession } from "@/lib/auth/guard";
import { activeChain } from "@/lib/config/chain";
import {
  contractEntry,
  governanceAvailable,
  treasuryAvailable,
  distributorAvailable,
} from "@/config/contracts";
import { readCitizenMintedLogsServer } from "@/lib/passport/serverReads";
import { createPublicClient, getAbiItem, http, type PublicClient } from "viem";
import { evmEntry } from "@/config/chains.config";
import { serverRpcUrl } from "@/lib/rpc/allowlist";
import { governanceAbi } from "@/lib/governance/abi";
import { treasuryAbi } from "@/lib/treasury/abi";
import { dividendsAbi } from "@/lib/dividends/abi";
import { governanceAddress, treasuryAddress, distributorAddress } from "@/config/contracts";
import { json } from "@/lib/http/responses";

/**
 * GET → a block-sorted activity ledger merged from real on-chain events
 * (CitizenMinted / VoteCast / Disbursed / DividendClaimed). Empty on a fresh
 * chain — NEVER the mockup's demo rows. Every source degrades gracefully
 * (unregistered/failed source contributes nothing; never crashes the route).
 */
type Activity = { kind: string; blockNumber: string; ref: string; txHash: string | null };

function serverClient(chainId: number): PublicClient {
  const entry = evmEntry(chainId);
  return createPublicClient({ chain: entry.viemChain, transport: http(serverRpcUrl(chainId)) });
}

export async function GET(req: Request): Promise<Response> {
  try {
    await requireSession(req);
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }
  const chainId = activeChain().primaryChainId;
  const out: Activity[] = [];

  if (contractEntry(chainId).passport) {
    try {
      const logs = await readCitizenMintedLogsServer(chainId);
      for (const l of logs) {
        out.push({
          kind: "CitizenMinted",
          blockNumber: l.blockNumber.toString(),
          ref: l.tokenId.toString(),
          txHash: null,
        });
      }
    } catch {
      /* graceful */
    }
  }

  if (governanceAvailable(chainId)) {
    try {
      const logs = await serverClient(chainId).getLogs({
        address: governanceAddress(chainId),
        event: getAbiItem({ abi: governanceAbi, name: "VoteCast" }),
        fromBlock: 0n,
        toBlock: "latest",
      });
      for (const l of logs) {
        out.push({
          kind: "VoteCast",
          blockNumber: (l.blockNumber ?? 0n).toString(),
          ref: (l.args.proposalId as bigint).toString(),
          txHash: l.transactionHash ?? null,
        });
      }
    } catch {
      /* graceful */
    }
  }

  if (treasuryAvailable(chainId)) {
    try {
      const logs = await serverClient(chainId).getLogs({
        address: treasuryAddress(chainId),
        event: getAbiItem({ abi: treasuryAbi, name: "Disbursed" }),
        fromBlock: 0n,
        toBlock: "latest",
      });
      for (const l of logs) {
        out.push({
          kind: "Disbursed",
          blockNumber: (l.blockNumber ?? 0n).toString(),
          ref: (l.args.amount as bigint).toString(),
          txHash: l.transactionHash ?? null,
        });
      }
    } catch {
      /* graceful */
    }
  }

  if (distributorAvailable(chainId)) {
    try {
      const logs = await serverClient(chainId).getLogs({
        address: distributorAddress(chainId),
        event: getAbiItem({ abi: dividendsAbi, name: "DividendClaimed" }),
        fromBlock: 0n,
        toBlock: "latest",
      });
      for (const l of logs) {
        out.push({
          kind: "DividendClaimed",
          blockNumber: (l.blockNumber ?? 0n).toString(),
          ref: (l.args.epochId as bigint).toString(),
          txHash: l.transactionHash ?? null,
        });
      }
    } catch {
      /* graceful */
    }
  }

  out.sort((a, b) => Number(BigInt(b.blockNumber) - BigInt(a.blockNumber)));
  return json({ activity: out.slice(0, 30) });
}
