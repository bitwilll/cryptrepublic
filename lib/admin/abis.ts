import { parseAbi } from "viem";

/**
 * FROZEN — admin-surface ABIs, generated from `contracts/src/*.sol` (Wave 9).
 * Every signature below byte-matches the on-chain external surface the admin
 * panel PREPARES calldata for. Do NOT edit the contracts this wave; the
 * user-path ABIs (lib/{passport,governance,treasury,dividends}/abi.ts) are a
 * SEPARATE frozen module — this file is self-contained so the browser
 * composer, node unit tests, and the D1 anvil test can all import it.
 *
 * ENVIRONMENT-NEUTRAL: no "server-only"/"client-only" marker, no RPC.
 */

/** OpenZeppelin AccessControl (inherited by all six contracts; NOT enumerable). */
export const accessControlAbi = parseAbi([
  "function grantRole(bytes32 role, address account)",
  "function revokeRole(bytes32 role, address account)",
  "function renounceRole(bytes32 role, address callerConfirmation)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function getRoleAdmin(bytes32 role) view returns (bytes32)",
  "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)",
  "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)",
]);

/** CryptToken.sol — mint (MINTER_ROLE, CapExceeded :33–36), pause/unpause (PAUSER_ROLE :38–44),
 *  ERC20 approve (needed by the epoch/fundRewards 2-tx pull batches). */
export const adminTokenAbi = parseAbi([
  "function mint(address to, uint256 amount)",
  "function pause()",
  "function unpause()",
  "function paused() view returns (bool)",
  "function MAX_SUPPLY() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

/** CryptRepublicPassport.sol — genesisMint :114 / adminMint :122 / setRequiredWitnesses
 *  ("witnesses>10" :213–216) / setBaseURI :219 / setBurnEnabled :224. */
export const adminPassportAbi = parseAbi([
  "function genesisMint(address to, bytes32 nameHash, bytes32 motto, bytes32 domicile)",
  "function adminMint(address to, bytes32 nameHash, bytes32 motto, bytes32 domicile)",
  "function setRequiredWitnesses(uint8 n)",
  "function setBaseURI(string uri)",
  "function setBurnEnabled(bool enabled)",
  "function requiredWitnesses() view returns (uint8)",
  "function burnEnabled() view returns (bool)",
]);

/** CryptGovernance.sol — propose() takes FOUR args (:106–111, reverts NotCitizen :112) — kept
 *  here for the treasury proposal payloads' propose() artifact; param setters :201–226
 *  ("quorum>100%" :206–209, "minCitizens<1" :217–220) — all DEFAULT_ADMIN_ROLE. */
export const adminGovernanceAbi = parseAbi([
  "function propose(address target, uint256 value, bytes callData, bytes32 descriptionHash) returns (uint256 proposalId)",
  "function setVotingPeriod(uint256 period)",
  "function setQuorumBps(uint16 bps)",
  "function setExecutionDelay(uint256 delay)",
  "function setMinCitizensForProposal(uint256 minCitizens)",
  "function setTargetAllowed(address target, bool ok)",
  "function votingPeriod() view returns (uint256)",
  "function quorumBps() view returns (uint16)",
  "function executionDelay() view returns (uint256)",
  "function minCitizensForProposal() view returns (uint256)",
  "function targetAllowed(address) view returns (bool)",
]);

/** CryptTreasury.sol — disburse :47 / fundDividends :66 (both GOVERNANCE_ROLE — held by the
 *  Governance CONTRACT, Deploy.s.sol:50, so those are PROPOSAL payloads); setAllocation
 *  (AllocationOverflow :79–85) + setAssetWhitelist :87 (DEFAULT_ADMIN_ROLE). */
export const adminTreasuryAbi = parseAbi([
  "function disburse(address token, address to, uint256 amount)",
  "function fundDividends(address distributor, uint256 amount)",
  "function setAllocation(bytes32 bucket, uint16 bps)",
  "function setAssetWhitelist(address token, bool ok)",
  "function allocationBps(bytes32 bucket) view returns (uint16)",
  "function totalAllocationBps() view returns (uint16)",
  "function assetWhitelist(address token) view returns (bool)",
]);

/** DividendDistributor.sol — openEpoch (FUNDER_ROLE :63–65; PULLS via safeTransferFrom, so a
 *  prepared epoch is ALWAYS the approve+openEpoch 2-tx batch); epochs tuple getter included
 *  per addendum #7 (D1 Proof C asserts epochs(1).open + perCitizen). */
export const adminDistributorAbi = parseAbi([
  "function openEpoch(uint256 amount) returns (uint256 epochId)",
  "function currentEpoch() view returns (uint256)",
  "function epochs(uint256) view returns (uint256 amount, uint256 snapshotCitizens, uint256 perCitizen, uint64 openedAt, bool open)",
]);

/** CryptStaking.sol — setApr ("apr>500%", prospective-only :122–126) + fundRewards (pull
 *  pattern :128–131) — both REWARDS_ADMIN_ROLE. */
export const adminStakingAbi = parseAbi([
  "function setApr(uint16 bps)",
  "function fundRewards(uint256 amount)",
  "function aprBps() view returns (uint16)",
  "function totalStaked() view returns (uint256)",
  "function rewardPoolRemaining() view returns (uint256)",
]);
