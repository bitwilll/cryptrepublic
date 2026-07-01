import type { Chain } from "viem";
import {
  base,
  baseSepolia,
  mainnet,
  sepolia,
  arbitrum,
  arbitrumSepolia,
  optimism,
  optimismSepolia,
  polygon,
  polygonAmoy,
  foundry,
} from "viem/chains";
import { CHAIN_ENV, type ChainEnv } from "@/lib/config/chain";

/**
 * Single source of truth for chains. Nothing else in the app may hardcode a
 * chainId, RPC URL, explorer, or contract/token address — those all resolve
 * through this registry (and `config/tokens.ts`). Mainnet is a single env flip
 * (`NEXT_PUBLIC_CHAIN_ENV`).
 */

export interface EvmChainEntry {
  chainId: number;
  viemChain: Chain;
  /** Explorer base URL, no trailing slash. */
  explorer: string;
  /** Name of the non-NEXT_PUBLIC_ env var holding the keyed RPC (SERVER-ONLY). */
  serverRpcEnv: string;
  /**
   * Read-only fallback for non-sensitive reads. By design this is a RELATIVE
   * `/api/rpc/<chainId>` proxy path — NOT a direct public-RPC origin — so a
   * `connect-src 'self'` CSP genuinely covers every browser RPC read and no
   * public-RPC origin is ever contacted directly. If a direct public RPC is
   * ever reintroduced, its exact origin MUST be enumerated in the CSP.
   */
  publicFallbackRpc?: string;
  /** Where CryptRepublic contracts live (passport, $CRYPT, etc.). */
  isPrimary?: boolean;
}

export interface ChainProfile {
  evm: readonly EvmChainEntry[];
  primaryChainId: number;
  solanaCluster: "devnet" | "mainnet-beta";
  bitcoinNetwork: "testnet" | "mainnet";
}

function explorerOf(chain: Chain): string {
  const url = chain.blockExplorers?.default?.url ?? "";
  return url.replace(/\/$/, "");
}

function evm(chain: Chain, serverRpcEnv: string, isPrimary = false): EvmChainEntry {
  return {
    chainId: chain.id,
    viemChain: chain,
    explorer: explorerOf(chain),
    serverRpcEnv,
    publicFallbackRpc: `/api/rpc/${chain.id}`,
    isPrimary,
  };
}

export const CHAINS: Record<ChainEnv, ChainProfile> = {
  testnet: {
    evm: [
      evm(baseSepolia, "RPC_BASE_SEPOLIA", true),
      evm(sepolia, "RPC_ETHEREUM"),
      evm(arbitrumSepolia, "RPC_ARBITRUM"),
      evm(optimismSepolia, "RPC_OPTIMISM"),
      evm(polygonAmoy, "RPC_POLYGON"),
    ],
    primaryChainId: baseSepolia.id,
    solanaCluster: "devnet",
    bitcoinNetwork: "testnet",
  },
  mainnet: {
    evm: [
      evm(base, "RPC_BASE", true),
      evm(mainnet, "RPC_ETHEREUM"),
      evm(arbitrum, "RPC_ARBITRUM"),
      evm(optimism, "RPC_OPTIMISM"),
      evm(polygon, "RPC_POLYGON"),
    ],
    primaryChainId: base.id,
    solanaCluster: "mainnet-beta",
    bitcoinNetwork: "mainnet",
  },
  // LOCAL ANVIL ONLY (Wave 5). `CHAIN_ENV=local` (NEXT_PUBLIC_CHAIN_ENV=local)
  // activates a 31337 profile so the app's REAL read/broadcast path
  // (publicClientFor(31337) → /api/rpc/31337, serverRpcUrl(31337)) resolves
  // against a local anvil during the integration test — NOT a test-only side
  // client. `RPC_ANVIL` defaults to http://127.0.0.1:8545 (see allowlist.ts).
  local: {
    evm: [evm(foundry, "RPC_ANVIL", true)],
    primaryChainId: foundry.id, // 31337
    solanaCluster: "devnet",
    bitcoinNetwork: "testnet",
  },
};

/** The active chain profile for the current CHAIN_ENV. */
export function activeChain(): ChainProfile {
  return CHAINS[CHAIN_ENV];
}

/** Resolve an EVM entry in the ACTIVE profile; throws if the chain isn't active. */
export function evmEntry(chainId: number): EvmChainEntry {
  const entry = activeChain().evm.find((e) => e.chainId === chainId);
  if (!entry) {
    throw new Error(`Unknown or inactive EVM chainId: ${chainId}`);
  }
  return entry;
}
