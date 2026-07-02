// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { stringToHex } from "viem";
import { ROLE_IDS } from "./roles";

/**
 * Mocks mirror lib/passport/serverReads.test.ts: createPublicClient + the
 * registry + prisma are all mocked so no live chain/DB is needed. The pinned
 * role-topology algorithm (candidates from RoleGranted ONLY; hasRole is the
 * EXCLUSIVE removal step) is asserted in both directions incl. the mandatory
 * granted→revoked→re-granted case a set-difference fold would false-negative.
 */

const TOKEN = "0x1000000000000000000000000000000000000001" as `0x${string}`;
const STAKING = "0x1000000000000000000000000000000000000006" as `0x${string}`;
const A = "0x00000000000000000000000000000000000000aa" as `0x${string}`;
const B = "0x00000000000000000000000000000000000000bb" as `0x${string}`;

interface MockLog {
  args: { role: `0x${string}`; account: `0x${string}`; sender: `0x${string}` };
}

const h = vi.hoisted(() => ({
  entry: {} as Record<string, unknown>,
  // `${address}:${functionName}` → value | (() => value). Throw by assigning a function that throws.
  reads: {} as Record<string, unknown>,
  // `${roleId}:${account}` → boolean (default false).
  hasRole: {} as Record<string, boolean>,
  grantLogs: {} as Record<string, MockLog[]>, // keyed by contract address
  revokeLogs: {} as Record<string, MockLog[]>,
  seenFromBlocks: [] as bigint[],
  allocations: [] as { bucket: string }[],
}));

vi.mock("@/config/chains.config", () => ({
  evmEntry: () => ({ viemChain: { id: 31337, name: "Anvil" } }),
}));

vi.mock("@/lib/rpc/allowlist", () => ({
  serverRpcUrl: () => "http://127.0.0.1:8545",
}));

vi.mock("@/config/contracts", () => ({
  contractEntry: () => h.entry,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    treasuryAllocation: {
      findMany: async () => h.allocations,
    },
  },
}));

vi.mock("viem", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    createPublicClient: () => ({
      async readContract({
        address,
        functionName,
        args,
      }: {
        address: `0x${string}`;
        functionName: string;
        args?: readonly unknown[];
      }) {
        if (functionName === "hasRole") {
          const [roleId, account] = args as [`0x${string}`, `0x${string}`];
          return h.hasRole[`${roleId}:${account}`] ?? false;
        }
        const v = h.reads[`${address}:${functionName}`];
        if (typeof v === "function") return (v as () => unknown)();
        if (v === undefined) throw new Error(`unexpected read ${functionName} @ ${address}`);
        return v;
      },
      async getLogs({
        address,
        event,
        fromBlock,
      }: {
        address: `0x${string}`;
        event: { name: string };
        fromBlock: bigint;
      }) {
        h.seenFromBlocks.push(fromBlock);
        if (event.name === "RoleGranted") return h.grantLogs[address] ?? [];
        if (event.name === "RoleRevoked") return h.revokeLogs[address] ?? [];
        return [];
      },
    }),
  };
});

import { readAdminParamsServer, readRoleTopologyServer } from "./serverReads";

const grant = (account: `0x${string}`, role = ROLE_IDS.REWARDS_ADMIN_ROLE): MockLog => ({
  args: { role, account, sender: A },
});

beforeEach(() => {
  h.entry = {};
  h.reads = {};
  h.hasRole = {};
  h.grantLogs = {};
  h.revokeLogs = {};
  h.seenFromBlocks = [];
  h.allocations = [];
});

describe("readAdminParamsServer", () => {
  it("returns {available:false, addresses:{}} for an unregistered chain WITHOUT throwing (the 84532 default env)", async () => {
    const out = await readAdminParamsServer(84532);
    expect(out.available).toBe(false);
    expect(out.addresses).toEqual({});
    expect(out.token).toBeUndefined();
  });

  it("maps mocked reads into the interface when contracts are registered", async () => {
    h.entry = { token: TOKEN, staking: STAKING };
    h.reads[`${TOKEN}:paused`] = false;
    h.reads[`${TOKEN}:MAX_SUPPLY`] = 1_000_000_000n;
    h.reads[`${TOKEN}:totalSupply`] = 100_000_000n;
    h.reads[`${STAKING}:aprBps`] = 1180;
    h.reads[`${STAKING}:totalStaked`] = 42n;
    h.reads[`${STAKING}:rewardPoolRemaining`] = 7n;

    const out = await readAdminParamsServer(31337);
    expect(out.available).toBe(true);
    expect(out.addresses).toEqual({ token: TOKEN, staking: STAKING });
    expect(out.token).toEqual({
      paused: false,
      maxSupply: "1000000000",
      totalSupply: "100000000",
    });
    expect(out.staking).toEqual({ aprBps: 1180, totalStaked: "42", rewardPoolRemaining: "7" });
    expect(out.passport).toBeUndefined(); // unregistered → omitted, not fabricated
  });

  it("a single failing contract degrades to omitted — never a thrown 500", async () => {
    h.entry = { token: TOKEN, staking: STAKING };
    h.reads[`${TOKEN}:paused`] = () => {
      throw new Error("rpc down");
    };
    h.reads[`${TOKEN}:MAX_SUPPLY`] = 1n;
    h.reads[`${TOKEN}:totalSupply`] = 1n;
    h.reads[`${STAKING}:aprBps`] = 1180;
    h.reads[`${STAKING}:totalStaked`] = 0n;
    h.reads[`${STAKING}:rewardPoolRemaining`] = 0n;

    const out = await readAdminParamsServer(31337);
    expect(out.available).toBe(true);
    expect(out.token).toBeUndefined();
    expect(out.staking?.aprBps).toBe(1180);
  });

  it("treasury allocations: reads per-DB-bucket onchainBps; an UNENCODABLE bucket maps to onchainBps null, the rest intact", async () => {
    const TREASURY = "0x1000000000000000000000000000000000000004" as `0x${string}`;
    h.entry = { treasury: TREASURY };
    h.reads[`${TREASURY}:totalAllocationBps`] = 3800;
    h.reads[`${TREASURY}:allocationBps`] = 3800;
    h.allocations = [{ bucket: "embassy_ops" }, { bucket: "é".repeat(17) }]; // 34 UTF-8 bytes

    const out = await readAdminParamsServer(31337);
    expect(out.treasury?.totalAllocationBps).toBe(3800);
    expect(out.treasury?.allocations).toEqual([
      { bucket: "embassy_ops", onchainBps: 3800 },
      { bucket: "é".repeat(17), onchainBps: null },
    ]);
    // Sanity: the encodable bucket used the canonical stringToHex size-32 mapping.
    expect(stringToHex("embassy_ops", { size: 32 })).toMatch(/^0x/);
  });
});

describe("readRoleTopologyServer (pinned algorithm: candidates from RoleGranted ONLY; hasRole is the exclusive removal)", () => {
  it("returns {available:false} for an unregistered chain", async () => {
    const out = await readRoleTopologyServer(84532);
    expect(out.available).toBe(false);
    expect(out.contracts).toEqual([]);
  });

  it("drops a candidate ONLY via the hasRole confirm — RoleGranted [A,B] + RoleRevoked [B], hasRole A=true B=false → [A]", async () => {
    h.entry = { staking: STAKING };
    h.grantLogs[STAKING] = [grant(A), grant(B)];
    h.revokeLogs[STAKING] = [grant(B)]; // same shape; must NOT shrink the candidate set
    h.hasRole[`${ROLE_IDS.REWARDS_ADMIN_ROLE}:${A}`] = true;
    h.hasRole[`${ROLE_IDS.REWARDS_ADMIN_ROLE}:${B}`] = false;

    const out = await readRoleTopologyServer(31337);
    expect(out.available).toBe(true);
    const staking = out.contracts.find((c) => c.contract === "staking")!;
    const rewards = staking.roles.find((r) => r.role === "REWARDS_ADMIN_ROLE")!;
    expect(rewards.roleId).toBe(ROLE_IDS.REWARDS_ADMIN_ROLE);
    expect(rewards.holders).toEqual([A]);
  });

  it("hasRole false for every candidate → holders [] (the confirm step is load-bearing)", async () => {
    h.entry = { staking: STAKING };
    h.grantLogs[STAKING] = [grant(A)];
    // hasRole defaults to false.
    const out = await readRoleTopologyServer(31337);
    const rewards = out.contracts[0].roles.find((r) => r.role === "REWARDS_ADMIN_ROLE")!;
    expect(rewards.holders).toEqual([]);
  });

  it("MANDATORY re-grant case: RoleGranted[A] → RoleRevoked[A] → RoleGranted[A] with hasRole(A)=true → holders [A]", async () => {
    // A set-difference fold (grants minus revokes) would false-negative this
    // history; the pinned candidates-from-grants-only algorithm keeps A, and
    // hasRole can only REMOVE candidates — never restore a wrongly-dropped one.
    h.entry = { staking: STAKING };
    h.grantLogs[STAKING] = [grant(A), grant(A)]; // granted, later re-granted
    h.revokeLogs[STAKING] = [grant(A)]; // the in-between revoke
    h.hasRole[`${ROLE_IDS.REWARDS_ADMIN_ROLE}:${A}`] = true;

    const out = await readRoleTopologyServer(31337);
    const rewards = out.contracts[0].roles.find((r) => r.role === "REWARDS_ADMIN_ROLE")!;
    expect(rewards.holders).toEqual([A]); // exactly once — candidates are DISTINCT
  });

  it("threads the registry deployBlock into getLogs fromBlock (addendum #6; default 0n)", async () => {
    h.entry = { staking: STAKING, deployBlock: 5 };
    h.grantLogs[STAKING] = [];
    await readRoleTopologyServer(31337);
    expect(h.seenFromBlocks.length).toBeGreaterThan(0);
    for (const fb of h.seenFromBlocks) expect(fb).toBe(5n);

    h.seenFromBlocks = [];
    h.entry = { staking: STAKING }; // no deployBlock → 0n
    await readRoleTopologyServer(31337);
    for (const fb of h.seenFromBlocks) expect(fb).toBe(0n);
  });
});
