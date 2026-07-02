import { keccak256, toBytes, zeroHash } from "viem";

/**
 * AccessControl role identifiers + per-contract role topology (Wave 9).
 * Mirrors `contracts/src/lib/Roles.sol` (each named role = keccak256("<NAME>"))
 * and the Deploy.s.sol:47–57 wiring. ENVIRONMENT-NEUTRAL — imported by the
 * browser composer, node unit tests, and the D1 anvil test alike.
 */

export const ADMIN_CONTRACTS = [
  "token",
  "passport",
  "governance",
  "treasury",
  "distributor",
  "staking",
] as const;
export type AdminContract = (typeof ADMIN_CONTRACTS)[number];

export const ROLE_NAMES = [
  "DEFAULT_ADMIN_ROLE",
  "GENESIS_ATTESTOR_ROLE",
  "PASSPORT_ADMIN_ROLE",
  "MINTER_ROLE",
  "PAUSER_ROLE",
  "GOVERNANCE_ROLE",
  "FUNDER_ROLE",
  "REWARDS_ADMIN_ROLE",
] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

/** bytes32 role ids: DEFAULT_ADMIN_ROLE = 0x00…00 (OZ AccessControl); the seven
 *  named roles = keccak256(toBytes(name)) exactly as Roles.sol computes them. */
export const ROLE_IDS: Record<RoleName, `0x${string}`> = Object.fromEntries(
  ROLE_NAMES.map((name) => [
    name,
    name === "DEFAULT_ADMIN_ROLE" ? zeroHash : keccak256(toBytes(name)),
  ]),
) as Record<RoleName, `0x${string}`>;

/** Which roles are meaningful per contract (Deploy.s.sol §roles + Roles.sol).
 *  NOTE (topology honesty): GOVERNANCE_ROLE on the treasury is held by the
 *  Governance CONTRACT (Deploy.s.sol:50), not an EOA/Safe. */
export const CONTRACT_ROLES: Record<AdminContract, readonly RoleName[]> = {
  token: ["DEFAULT_ADMIN_ROLE", "MINTER_ROLE", "PAUSER_ROLE"],
  passport: ["DEFAULT_ADMIN_ROLE", "GENESIS_ATTESTOR_ROLE", "PASSPORT_ADMIN_ROLE"],
  governance: ["DEFAULT_ADMIN_ROLE"],
  treasury: ["DEFAULT_ADMIN_ROLE", "GOVERNANCE_ROLE"],
  distributor: ["DEFAULT_ADMIN_ROLE", "FUNDER_ROLE"],
  staking: ["DEFAULT_ADMIN_ROLE", "REWARDS_ADMIN_ROLE"],
};
