"use client";
import { useCallback, useEffect, useState } from "react";
import { getAddress, isAddress, keccak256, stringToHex } from "viem";
import { nameHashOf, toBytes32String } from "@/lib/passport/attestation";
import {
  prepareAdminMint,
  prepareGrantRole,
  prepareRevokeRole,
  preparePause,
  prepareUnpause,
  prepareSetRequiredWitnesses,
  prepareSetBaseURI,
  prepareSetBurnEnabled,
  prepareSetVotingPeriod,
  prepareSetQuorumBps,
  prepareSetExecutionDelay,
  prepareSetMinCitizens,
  prepareSetTargetAllowed,
  prepareSetAllocation,
  prepareSetAssetWhitelist,
  prepareOpenEpochBatch,
  prepareFundRewardsBatch,
  prepareSetApr,
  prepareDisburseProposal,
  prepareFundDividendsProposal,
  type GovernanceProposalPayload,
  type PreparedBatch,
} from "@/lib/admin/prepare";
import { CONTRACT_ROLES, type AdminContract, type RoleName } from "@/lib/admin/roles";
import { PreparedActionCard, type RequiredRoleInfo } from "./PreparedActionCard";
import { Skeleton, CardError, Field, inputStyle, TagLabel, type Load } from "./bits";

/**
 * Chain actions (Wave 9 C4): current per-contract params, the CONFIRMED role
 * topology, and the prepared-transaction composer. READS + PURE ENCODING ONLY
 * (constraint #1) — the composer is a thin form over lib/admin/prepare's pure
 * encoders; nothing here holds keys or broadcasts.
 *
 * ADDRESSES come from /api/admin/chain/params (server-resolved) — NEVER the
 * client-side registry accessors, which THROW on the unregistered default env
 * (note #7). available:false renders the one graceful in-voice card.
 *
 * Client-side validation MIRRORS the contract requires (same bounds as
 * prepare.ts) and shows them inline BEFORE encoding; prepare's throws are the
 * backstop (caught and rendered).
 */

interface ParamsPayload {
  chainId: number;
  available: boolean;
  addresses: Partial<Record<AdminContract, `0x${string}`>>;
  token?: { paused: boolean; maxSupply: string; totalSupply: string };
  passport?: { requiredWitnesses: number; burnEnabled: boolean };
  governance?: {
    votingPeriod: string;
    quorumBps: number;
    executionDelay: string;
    minCitizensForProposal: string;
  };
  treasury?: {
    totalAllocationBps: number;
    allocations: { bucket: string; onchainBps: number | null }[];
  };
  distributor?: { currentEpoch: string };
  staking?: { aprBps: number; totalStaked: string; rewardPoolRemaining: string };
}

interface TopologyPayload {
  chainId: number;
  available: boolean;
  contracts: {
    contract: AdminContract;
    address: `0x${string}`;
    roles: { role: RoleName; roleId: string; holders: `0x${string}`[] }[];
  }[];
}

type Values = Record<string, string | boolean>;

interface Ctx {
  chainId: number;
  addresses: Partial<Record<AdminContract, `0x${string}`>>;
  params: ParamsPayload;
}

interface ComposerField {
  key: string;
  label: string;
  kind: "text" | "checkbox" | "textarea" | "select";
  options?: readonly string[] | ((v: Values, ctx: Ctx) => readonly string[]);
  placeholder?: string;
}

interface ActionDef {
  id: string;
  label: string;
  requires: readonly AdminContract[];
  fields: ComposerField[];
  info?: string;
  mirror: (v: Values, ctx: Ctx) => string | null;
  build: (v: Values, ctx: Ctx) => PreparedBatch | GovernanceProposalPayload;
  role: (v: Values) => { contract: AdminContract; role: RoleName };
  defaults?: (ctx: Ctx) => Values;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const POSITIVE_INT_RE = /^\d+$/;

function addr(v: Values, key: string): `0x${string}` {
  return String(v[key]) as `0x${string}`;
}

function badAddress(v: Values, key: string, label: string): string | null {
  return ADDRESS_RE.test(String(v[key] ?? "")) ? null : `${label} must be a 0x address (40 hex).`;
}

function badAmount(v: Values, key: string, label: string): string | null {
  const s = String(v[key] ?? "");
  if (!POSITIVE_INT_RE.test(s) || BigInt(s) <= 0n) return `${label} must be a positive integer.`;
  return null;
}

const ACTIONS: ActionDef[] = [
  {
    id: "grant_role",
    label: "Grant a role",
    requires: [],
    fields: [
      {
        key: "contract",
        label: "Contract",
        kind: "select",
        options: (_v, ctx) => Object.keys(ctx.addresses),
      },
      {
        key: "role",
        label: "Role",
        kind: "select",
        options: (v) => CONTRACT_ROLES[(v.contract as AdminContract) ?? "token"] ?? [],
      },
      { key: "account", label: "Account address", kind: "text", placeholder: "0x…" },
    ],
    defaults: (ctx) => {
      const contract = (Object.keys(ctx.addresses)[0] ?? "token") as AdminContract;
      return { contract, role: CONTRACT_ROLES[contract][0], account: "" };
    },
    mirror: (v) => badAddress(v, "account", "Account"),
    build: (v, ctx) =>
      prepareGrantRole(
        ctx.chainId,
        v.contract as AdminContract,
        ctx.addresses[v.contract as AdminContract]!,
        v.role as RoleName,
        addr(v, "account"),
      ),
    role: (v) => ({ contract: v.contract as AdminContract, role: "DEFAULT_ADMIN_ROLE" }),
  },
  {
    id: "revoke_role",
    label: "Revoke a role",
    requires: [],
    fields: [
      {
        key: "contract",
        label: "Contract",
        kind: "select",
        options: (_v, ctx) => Object.keys(ctx.addresses),
      },
      {
        key: "role",
        label: "Role",
        kind: "select",
        options: (v) => CONTRACT_ROLES[(v.contract as AdminContract) ?? "token"] ?? [],
      },
      { key: "account", label: "Account address", kind: "text", placeholder: "0x…" },
    ],
    defaults: (ctx) => {
      const contract = (Object.keys(ctx.addresses)[0] ?? "token") as AdminContract;
      return { contract, role: CONTRACT_ROLES[contract][0], account: "" };
    },
    mirror: (v) => badAddress(v, "account", "Account"),
    build: (v, ctx) =>
      prepareRevokeRole(
        ctx.chainId,
        v.contract as AdminContract,
        ctx.addresses[v.contract as AdminContract]!,
        v.role as RoleName,
        addr(v, "account"),
      ),
    role: (v) => ({ contract: v.contract as AdminContract, role: "DEFAULT_ADMIN_ROLE" }),
  },
  {
    id: "pause",
    label: "Pause $CRYPT transfers",
    requires: ["token"],
    fields: [],
    mirror: () => null,
    build: (_v, ctx) => preparePause(ctx.chainId, ctx.addresses.token!),
    role: () => ({ contract: "token", role: "PAUSER_ROLE" }),
  },
  {
    id: "unpause",
    label: "Unpause $CRYPT transfers",
    requires: ["token"],
    fields: [],
    mirror: () => null,
    build: (_v, ctx) => prepareUnpause(ctx.chainId, ctx.addresses.token!),
    role: () => ({ contract: "token", role: "PAUSER_ROLE" }),
  },
  {
    id: "set_required_witnesses",
    label: "Passport: set required witnesses",
    requires: ["passport"],
    fields: [{ key: "n", label: "Required witnesses (0-10)", kind: "text" }],
    mirror: (v) => {
      const n = Number(v.n);
      return Number.isInteger(n) && n >= 0 && n <= 10
        ? null
        : "Required witnesses must be an integer 0-10 (the contract requires witnesses <= 10).";
    },
    build: (v, ctx) =>
      prepareSetRequiredWitnesses(ctx.chainId, ctx.addresses.passport!, Number(v.n)),
    role: () => ({ contract: "passport", role: "PASSPORT_ADMIN_ROLE" }),
  },
  {
    id: "admin_mint",
    label: "Passport: ADMIN MINT (override witnesses)",
    requires: ["passport"],
    fields: [
      { key: "to", label: "Destination address", kind: "text", placeholder: "0x…" },
      { key: "name", label: "Declared name", kind: "text" },
      { key: "motto", label: "Motto (≤31 bytes)", kind: "text" },
      { key: "city", label: "Domicile city (≤31 bytes)", kind: "text" },
    ],
    // Checksum semantics (addendum #4, corrected to viem's actual API — viem's
    // getAddress re-checksums without throwing on any 40-hex string): validity
    // = STRICT isAddress(input), which accepts all-lowercase (valid, viem
    // checksums it) and REJECTS a wrong-checksum mixed-case address. `build`
    // encodes the NORMALIZED checksummed form via getAddress.
    mirror: (v) => {
      const shape = badAddress(v, "to", "Destination");
      if (shape) return shape;
      if (!isAddress(String(v.to))) {
        return "Address checksum is invalid — re-copy the exact checksummed address.";
      }
      if (!String(v.name ?? "").trim()) return "A declared name is required.";
      return null;
    },
    build: (v, ctx) =>
      prepareAdminMint(
        ctx.chainId,
        ctx.addresses.passport!,
        getAddress(String(v.to)),
        nameHashOf(String(v.name).trim()),
        toBytes32String(
          String(v.motto ?? "")
            .trim()
            .slice(0, 31),
        ),
        toBytes32String(
          String(v.city ?? "")
            .trim()
            .slice(0, 31),
        ),
      ),
    role: () => ({ contract: "passport", role: "PASSPORT_ADMIN_ROLE" }),
  },
  {
    id: "set_base_uri",
    label: "Passport: set base URI",
    requires: ["passport"],
    fields: [{ key: "uri", label: "Base URI", kind: "text" }],
    mirror: (v) => (String(v.uri ?? "").trim() ? null : "A base URI is required."),
    build: (v, ctx) => prepareSetBaseURI(ctx.chainId, ctx.addresses.passport!, String(v.uri)),
    role: () => ({ contract: "passport", role: "PASSPORT_ADMIN_ROLE" }),
  },
  {
    id: "set_burn_enabled",
    label: "Passport: set burn enabled",
    requires: ["passport"],
    fields: [{ key: "enabled", label: "Burn enabled", kind: "checkbox" }],
    mirror: () => null,
    build: (v, ctx) =>
      prepareSetBurnEnabled(ctx.chainId, ctx.addresses.passport!, Boolean(v.enabled)),
    role: () => ({ contract: "passport", role: "PASSPORT_ADMIN_ROLE" }),
  },
  {
    id: "set_voting_period",
    label: "Governance: set voting period",
    requires: ["governance"],
    fields: [{ key: "seconds", label: "Voting period (seconds)", kind: "text" }],
    mirror: (v) => badAmount(v, "seconds", "Voting period"),
    build: (v, ctx) =>
      prepareSetVotingPeriod(ctx.chainId, ctx.addresses.governance!, BigInt(String(v.seconds))),
    role: () => ({ contract: "governance", role: "DEFAULT_ADMIN_ROLE" }),
  },
  {
    id: "set_quorum_bps",
    label: "Governance: set quorum (bps)",
    requires: ["governance"],
    fields: [{ key: "bps", label: "Quorum (bps, max 10000)", kind: "text" }],
    mirror: (v) => {
      const n = Number(v.bps);
      return Number.isInteger(n) && n >= 0 && n <= 10_000
        ? null
        : "Quorum must be an integer 0-10000 bps (the contract requires quorum <= 100%).";
    },
    build: (v, ctx) => prepareSetQuorumBps(ctx.chainId, ctx.addresses.governance!, Number(v.bps)),
    role: () => ({ contract: "governance", role: "DEFAULT_ADMIN_ROLE" }),
  },
  {
    id: "set_execution_delay",
    label: "Governance: set execution delay",
    requires: ["governance"],
    fields: [{ key: "seconds", label: "Execution delay (seconds)", kind: "text" }],
    mirror: (v) => badAmount(v, "seconds", "Execution delay"),
    build: (v, ctx) =>
      prepareSetExecutionDelay(ctx.chainId, ctx.addresses.governance!, BigInt(String(v.seconds))),
    role: () => ({ contract: "governance", role: "DEFAULT_ADMIN_ROLE" }),
  },
  {
    id: "set_min_citizens",
    label: "Governance: set min citizens for proposal",
    requires: ["governance"],
    fields: [{ key: "min", label: "Min citizens (>= 1)", kind: "text" }],
    mirror: (v) => {
      const s = String(v.min ?? "");
      return POSITIVE_INT_RE.test(s) && BigInt(s) >= 1n
        ? null
        : "Min citizens must be an integer >= 1 (the contract requires minCitizens >= 1).";
    },
    build: (v, ctx) =>
      prepareSetMinCitizens(ctx.chainId, ctx.addresses.governance!, BigInt(String(v.min))),
    role: () => ({ contract: "governance", role: "DEFAULT_ADMIN_ROLE" }),
  },
  {
    id: "set_target_allowed",
    label: "Governance: set execution target allowed",
    requires: ["governance"],
    fields: [
      { key: "target", label: "Target address", kind: "text", placeholder: "0x…" },
      { key: "ok", label: "Allowed", kind: "checkbox" },
    ],
    mirror: (v) => badAddress(v, "target", "Target"),
    build: (v, ctx) =>
      prepareSetTargetAllowed(
        ctx.chainId,
        ctx.addresses.governance!,
        addr(v, "target"),
        Boolean(v.ok),
      ),
    role: () => ({ contract: "governance", role: "DEFAULT_ADMIN_ROLE" }),
  },
  {
    id: "set_allocation",
    label: "Treasury: set allocation (bps)",
    requires: ["treasury"],
    fields: [
      { key: "bucket", label: "Bucket (a-z, 0-9, _)", kind: "text" },
      { key: "bps", label: "Target (bps, max 10000)", kind: "text" },
    ],
    info: "On-chain rule: total - current[bucket] + new <= 10000. The live figures come from the params panel.",
    mirror: (v, ctx) => {
      if (!/^[a-z0-9_]{1,32}$/.test(String(v.bucket ?? ""))) {
        return "Bucket must match [a-z0-9_], max 32 chars (the on-chain bytes32 mapping).";
      }
      const n = Number(v.bps);
      if (!Number.isInteger(n) || n < 0 || n > 10_000) {
        return "Allocation must be an integer 0-10000 bps.";
      }
      const t = ctx.params.treasury;
      if (t) {
        const current = t.allocations.find((a) => a.bucket === String(v.bucket))?.onchainBps ?? 0;
        if (t.totalAllocationBps - current + n > 10_000) {
          return `Allocation would overflow: ${t.totalAllocationBps} - ${current} + ${n} bps exceeds 10000 (100%).`;
        }
      }
      return null;
    },
    build: (v, ctx) => {
      const t = ctx.params.treasury;
      const current = t?.allocations.find((a) => a.bucket === String(v.bucket))?.onchainBps ?? 0;
      return prepareSetAllocation(
        ctx.chainId,
        ctx.addresses.treasury!,
        String(v.bucket),
        Number(v.bps),
        (t?.totalAllocationBps ?? 0) - current,
      );
    },
    role: () => ({ contract: "treasury", role: "DEFAULT_ADMIN_ROLE" }),
  },
  {
    id: "set_asset_whitelist",
    label: "Treasury: set asset whitelist",
    requires: ["treasury"],
    fields: [
      { key: "token", label: "Asset token address", kind: "text", placeholder: "0x…" },
      { key: "ok", label: "Whitelisted", kind: "checkbox" },
    ],
    mirror: (v) => badAddress(v, "token", "Asset token"),
    build: (v, ctx) =>
      prepareSetAssetWhitelist(
        ctx.chainId,
        ctx.addresses.treasury!,
        addr(v, "token"),
        Boolean(v.ok),
      ),
    role: () => ({ contract: "treasury", role: "DEFAULT_ADMIN_ROLE" }),
  },
  {
    id: "open_epoch",
    label: "Dividends: open epoch (2-tx batch)",
    requires: ["token", "distributor"],
    fields: [{ key: "amount", label: "Amount ($CRYPT wei)", kind: "text" }],
    info: "1. approve — 2. openEpoch (pulls the funds). A lone openEpoch reverts: it pulls via safeTransferFrom.",
    mirror: (v) => badAmount(v, "amount", "Epoch amount"),
    build: (v, ctx) =>
      prepareOpenEpochBatch(
        ctx.chainId,
        ctx.addresses.token!,
        ctx.addresses.distributor!,
        BigInt(String(v.amount)),
      ),
    role: () => ({ contract: "distributor", role: "FUNDER_ROLE" }),
  },
  {
    id: "fund_rewards",
    label: "Staking: fund rewards (2-tx batch)",
    requires: ["token", "staking"],
    fields: [{ key: "amount", label: "Amount ($CRYPT wei)", kind: "text" }],
    info: "1. approve — 2. fundRewards (pulls the funds).",
    mirror: (v) => badAmount(v, "amount", "Rewards amount"),
    build: (v, ctx) =>
      prepareFundRewardsBatch(
        ctx.chainId,
        ctx.addresses.token!,
        ctx.addresses.staking!,
        BigInt(String(v.amount)),
      ),
    role: () => ({ contract: "staking", role: "REWARDS_ADMIN_ROLE" }),
  },
  {
    id: "set_apr",
    label: "Staking: set APR (bps)",
    requires: ["staking"],
    fields: [{ key: "bps", label: "APR (bps, max 50000)", kind: "text" }],
    mirror: (v) => {
      const n = Number(v.bps);
      return Number.isInteger(n) && n >= 0 && n <= 50_000
        ? null
        : "APR must be an integer 0-50000 bps (the contract requires apr <= 500%).";
    },
    build: (v, ctx) => prepareSetApr(ctx.chainId, ctx.addresses.staking!, Number(v.bps)),
    role: () => ({ contract: "staking", role: "REWARDS_ADMIN_ROLE" }),
  },
  {
    id: "disburse_proposal",
    label: "Treasury: disburse (GOVERNANCE PROPOSAL payload)",
    requires: ["governance", "treasury", "token"],
    fields: [
      { key: "token", label: "Token address", kind: "text", placeholder: "0x…" },
      { key: "to", label: "Recipient address", kind: "text", placeholder: "0x…" },
      { key: "amount", label: "Amount (wei)", kind: "text" },
      { key: "description", label: "Proposal description", kind: "textarea" },
    ],
    defaults: (ctx) => ({
      token: ctx.addresses.token ?? "",
      to: "",
      amount: "",
      description: "",
    }),
    info: "GOVERNANCE_ROLE is held by the Governance CONTRACT — this prepares a propose() payload, never a direct Safe transaction.",
    mirror: (v) =>
      badAddress(v, "token", "Token") ??
      badAddress(v, "to", "Recipient") ??
      badAmount(v, "amount", "Disburse amount") ??
      (String(v.description ?? "").trim() ? null : "A proposal description is required."),
    build: (v, ctx) =>
      prepareDisburseProposal(
        ctx.chainId,
        ctx.addresses.governance!,
        ctx.addresses.treasury!,
        addr(v, "token"),
        addr(v, "to"),
        BigInt(String(v.amount)),
        String(v.description),
      ),
    role: () => ({ contract: "treasury", role: "GOVERNANCE_ROLE" }),
  },
  {
    id: "fund_dividends_proposal",
    label: "Treasury: fund dividends (GOVERNANCE PROPOSAL payload)",
    requires: ["governance", "treasury", "distributor"],
    fields: [
      { key: "amount", label: "Amount (wei)", kind: "text" },
      { key: "description", label: "Proposal description", kind: "textarea" },
    ],
    info: "GOVERNANCE_ROLE is held by the Governance CONTRACT — this prepares a propose() payload, never a direct Safe transaction.",
    mirror: (v) =>
      badAmount(v, "amount", "Amount") ??
      (String(v.description ?? "").trim() ? null : "A proposal description is required."),
    build: (v, ctx) =>
      prepareFundDividendsProposal(
        ctx.chainId,
        ctx.addresses.governance!,
        ctx.addresses.treasury!,
        ctx.addresses.distributor!,
        BigInt(String(v.amount)),
        String(v.description),
      ),
    role: () => ({ contract: "treasury", role: "GOVERNANCE_ROLE" }),
  },
];

export function ChainActionsApp() {
  const [params, setParams] = useState<Load<ParamsPayload>>({ status: "loading" });
  const [topology, setTopology] = useState<Load<TopologyPayload>>({ status: "loading" });

  const loadParams = useCallback(() => {
    setParams({ status: "loading" });
    fetch("/api/admin/chain/params")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: ParamsPayload) => setParams({ status: "ok", data: d }))
      .catch(() => setParams({ status: "error" }));
  }, []);

  const loadTopology = useCallback(() => {
    setTopology({ status: "loading" });
    fetch("/api/admin/chain/roles")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: TopologyPayload) => setTopology({ status: "ok", data: d }))
      .catch(() => setTopology({ status: "error" }));
  }, []);

  useEffect(() => {
    loadParams();
    loadTopology();
  }, [loadParams, loadTopology]);

  return (
    <div
      className="wrap"
      style={{ padding: "32px 0", display: "flex", flexDirection: "column", gap: 24 }}
    >
      <div className="kicker">CHAIN ACTIONS</div>

      {params.status === "loading" && (
        <article className="pillar" style={{ padding: "24px 28px" }}>
          <Skeleton lines={4} />
        </article>
      )}
      {params.status === "error" && (
        <article className="pillar" style={{ padding: "24px 28px" }}>
          <CardError onRetry={loadParams} testid="chain-params-error" />
        </article>
      )}
      {params.status === "ok" && !params.data.available && (
        <article
          className="pillar"
          data-testid="chain-unavailable"
          style={{ padding: "24px 28px" }}
        >
          <h3 style={{ margin: 0, fontSize: 20 }}>
            No admin contracts are registered on this chain.
          </h3>
          <p style={{ color: "var(--muted)", marginTop: 8, fontSize: 13 }}>
            The active chain (id {params.data.chainId}) has no registered contract addresses, so
            there is nothing to read and nothing to prepare. Register the deployed addresses in the
            contract registry to enable this screen.
          </p>
        </article>
      )}

      {params.status === "ok" && params.data.available && (
        <>
          <ParamsPanel params={params.data} />
          <TopologyPanel state={topology} onRetry={loadTopology} />
          <Composer params={params.data} topology={topology} />
        </>
      )}
    </div>
  );
}

function ParamsPanel({ params }: { params: ParamsPayload }) {
  return (
    <article className="pillar" style={{ padding: "24px 28px" }}>
      <h3 style={{ margin: 0, fontSize: 20 }}>Current contract parameters</h3>
      <p style={{ color: "var(--muted)", marginTop: 4, fontSize: 12 }}>
        Server-side reads over the registered addresses; a failing contract degrades to an omitted
        section, never a crash.
      </p>
      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        {params.token && (
          <ParamCard testid="params-token" title="$CRYPT token">
            <Row k="paused" v={params.token.paused ? "yes" : "no"} />
            <Row k="totalSupply" v={params.token.totalSupply} />
            <Row k="MAX_SUPPLY" v={params.token.maxSupply} />
          </ParamCard>
        )}
        {params.passport && (
          <ParamCard testid="params-passport" title="Passport">
            <Row k="requiredWitnesses" v={String(params.passport.requiredWitnesses)} />
            <Row k="burnEnabled" v={params.passport.burnEnabled ? "yes" : "no"} />
          </ParamCard>
        )}
        {params.governance && (
          <ParamCard testid="params-governance" title="Governance">
            <Row k="votingPeriod" v={`${params.governance.votingPeriod} s`} />
            <Row k="quorumBps" v={String(params.governance.quorumBps)} />
            <Row k="executionDelay" v={`${params.governance.executionDelay} s`} />
            <Row k="minCitizensForProposal" v={params.governance.minCitizensForProposal} />
          </ParamCard>
        )}
        {params.treasury && (
          <ParamCard testid="params-treasury" title="Treasury">
            <Row k="totalAllocationBps" v={String(params.treasury.totalAllocationBps)} />
            {params.treasury.allocations.map((a) => (
              <Row
                key={a.bucket}
                k={a.bucket}
                v={a.onchainBps === null ? "unreadable bucket" : `${a.onchainBps} bps`}
              />
            ))}
          </ParamCard>
        )}
        {params.distributor && (
          <ParamCard testid="params-distributor" title="Dividend distributor">
            <Row k="currentEpoch" v={params.distributor.currentEpoch} />
          </ParamCard>
        )}
        {params.staking && (
          <ParamCard testid="params-staking" title="Staking">
            <Row k="aprBps" v={String(params.staking.aprBps)} />
            <Row k="totalStaked" v={params.staking.totalStaked} />
            <Row k="rewardPoolRemaining" v={params.staking.rewardPoolRemaining} />
          </ParamCard>
        )}
      </div>
    </article>
  );
}

function ParamCard({
  testid,
  title,
  children,
}: {
  testid: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div data-testid={testid} style={{ border: "1px solid var(--line)", padding: "14px 16px" }}>
      <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
      <dl
        style={{
          margin: "10px 0 0",
          display: "grid",
          gridTemplateColumns: "180px 1fr",
          gap: "4px 12px",
          fontSize: 12,
        }}
      >
        {children}
      </dl>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt
        style={{
          margin: 0,
          fontFamily: "var(--mono)",
          color: "var(--muted)",
          fontSize: 11,
        }}
      >
        {k}
      </dt>
      <dd style={{ margin: 0, fontFamily: "var(--mono)", overflowWrap: "anywhere" }}>{v}</dd>
    </>
  );
}

function TopologyPanel({ state, onRetry }: { state: Load<TopologyPayload>; onRetry: () => void }) {
  return (
    <article className="pillar" data-testid="role-topology" style={{ padding: "24px 28px" }}>
      <h3 style={{ margin: 0, fontSize: 20 }}>Role topology</h3>
      <p style={{ color: "var(--muted)", marginTop: 4, fontSize: 12 }}>
        Candidates from RoleGranted logs, kept ONLY when hasRole confirms them live (AccessControl
        is not enumerable — the logs bound the candidate set; hasRole is the source of truth).
      </p>
      {state.status === "loading" && <Skeleton lines={3} />}
      {state.status === "error" && <CardError onRetry={onRetry} testid="topology-error" />}
      {state.status === "ok" && !state.data.available && (
        <p style={{ color: "var(--muted)", marginTop: 12, fontSize: 13 }}>
          No admin contracts are registered on this chain.
        </p>
      )}
      {state.status === "ok" &&
        state.data.available &&
        state.data.contracts.map((c) => (
          <div key={c.contract} style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              {c.contract}{" "}
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>
                {c.address}
              </span>
            </div>
            <dl
              style={{
                margin: "8px 0 0",
                display: "grid",
                gridTemplateColumns: "240px 1fr",
                gap: "4px 12px",
                fontSize: 12,
              }}
            >
              {c.roles.map((r) => (
                <RoleRow key={r.role} contract={c.contract} role={r.role} holders={r.holders} />
              ))}
            </dl>
          </div>
        ))}
    </article>
  );
}

function RoleRow({
  contract,
  role,
  holders,
}: {
  contract: AdminContract;
  role: RoleName;
  holders: readonly string[];
}) {
  return (
    <>
      <dt style={{ margin: 0, fontFamily: "var(--mono)", color: "var(--muted)", fontSize: 11 }}>
        {role}
        {contract === "treasury" && role === "GOVERNANCE_ROLE" && (
          <span style={{ display: "block", marginTop: 2 }}>
            <TagLabel>held by the Governance contract</TagLabel>
          </span>
        )}
      </dt>
      <dd style={{ margin: 0, fontFamily: "var(--mono)", overflowWrap: "anywhere" }}>
        {holders.length === 0 ? "none confirmed" : holders.join(", ")}
      </dd>
    </>
  );
}

function Composer({
  params,
  topology,
}: {
  params: ParamsPayload;
  topology: Load<TopologyPayload>;
}) {
  const ctx: Ctx = { chainId: params.chainId, addresses: params.addresses, params };
  const available = ACTIONS.filter((a) => a.requires.every((c) => ctx.addresses[c]));
  const [actionId, setActionId] = useState(available[0]?.id ?? "");
  const [values, setValues] = useState<Values>(() => {
    const first = available[0];
    return first?.defaults?.(ctx) ?? defaultValues(first);
  });
  const [error, setError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<PreparedBatch | GovernanceProposalPayload | null>(null);
  const [requiredRole, setRequiredRole] = useState<RequiredRoleInfo | null>(null);
  const [selfFillError, setSelfFillError] = useState<string | null>(null);

  const action = available.find((a) => a.id === actionId) ?? null;

  function selectAction(id: string) {
    const next = available.find((a) => a.id === id);
    setActionId(id);
    setValues(next?.defaults?.(ctx) ?? defaultValues(next));
    setError(null);
    setPrepared(null);
    setRequiredRole(null);
    setSelfFillError(null);
  }

  // Self-mint fill (Wave 10, addendum #1): the admin's OWN destination comes
  // from a SERVER resolution of their verified LinkedWallet (/api/admin/me) —
  // never purely client-typed.
  async function fillMyVerifiedAddress() {
    setSelfFillError(null);
    try {
      const res = await fetch("/api/admin/me");
      if (!res.ok) throw new Error("failed");
      const d = (await res.json()) as { verifiedAddress: string | null };
      if (!d.verifiedAddress) {
        setSelfFillError(
          "You have no verified wallet — link and verify a wallet in your own account first so the server can resolve your destination.",
        );
        return;
      }
      setValues((v) => ({ ...v, to: d.verifiedAddress! }));
    } catch {
      setSelfFillError("Your verified wallet could not be resolved — try again.");
    }
  }

  function prepare() {
    if (!action) return;
    setPrepared(null);
    setRequiredRole(null);
    const mirrorError = action.mirror(values, ctx);
    if (mirrorError) {
      setError(mirrorError);
      return;
    }
    try {
      const artifact = action.build(values, ctx);
      const spec = action.role(values);
      const holders =
        topology.status === "ok"
          ? (topology.data.contracts
              .find((c) => c.contract === spec.contract)
              ?.roles.find((r) => r.role === spec.role)?.holders ?? [])
          : [];
      setError(null);
      setPrepared(artifact);
      setRequiredRole({ contract: spec.contract, role: spec.role, holders });
    } catch (e) {
      // prepare.ts validation mirrors are the backstop — surface them in voice
      setError(e instanceof Error ? e.message : "The action could not be encoded.");
    }
  }

  const descriptionHashPreview =
    action &&
    (action.id === "disburse_proposal" || action.id === "fund_dividends_proposal") &&
    String(values.description ?? "").trim()
      ? keccak256(stringToHex(String(values.description)))
      : null;

  return (
    <>
      <article className="pillar" style={{ padding: "24px 28px" }}>
        <h3 style={{ margin: 0, fontSize: 20 }}>Compose a prepared action</h3>
        <p style={{ color: "var(--muted)", marginTop: 4, fontSize: 12 }}>
          Pure encoding: the composer produces calldata for YOUR Safe (or, for treasury
          GOVERNANCE_ROLE actions, a governance-proposal payload for a citizen wallet). Nothing is
          broadcast from this panel. Composing writes no audit row — the Safe&apos;s review/queue is
          the audit surface for prepared transactions.
        </p>

        <div
          style={{
            marginTop: 16,
            display: "flex",
            flexDirection: "column",
            gap: 14,
            maxWidth: 560,
          }}
        >
          <Field id="composer-action" label="Action">
            <select
              id="composer-action"
              style={inputStyle}
              value={actionId}
              onChange={(e) => selectAction(e.target.value)}
            >
              {available.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </Field>

          {action?.info && (
            <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>{action.info}</p>
          )}

          {action?.id === "admin_mint" && (
            <>
              <p
                data-testid="admin-mint-verify-warning"
                style={{
                  margin: 0,
                  padding: "10px 14px",
                  border: "2px solid #b04141",
                  color: "#8b3a3a",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                VERIFY THIS ADDRESS OFF-CHAIN. A wrong address mints a soulbound passport to a
                stranger you cannot revoke. Prefer the per-application approve-mint, which uses the
                applicant&apos;s verified wallet.
              </p>
              <div>
                <button
                  className="btn btn-ghost"
                  type="button"
                  data-testid="admin-mint-self-fill"
                  style={{ padding: "6px 14px", fontSize: 12 }}
                  onClick={fillMyVerifiedAddress}
                >
                  Use MY verified address (self-mint)
                </button>
                {selfFillError && (
                  <p
                    data-testid="admin-mint-self-fill-error"
                    style={{ color: "#8b3a3a", fontSize: 12, margin: "6px 0 0" }}
                  >
                    {selfFillError}
                  </p>
                )}
              </div>
            </>
          )}

          {action?.fields.map((f) => {
            const id = `composer-${f.key}`;
            const options =
              typeof f.options === "function" ? f.options(values, ctx) : (f.options ?? []);
            return (
              <Field key={f.key} id={id} label={f.label}>
                {f.kind === "select" ? (
                  <select
                    id={id}
                    style={inputStyle}
                    value={String(values[f.key] ?? "")}
                    onChange={(e) => {
                      const next = { ...values, [f.key]: e.target.value };
                      // keep the dependent role select valid when the contract changes
                      if (f.key === "contract") {
                        const roles = CONTRACT_ROLES[e.target.value as AdminContract] ?? [];
                        if (!roles.includes(next.role as RoleName)) next.role = roles[0];
                      }
                      setValues(next);
                    }}
                  >
                    {options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : f.kind === "textarea" ? (
                  <textarea
                    id={id}
                    style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
                    value={String(values[f.key] ?? "")}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  />
                ) : f.kind === "checkbox" ? (
                  <input
                    id={id}
                    type="checkbox"
                    checked={Boolean(values[f.key])}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.checked })}
                  />
                ) : (
                  <input
                    id={id}
                    style={inputStyle}
                    value={String(values[f.key] ?? "")}
                    placeholder={f.placeholder}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  />
                )}
              </Field>
            );
          })}

          {descriptionHashPreview && (
            <p
              data-testid="description-hash-preview"
              style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}
            >
              descriptionHash (keccak256(stringToHex(description)) — the propose-embassy binding
              convention):{" "}
              <span style={{ fontFamily: "var(--mono)", overflowWrap: "anywhere" }}>
                {descriptionHashPreview}
              </span>
            </p>
          )}

          {error && (
            <p data-testid="composer-error" style={{ color: "#8b3a3a", fontSize: 13, margin: 0 }}>
              {error}
            </p>
          )}

          <div>
            <button className="btn btn-primary" type="button" onClick={prepare}>
              Prepare
            </button>
          </div>
        </div>
      </article>

      {prepared && <PreparedActionCard prepared={prepared} requiredRole={requiredRole} />}
    </>
  );
}

function defaultValues(action: ActionDef | null | undefined): Values {
  const v: Values = {};
  for (const f of action?.fields ?? []) v[f.key] = f.kind === "checkbox" ? false : "";
  return v;
}
