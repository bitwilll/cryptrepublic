export type ChainEnv = "testnet" | "mainnet";

/** The ONLY switch that flips the whole app between testnet and mainnet. */
export const CHAIN_ENV: ChainEnv =
  (process.env.NEXT_PUBLIC_CHAIN_ENV as ChainEnv) === "mainnet" ? "mainnet" : "testnet";

export const isMainnet = CHAIN_ENV === "mainnet";

// The typed registry keyed by CHAIN_ENV lives in config/chains.config.ts:
//   rpcUrls (server-only), chainIds, contract addresses, explorer bases.
// No RPC URL, chainId, or contract address may be hardcoded outside those files.
export { activeChain, evmEntry, CHAINS } from "@/config/chains.config";
export type { ChainProfile, EvmChainEntry } from "@/config/chains.config";
