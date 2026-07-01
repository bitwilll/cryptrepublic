import "server-only";
import { evmEntry } from "@/config/chains.config";

/**
 * Allow-listed JSON-RPC methods the keyed proxy will forward. READ + BROADCAST
 * only — NO signing or account-enumeration methods (`eth_accounts`,
 * `personal_sign`, `eth_sign`, `eth_sendTransaction`) ever reach an upstream
 * RPC; the browser signs locally and broadcasts a raw tx.
 */
export const ALLOWED_EVM_METHODS: readonly string[] = [
  "eth_call",
  "eth_getBalance",
  "eth_blockNumber",
  "eth_chainId",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",
  "eth_estimateGas",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "eth_getTransactionByHash",
  "eth_sendRawTransaction",
  "eth_getCode",
  "eth_getLogs",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
];

const EVM_SET = new Set(ALLOWED_EVM_METHODS);

export function isAllowedEvmMethod(method: string): boolean {
  return EVM_SET.has(method);
}

/** Allow-listed Solana JSON-RPC methods (read + broadcast). */
export const ALLOWED_SOLANA_METHODS: readonly string[] = [
  "getBalance",
  "getParsedTokenAccountsByOwner",
  "getTokenAccountsByOwner",
  "getLatestBlockhash",
  "getRecentBlockhash",
  "getFeeForMessage",
  "sendTransaction",
  "getSignaturesForAddress",
  "getSignatureStatuses",
  "getAccountInfo",
  "getParsedTransaction",
  "getMinimumBalanceForRentExemption",
];

const SOLANA_SET = new Set(ALLOWED_SOLANA_METHODS);

export function isAllowedSolanaMethod(method: string): boolean {
  return SOLANA_SET.has(method);
}

/**
 * Resolve the keyed (SERVER-ONLY) RPC URL for a chain. Reads a non-NEXT_PUBLIC_
 * env var named by the registry entry; throws if the chain is inactive or the
 * env var is unset (never returns a public origin — the browser uses the
 * `/api/rpc/[chain]` proxy).
 */
export function serverRpcUrl(chainId: number): string {
  const entry = evmEntry(chainId); // throws for unknown/inactive chain
  const url = process.env[entry.serverRpcEnv];
  if (!url) {
    // LOCAL ANVIL ONLY: the local/anvil profile (chainId 31337) has a sane
    // default so the proxy forwards to a local anvil without extra env. Real
    // chains still throw when their keyed RPC env var is unset.
    if (chainId === 31337) {
      return "http://127.0.0.1:8545";
    }
    throw new Error(`Missing keyed RPC env var ${entry.serverRpcEnv} for chain ${chainId}`);
  }
  return url;
}

/** Resolve the keyed (SERVER-ONLY) Solana RPC URL. */
export function serverSolanaRpcUrl(): string {
  const url = process.env.RPC_SOLANA;
  if (!url) {
    throw new Error("Missing keyed RPC env var RPC_SOLANA");
  }
  return url;
}
