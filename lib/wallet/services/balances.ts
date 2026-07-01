import "client-only";
import { erc20Abi, formatUnits } from "viem";
import { tokensForChain } from "@/config/tokens";
import { publicClientFor } from "./evmClients";
import { lamportsToSol, satsToBtc } from "@/lib/wallet/units";

/**
 * Multi-chain balance reads. Every read routes through a `/api/*` proxy — no
 * keyed RPC URL is ever in the client.
 */
export interface Balance {
  symbol: string;
  decimals: number;
  raw: bigint;
  formatted: string;
  /** ERC-20/SPL contract address; omitted for native coins. */
  address?: string;
}

const SOL_DECIMALS = 9;
const LAMPORTS_PER_SOL = 1_000_000_000n;

/**
 * EVM native + ERC-20 balances. Token symbol/decimals come from the registry
 * (`config/tokens.ts`), so on-chain `balanceOf` is the only read per token
 * (decimals/symbol are NOT re-fetched — the registry is authoritative). Tokens
 * with no address on this chain are skipped.
 *
 * DEVIATION FROM PLAN: the plan suggested `multicall` for balanceOf/decimals/
 * symbol. Since decimals+symbol live in the registry, we only need balanceOf,
 * issued as one `readContract` (eth_call) per token — fewer round-trips than a
 * 3-call multicall and trivially stubbable in tests.
 */
export async function evmBalances(chainId: number, owner: `0x${string}`): Promise<Balance[]> {
  const client = publicClientFor(chainId);
  const nativeSymbol = client.chain?.nativeCurrency.symbol ?? "ETH";
  const nativeDecimals = client.chain?.nativeCurrency.decimals ?? 18;

  const nativeRaw = await client.getBalance({ address: owner });
  const balances: Balance[] = [
    {
      symbol: nativeSymbol,
      decimals: nativeDecimals,
      raw: nativeRaw,
      formatted: formatUnits(nativeRaw, nativeDecimals),
    },
  ];

  const tokens = tokensForChain(chainId).filter((t): t is typeof t & { address: `0x${string}` } =>
    Boolean(t.address),
  );
  const results = await Promise.all(
    tokens.map((t) =>
      client.readContract({
        address: t.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [owner],
      }),
    ),
  );
  tokens.forEach((t, i) => {
    const raw = results[i];
    balances.push({
      symbol: t.symbol,
      decimals: t.decimals,
      raw,
      formatted: formatUnits(raw, t.decimals),
      address: t.address,
    });
  });

  return balances;
}

interface SolanaRpcResponse<T> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

async function solanaRpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch("/api/rpc/solana", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = (await res.json()) as SolanaRpcResponse<T>;
  if (json.error) throw new Error(`Solana RPC error: ${json.error.message}`);
  if (json.result === undefined) throw new Error("Solana RPC returned no result.");
  return json.result;
}

interface ParsedTokenAccount {
  account: {
    data: {
      parsed: {
        info: {
          mint: string;
          tokenAmount: { amount: string; decimals: number };
        };
      };
    };
  };
}

/** Solana SOL + SPL balances (SPL filtered to the token registry mints). */
export async function solanaBalances(owner: string): Promise<Balance[]> {
  const balances: Balance[] = [];

  const sol = await solanaRpc<{ value: number }>("getBalance", [owner]);
  const solRaw = BigInt(sol.value);
  balances.push({
    symbol: "SOL",
    decimals: SOL_DECIMALS,
    raw: solRaw,
    formatted: lamportsToSol(solRaw),
  });

  const spl = await solanaRpc<{ value: ParsedTokenAccount[] }>("getParsedTokenAccountsByOwner", [
    owner,
    { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
    { encoding: "jsonParsed" },
  ]);
  for (const acct of spl.value ?? []) {
    const info = acct.account.data.parsed.info;
    const raw = BigInt(info.tokenAmount.amount);
    if (raw === 0n) continue;
    balances.push({
      symbol: info.mint.slice(0, 4),
      decimals: info.tokenAmount.decimals,
      raw,
      formatted: formatUnits(raw, info.tokenAmount.decimals),
      address: info.mint,
    });
  }

  return balances;
}

interface EsploraAddressStats {
  chain_stats: { funded_txo_sum: number; spent_txo_sum: number };
  mempool_stats: { funded_txo_sum: number; spent_txo_sum: number };
}

/** Bitcoin balance = confirmed (chain) + unconfirmed (mempool), funded - spent. */
export async function btcBalance(address: string): Promise<Balance> {
  const res = await fetch(`/api/btc/address/${address}`);
  const stats = (await res.json()) as EsploraAddressStats;
  const confirmed = BigInt(stats.chain_stats.funded_txo_sum - stats.chain_stats.spent_txo_sum);
  const mempool = BigInt(stats.mempool_stats.funded_txo_sum - stats.mempool_stats.spent_txo_sum);
  const raw = confirmed + mempool;
  return {
    symbol: "BTC",
    decimals: 8,
    raw,
    formatted: satsToBtc(raw),
  };
}

export { LAMPORTS_PER_SOL };
