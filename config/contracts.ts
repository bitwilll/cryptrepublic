/**
 * Typed CryptRepublic contract address registry, keyed by chainId.
 *
 * The single place any contract (passport, $CRYPT token) address lives — nothing
 * else in the app may hardcode a contract address. Mirrors `config/tokens.ts` and
 * `config/chains.config.ts`.
 *
 * - `31337` = local anvil. Filled by `scripts/emit-contract-addresses.mjs` from a
 *   LOCAL Foundry broadcast after `Deploy.s.sol` runs. LOCAL ONLY.
 * - `84532` (Base Sepolia) / `8453` (Base mainnet) are TYPED PLACEHOLDERS
 *   (`undefined`) filled by the USER after a real deploy (see
 *   `contracts/docs/DEPLOY_RUNBOOK.md`). Reading an undefined address throws.
 */

export interface ContractEntry {
  /** undefined = not deployed / not registered on this chain yet. */
  passport?: `0x${string}`;
  token?: `0x${string}`;
}

/** Keyed by chainId. 31337 = local anvil (filled by scripts/emit-contract-addresses.mjs). */
export const CONTRACTS: Record<number, ContractEntry> = {
  // --- Local anvil (filled by scripts/emit-contract-addresses.mjs) ---
  31337: {},
  // --- Base Sepolia testnet (USER fills after deploy) ---
  84532: {},
  // --- Base mainnet (USER fills after deploy) ---
  8453: {},
};

/** Returns the entry for a chain, or `{}` for an unknown chain. */
export function contractEntry(chainId: number): ContractEntry {
  return CONTRACTS[chainId] ?? {};
}

/**
 * The passport address for a chain. Throws a clear error if the passport is not
 * registered on that chain (undefined placeholder or unknown chain).
 */
export function passportAddress(chainId: number): `0x${string}` {
  const addr = contractEntry(chainId).passport;
  if (!addr) {
    throw new Error(`Passport not deployed on chain ${chainId}`);
  }
  return addr;
}
