export type ChainEnv = "testnet" | "mainnet" | "local";

/**
 * The ONLY switch that flips the whole app between testnet, mainnet, and the
 * LOCAL anvil profile. `local` (chainId 31337) exists so the app's REAL read +
 * broadcast path (`publicClientFor(31337)` → `/api/rpc/31337`) can run against a
 * local anvil during the Wave 5 integration test — NOT a test-only side client.
 */
function resolveChainEnv(): ChainEnv {
  const raw = process.env.NEXT_PUBLIC_CHAIN_ENV;
  if (raw === "mainnet") return "mainnet";
  if (raw === "local") return "local";
  return "testnet";
}

export const CHAIN_ENV: ChainEnv = resolveChainEnv();

export const isMainnet = CHAIN_ENV === "mainnet";

// The typed registry keyed by CHAIN_ENV lives in config/chains.config.ts:
//   rpcUrls (server-only), chainIds, contract addresses, explorer bases.
// No RPC URL, chainId, or contract address may be hardcoded outside those files.
export { activeChain, evmEntry, CHAINS } from "@/config/chains.config";
export type { ChainProfile, EvmChainEntry } from "@/config/chains.config";
