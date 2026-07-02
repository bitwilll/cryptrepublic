import { encodeFunctionData, keccak256, stringToHex, toBytes, type Abi } from "viem";
import {
  accessControlAbi,
  adminDistributorAbi,
  adminGovernanceAbi,
  adminPassportAbi,
  adminStakingAbi,
  adminTokenAbi,
  adminTreasuryAbi,
} from "./abis";
import { ROLE_IDS, type AdminContract, type RoleName } from "./roles";

/**
 * PURE calldata encoders for the admin panel (Wave 9). PREPARED, NEVER SIGNED:
 * every function returns `{chainId, to, value, data, decoded}` artifacts (or a
 * 2-tx PreparedBatch / a GovernanceProposalPayload) for the USER's Safe or a
 * citizen wallet to review and submit — the panel holds no keys and broadcasts
 * nothing (enforced by test/no-admin-signing.test.ts).
 *
 * ENVIRONMENT-NEUTRAL and PURE: encodeFunctionData only — no RPC, no registry
 * imports. Contract ADDRESSES are explicit parameters (the UI feeds them from
 * /api/admin/chain/params), so the unregistered default env stays graceful.
 *
 * Validation MIRRORS the contract require strings and throws BEFORE encoding —
 * a prepared artifact that would revert on-chain is never produced silently.
 *
 * BUCKET MAPPING (recorded decision, notes #14): TreasuryAllocation.bucket
 * (human key, e.g. "embassy_ops") maps to the on-chain bytes32 as
 * `stringToHex(bucket, { size: 32 })` — ASCII name right-padded to 32 bytes.
 * readAdminParamsServer uses the SAME mapping (a mismatch would silently read
 * zeros). stringToHex THROWS for UTF-8 > 32 bytes, so prepareSetAllocation
 * validates the byte length FIRST as a designed mirror-throw; the B2
 * allocationSchema (/^[a-z0-9_]{1,32}$/) guarantees schema-valid rows are
 * always encodable.
 *
 * AUDIT SCOPE (addendum #8): composing/exporting prepared calldata is pure
 * client-side and writes NO AuditLog row — the Safe's own review/queue is the
 * audit surface for prepared transactions.
 */

export interface PreparedTx {
  chainId: number;
  to: `0x${string}`;
  value: "0"; // admin actions never move ETH from the panel
  data: `0x${string}`;
  decoded: {
    contract: AdminContract;
    functionName: string;
    args: Record<string, string>;
    summary: string;
  };
}

export interface PreparedBatch {
  chainId: number;
  kind: "single" | "batch";
  description: string;
  txs: PreparedTx[];
}

/** Payload for a GOVERNANCE PROPOSAL (GOVERNANCE_ROLE is held by the Governance
 *  CONTRACT — Deploy.s.sol:50 — an EOA/Safe cannot call these directly; the panel
 *  prepares the FULL propose() payload, NEVER a direct Safe tx).
 *  propose() takes FOUR args: (target, value, callData, descriptionHash)
 *  (CryptGovernance.sol:106–111). TWO submission prerequisites the note states:
 *  (1) the PROPOSER must be a citizen wallet — propose() reverts NotCitizen
 *  (sol:112) for any non-passport-holder, incl. a Safe that holds no passport;
 *  (2) descriptionHash must bind a GovernanceProposalContent row — same
 *  convention as the propose-embassy flow (EmbassiesApp.tsx:223):
 *  descriptionHash = keccak256(stringToHex(description)). An arbitrary hash
 *  would break the app's body↔descriptionHash binding (constraint #7). */
export interface GovernanceProposalPayload {
  chainId: number;
  target: `0x${string}`; // the treasury
  value: "0";
  callData: `0x${string}`;
  description: string; // the canonical description text (composer input)
  descriptionHash: `0x${string}`; // keccak256(stringToHex(description)) — the binding convention
  /** FULL propose(target,value,callData,descriptionHash) calldata addressed to the
   *  GOVERNANCE contract — the copyable artifact a citizen wallet submits. */
  propose: { to: `0x${string}`; value: "0"; data: `0x${string}` };
  decoded: PreparedTx["decoded"];
  note: string; // the honest-path note (BOTH prerequisites above), rendered in-UI
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

function tx(
  chainId: number,
  contract: AdminContract,
  to: `0x${string}`,
  abi: Abi,
  functionName: string,
  args: readonly unknown[],
  argsLabel: Record<string, string>,
  summary: string,
): PreparedTx {
  return {
    chainId,
    to,
    value: "0",
    data: encodeFunctionData({ abi, functionName, args } as never),
    decoded: { contract, functionName, args: argsLabel, summary },
  };
}

function single(description: string, one: PreparedTx): PreparedBatch {
  return { chainId: one.chainId, kind: "single", description, txs: [one] };
}

function batch(description: string, txs: PreparedTx[]): PreparedBatch {
  return { chainId: txs[0].chainId, kind: "batch", description, txs };
}

/** Mirror-throw for the bucket→bytes32 mapping (see header). */
function bucketToBytes32(bucket: string): `0x${string}` {
  if (toBytes(bucket).length > 32) {
    throw new Error(
      `Allocation bucket "${bucket}" exceeds 32 bytes UTF-8 — it cannot map to an on-chain bytes32 key.`,
    );
  }
  return stringToHex(bucket, { size: 32 });
}

function requirePositiveAmount(amount: bigint, what: string): void {
  if (amount <= 0n) throw new Error(`${what} amount must be > 0.`);
}

function requireDescription(description: string): string {
  if (description.trim().length === 0) {
    throw new Error("A proposal description is required (it binds the descriptionHash).");
  }
  return description;
}

// ---------------------------------------------------------------------------
// Role admin (works on any of the six contracts)
// ---------------------------------------------------------------------------

export function prepareGrantRole(
  chainId: number,
  contract: AdminContract,
  address: `0x${string}`,
  role: RoleName,
  account: `0x${string}`,
): PreparedBatch {
  return single(
    `Grant ${role} on ${contract} to ${account}`,
    tx(
      chainId,
      contract,
      address,
      accessControlAbi,
      "grantRole",
      [ROLE_IDS[role], account],
      { role: `${role} (${ROLE_IDS[role]})`, account },
      `grantRole(${role}, ${account})`,
    ),
  );
}

export function prepareRevokeRole(
  chainId: number,
  contract: AdminContract,
  address: `0x${string}`,
  role: RoleName,
  account: `0x${string}`,
): PreparedBatch {
  return single(
    `Revoke ${role} on ${contract} from ${account}`,
    tx(
      chainId,
      contract,
      address,
      accessControlAbi,
      "revokeRole",
      [ROLE_IDS[role], account],
      { role: `${role} (${ROLE_IDS[role]})`, account },
      `revokeRole(${role}, ${account})`,
    ),
  );
}

// ---------------------------------------------------------------------------
// Token (PAUSER_ROLE)
// ---------------------------------------------------------------------------

export function preparePause(chainId: number, token: `0x${string}`): PreparedBatch {
  return single(
    "Pause $CRYPT transfers",
    tx(chainId, "token", token, adminTokenAbi, "pause", [], {}, "pause()"),
  );
}

export function prepareUnpause(chainId: number, token: `0x${string}`): PreparedBatch {
  return single(
    "Unpause $CRYPT transfers",
    tx(chainId, "token", token, adminTokenAbi, "unpause", [], {}, "unpause()"),
  );
}

// ---------------------------------------------------------------------------
// Passport params (PASSPORT_ADMIN_ROLE) — mirrors "witnesses>10" (:213–216)
// ---------------------------------------------------------------------------

export function prepareSetRequiredWitnesses(
  chainId: number,
  passport: `0x${string}`,
  n: number,
): PreparedBatch {
  if (!Number.isInteger(n) || n < 0 || n > 10) {
    throw new Error(`witnesses>10 mirror: required witnesses must be an integer 0–10 (got ${n}).`);
  }
  return single(
    `Set required witnesses to ${n}`,
    tx(
      chainId,
      "passport",
      passport,
      adminPassportAbi,
      "setRequiredWitnesses",
      [n],
      { n: String(n) },
      `setRequiredWitnesses(${n})`,
    ),
  );
}

export function prepareSetBaseURI(
  chainId: number,
  passport: `0x${string}`,
  uri: string,
): PreparedBatch {
  return single(
    "Set passport base URI",
    tx(
      chainId,
      "passport",
      passport,
      adminPassportAbi,
      "setBaseURI",
      [uri],
      { uri },
      `setBaseURI(${uri})`,
    ),
  );
}

export function prepareSetBurnEnabled(
  chainId: number,
  passport: `0x${string}`,
  enabled: boolean,
): PreparedBatch {
  return single(
    `${enabled ? "Enable" : "Disable"} passport renounce/burn`,
    tx(
      chainId,
      "passport",
      passport,
      adminPassportAbi,
      "setBurnEnabled",
      [enabled],
      { enabled: String(enabled) },
      `setBurnEnabled(${enabled})`,
    ),
  );
}

// ---------------------------------------------------------------------------
// Governance params (DEFAULT_ADMIN_ROLE) — mirrors "quorum>100%" / "minCitizens<1"
// ---------------------------------------------------------------------------

export function prepareSetVotingPeriod(
  chainId: number,
  governance: `0x${string}`,
  seconds: bigint,
): PreparedBatch {
  return single(
    `Set voting period to ${seconds}s`,
    tx(
      chainId,
      "governance",
      governance,
      adminGovernanceAbi,
      "setVotingPeriod",
      [seconds],
      { period: seconds.toString() },
      `setVotingPeriod(${seconds})`,
    ),
  );
}

export function prepareSetQuorumBps(
  chainId: number,
  governance: `0x${string}`,
  bps: number,
): PreparedBatch {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new Error(`quorum>100% mirror: quorum bps must be an integer 0–10000 (got ${bps}).`);
  }
  return single(
    `Set quorum to ${bps} bps`,
    tx(
      chainId,
      "governance",
      governance,
      adminGovernanceAbi,
      "setQuorumBps",
      [bps],
      { bps: String(bps) },
      `setQuorumBps(${bps})`,
    ),
  );
}

export function prepareSetExecutionDelay(
  chainId: number,
  governance: `0x${string}`,
  seconds: bigint,
): PreparedBatch {
  return single(
    `Set execution delay to ${seconds}s`,
    tx(
      chainId,
      "governance",
      governance,
      adminGovernanceAbi,
      "setExecutionDelay",
      [seconds],
      { delay: seconds.toString() },
      `setExecutionDelay(${seconds})`,
    ),
  );
}

export function prepareSetMinCitizens(
  chainId: number,
  governance: `0x${string}`,
  min: bigint,
): PreparedBatch {
  if (min < 1n) {
    throw new Error(`minCitizens<1 mirror: the proposal floor must be >= 1 (got ${min}).`);
  }
  return single(
    `Set min citizens for proposal to ${min}`,
    tx(
      chainId,
      "governance",
      governance,
      adminGovernanceAbi,
      "setMinCitizensForProposal",
      [min],
      { minCitizens: min.toString() },
      `setMinCitizensForProposal(${min})`,
    ),
  );
}

export function prepareSetTargetAllowed(
  chainId: number,
  governance: `0x${string}`,
  target: `0x${string}`,
  ok: boolean,
): PreparedBatch {
  return single(
    `${ok ? "Allow" : "Disallow"} execution target ${target}`,
    tx(
      chainId,
      "governance",
      governance,
      adminGovernanceAbi,
      "setTargetAllowed",
      [target, ok],
      { target, ok: String(ok) },
      `setTargetAllowed(${target}, ${ok})`,
    ),
  );
}

// ---------------------------------------------------------------------------
// Treasury (DEFAULT_ADMIN_ROLE direct) — mirrors AllocationOverflow (:79–85):
// on-chain rule is `total − current[bucket] + new <= 10000`; the caller supplies
// `currentTotalMinusBucket` (the live on-chain figure from serverReads — note #11).
// ---------------------------------------------------------------------------

export function prepareSetAllocation(
  chainId: number,
  treasury: `0x${string}`,
  bucket: string,
  bps: number,
  currentTotalMinusBucket: number,
): PreparedBatch {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new Error(`Allocation bps must be an integer 0–10000 (got ${bps}).`);
  }
  if (currentTotalMinusBucket + bps > 10_000) {
    throw new Error(
      `AllocationOverflow mirror: ${currentTotalMinusBucket} + ${bps} bps exceeds 10000 (100%).`,
    );
  }
  const bucketBytes32 = bucketToBytes32(bucket); // designed mirror-throw for > 32 bytes
  return single(
    `Set allocation ${bucket} to ${bps} bps`,
    tx(
      chainId,
      "treasury",
      treasury,
      adminTreasuryAbi,
      "setAllocation",
      [bucketBytes32, bps],
      { bucket: `${bucket} (${bucketBytes32})`, bps: String(bps) },
      `setAllocation(${bucket}, ${bps})`,
    ),
  );
}

export function prepareSetAssetWhitelist(
  chainId: number,
  treasury: `0x${string}`,
  token: `0x${string}`,
  ok: boolean,
): PreparedBatch {
  return single(
    `${ok ? "Whitelist" : "De-whitelist"} treasury asset ${token}`,
    tx(
      chainId,
      "treasury",
      treasury,
      adminTreasuryAbi,
      "setAssetWhitelist",
      [token, ok],
      { token, ok: String(ok) },
      `setAssetWhitelist(${token}, ${ok})`,
    ),
  );
}

// ---------------------------------------------------------------------------
// Treasury (GOVERNANCE_ROLE) — proposal payloads, NOT Safe txs
// ---------------------------------------------------------------------------

const PROPOSAL_NOTE =
  "GOVERNANCE_ROLE is held by the Governance CONTRACT (Deploy.s.sol:50) — this action can " +
  "ONLY execute through a passed governance proposal, never as a direct Safe transaction. " +
  "Submission prerequisites: (1) the proposer must be a CITIZEN wallet — propose() reverts " +
  "NotCitizen for any non-passport-holder, so a Safe cannot submit this unless the Safe " +
  "itself holds a passport; (2) create the matching GovernanceProposalContent row so the " +
  "descriptionHash (keccak256(stringToHex(description)) — the propose-embassy convention) " +
  "binds the proposal body.";

function governanceProposalPayload(
  chainId: number,
  governance: `0x${string}`,
  treasury: `0x${string}`,
  callData: `0x${string}`,
  description: string,
  decoded: PreparedTx["decoded"],
): GovernanceProposalPayload {
  const descriptionHash = keccak256(stringToHex(requireDescription(description)));
  return {
    chainId,
    target: treasury,
    value: "0",
    callData,
    description,
    descriptionHash,
    propose: {
      to: governance,
      value: "0",
      data: encodeFunctionData({
        abi: adminGovernanceAbi,
        functionName: "propose",
        args: [treasury, 0n, callData, descriptionHash],
      }),
    },
    decoded,
    note: PROPOSAL_NOTE,
  };
}

export function prepareDisburseProposal(
  chainId: number,
  governance: `0x${string}`,
  treasury: `0x${string}`,
  token: `0x${string}`,
  to: `0x${string}`,
  amount: bigint,
  description: string,
): GovernanceProposalPayload {
  requirePositiveAmount(amount, "Disburse");
  const callData = encodeFunctionData({
    abi: adminTreasuryAbi,
    functionName: "disburse",
    args: [token, to, amount],
  });
  return governanceProposalPayload(chainId, governance, treasury, callData, description, {
    contract: "treasury",
    functionName: "disburse",
    args: { token, to, amount: amount.toString() },
    summary: `disburse(${token}, ${to}, ${amount})`,
  });
}

export function prepareFundDividendsProposal(
  chainId: number,
  governance: `0x${string}`,
  treasury: `0x${string}`,
  distributor: `0x${string}`,
  amount: bigint,
  description: string,
): GovernanceProposalPayload {
  requirePositiveAmount(amount, "fundDividends");
  const callData = encodeFunctionData({
    abi: adminTreasuryAbi,
    functionName: "fundDividends",
    args: [distributor, amount],
  });
  return governanceProposalPayload(chainId, governance, treasury, callData, description, {
    contract: "treasury",
    functionName: "fundDividends",
    args: { distributor, amount: amount.toString() },
    summary: `fundDividends(${distributor}, ${amount})`,
  });
}

// ---------------------------------------------------------------------------
// Dividends — the 2-tx epoch batch. openEpoch PULLS via safeTransferFrom
// (DividendDistributor.sol:63–71): a lone openEpoch WILL revert; the approve
// must land first — always emit the ordered pair (note #12).
// ---------------------------------------------------------------------------

export function prepareOpenEpochBatch(
  chainId: number,
  token: `0x${string}`,
  distributor: `0x${string}`,
  amount: bigint,
): PreparedBatch {
  requirePositiveAmount(amount, "Epoch");
  return batch(`Open dividend epoch for ${amount} $CRYPT (2-tx: approve, then openEpoch)`, [
    tx(
      chainId,
      "token",
      token,
      adminTokenAbi,
      "approve",
      [distributor, amount],
      { spender: distributor, amount: amount.toString() },
      `approve(${distributor}, ${amount})`,
    ),
    tx(
      chainId,
      "distributor",
      distributor,
      adminDistributorAbi,
      "openEpoch",
      [amount],
      { amount: amount.toString() },
      `openEpoch(${amount})`,
    ),
  ]);
}

// ---------------------------------------------------------------------------
// Staking (REWARDS_ADMIN_ROLE) — mirrors "apr>500%" (:122–126); fundRewards is
// the same pull pattern (:128–131) — 2-tx batch.
// ---------------------------------------------------------------------------

export function prepareSetApr(chainId: number, staking: `0x${string}`, bps: number): PreparedBatch {
  if (!Number.isInteger(bps) || bps < 0 || bps > 50_000) {
    throw new Error(`apr>500% mirror: APR bps must be an integer 0–50000 (got ${bps}).`);
  }
  return single(
    `Set staking APR to ${bps} bps (prospective only)`,
    tx(
      chainId,
      "staking",
      staking,
      adminStakingAbi,
      "setApr",
      [bps],
      { bps: String(bps) },
      `setApr(${bps})`,
    ),
  );
}

export function prepareFundRewardsBatch(
  chainId: number,
  token: `0x${string}`,
  staking: `0x${string}`,
  amount: bigint,
): PreparedBatch {
  requirePositiveAmount(amount, "fundRewards");
  return batch(`Fund staking rewards with ${amount} $CRYPT (2-tx: approve, then fundRewards)`, [
    tx(
      chainId,
      "token",
      token,
      adminTokenAbi,
      "approve",
      [staking, amount],
      { spender: staking, amount: amount.toString() },
      `approve(${staking}, ${amount})`,
    ),
    tx(
      chainId,
      "staking",
      staking,
      adminStakingAbi,
      "fundRewards",
      [amount],
      { amount: amount.toString() },
      `fundRewards(${amount})`,
    ),
  ]);
}

// ---------------------------------------------------------------------------
// Safe Transaction Builder export (plain JSON — no Safe SDK; the USER imports
// the file into the Safe web app's Transaction Builder)
// ---------------------------------------------------------------------------

export interface SafeTxBuilderJson {
  version: "1.0";
  chainId: string; // decimal string
  createdAt: number;
  meta: { name: string; description: string };
  transactions: { to: `0x${string}`; value: string; data: `0x${string}` }[];
}

export function safeTxBuilderJson(batch: PreparedBatch): SafeTxBuilderJson {
  return {
    version: "1.0",
    chainId: String(batch.chainId),
    createdAt: Date.now(),
    meta: {
      name: `CryptRepublic admin: ${batch.txs[0]?.decoded.functionName ?? "action"}`,
      description: batch.description,
    },
    transactions: batch.txs.map((t) => ({ to: t.to, value: t.value, data: t.data })),
  };
}
