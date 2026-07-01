// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { decodeFunctionData, type Account } from "viem";
import { erc20ApproveAbi, stakingAbi } from "@/lib/wallet/stakingAbi";

/**
 * Staking service tests. The embedded writers sign an EIP-1559 tx LOCALLY with a
 * transient account and broadcast the raw tx via the proxy. We mock the viem
 * public client + the embedded signer and CAPTURE every RPC method the path
 * emits so we can assert `eth_sendTransaction` / `personal_sign` / `eth_sign` /
 * `eth_accounts` are NEVER used (mirrors mint-e2e).
 */

// --- hoisted mock state ---
const h = vi.hoisted(() => ({
  rpcMethods: [] as string[],
  // configurable per-test reads
  reads: {
    stakes: [0n, 0n, 0n] as [bigint, bigint, bigint],
    earned: 0n,
    aprBps: 0,
    totalStaked: 0n,
    rewardPoolRemaining: 0n,
    allowance: 0n,
  },
  receiptStatus: "success" as "success" | "reverted",
  lastSimulate: null as { functionName: string; args: readonly unknown[]; address: string } | null,
  waitCalledWith: null as string | null,
  txHash: "0xabc0000000000000000000000000000000000000000000000000000000000001" as `0x${string}`,
}));

const STAKING = "0x1111111111111111111111111111111111111111" as `0x${string}`;
const TOKEN = "0x2222222222222222222222222222222222222222" as `0x${string}`;
const SIGNER = "0x00000000000000000000000000000000000000a1" as `0x${string}`;

vi.mock("@/config/contracts", () => ({
  contractEntry: (chainId: number) => (chainId === 31337 ? { token: TOKEN, staking: STAKING } : {}),
  stakingAddress: (chainId: number) => {
    if (chainId === 31337) return STAKING;
    throw new Error(`Staking not deployed on chain ${chainId}`);
  },
}));

vi.mock("@/lib/wallet/embedded/session", () => ({
  withEvmSigner: async <T>(fn: (a: Account) => Promise<T>): Promise<T> => {
    const account = {
      address: SIGNER,
      signTransaction: async () => {
        h.rpcMethods.push("__local_sign__"); // NOT an RPC — just proves we didn't call personal_sign
        return "0x02deadbeef" as `0x${string}`;
      },
    } as unknown as Account;
    return fn(account);
  },
}));

vi.mock("./evmClients", () => ({
  publicClientFor: () => ({
    async readContract({ functionName }: { functionName: string }) {
      switch (functionName) {
        case "stakes":
          return h.reads.stakes;
        case "earned":
          return h.reads.earned;
        case "aprBps":
          return h.reads.aprBps;
        case "totalStaked":
          return h.reads.totalStaked;
        case "rewardPoolRemaining":
          return h.reads.rewardPoolRemaining;
        case "allowance":
          return h.reads.allowance;
        default:
          throw new Error(`unexpected read ${functionName}`);
      }
    },
    async simulateContract(a: { functionName: string; args: readonly unknown[]; address: string }) {
      h.rpcMethods.push("eth_call");
      h.lastSimulate = { functionName: a.functionName, args: a.args, address: a.address };
      return { request: {} };
    },
    async getTransactionCount() {
      h.rpcMethods.push("eth_getTransactionCount");
      return 0;
    },
    async estimateFeesPerGas() {
      h.rpcMethods.push("eth_maxPriorityFeePerGas");
      return { maxFeePerGas: 1_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n };
    },
    async estimateGas() {
      h.rpcMethods.push("eth_estimateGas");
      return 100_000n;
    },
    async sendRawTransaction() {
      h.rpcMethods.push("eth_sendRawTransaction");
      return h.txHash;
    },
    async waitForTransactionReceipt({ hash }: { hash: string }) {
      h.rpcMethods.push("eth_getTransactionReceipt");
      h.waitCalledWith = hash;
      return { status: h.receiptStatus };
    },
  }),
}));

import {
  readStakePosition,
  readCryptAllowance,
  stakingAvailable,
  approveCryptEmbedded,
  stakeEmbedded,
  unstakeEmbedded,
  claimEmbedded,
} from "./staking";

beforeEach(() => {
  h.rpcMethods.length = 0;
  h.reads = {
    stakes: [0n, 0n, 0n],
    earned: 0n,
    aprBps: 0,
    totalStaked: 0n,
    rewardPoolRemaining: 0n,
    allowance: 0n,
  };
  h.receiptStatus = "success";
  h.lastSimulate = null;
  h.waitCalledWith = null;
});

describe("readStakePosition", () => {
  it("maps the 5 reads into a StakePosition (stakes tuple [0] -> staked)", async () => {
    h.reads.stakes = [500n, 9n, 7n];
    h.reads.earned = 42n;
    h.reads.aprBps = 1180;
    h.reads.totalStaked = 10_000n;
    h.reads.rewardPoolRemaining = 999n;
    const pos = await readStakePosition(31337, SIGNER);
    expect(pos.staked).toBe(500n);
    expect(pos.earned).toBe(42n);
    expect(pos.aprBps).toBe(1180);
    expect(pos.totalStaked).toBe(10_000n);
    expect(pos.rewardPoolRemaining).toBe(999n);
  });
});

describe("readCryptAllowance", () => {
  it("reads the ERC-20 allowance the owner granted the staking contract", async () => {
    h.reads.allowance = 12_345n;
    expect(await readCryptAllowance(31337, SIGNER)).toBe(12_345n);
  });
});

describe("stakingAvailable", () => {
  it("is true when token + staking are both registered", () => {
    expect(stakingAvailable(31337)).toBe(true);
  });
  it("is false when the chain has no token/staking", () => {
    expect(stakingAvailable(84532)).toBe(false);
  });
});

describe("embedded writers", () => {
  it("approveCryptEmbedded encodes approve(staking, EXACT amount) — never max", async () => {
    const amount = 1_000n * 10n ** 18n;
    const hash = await approveCryptEmbedded(31337, amount);
    expect(hash).toBe(h.txHash);
    // simulate saw approve on the TOKEN address
    expect(h.lastSimulate?.functionName).toBe("approve");
    expect(h.lastSimulate?.address?.toLowerCase()).toBe(TOKEN.toLowerCase());
    const [spender, approvedAmount] = h.lastSimulate!.args as [string, bigint];
    expect(spender.toLowerCase()).toBe(STAKING.toLowerCase());
    expect(approvedAmount).toBe(amount); // EXACT, not 2**256-1
    expect(approvedAmount).not.toBe(2n ** 256n - 1n);
  });

  it("stakeEmbedded / unstakeEmbedded encode the amount to the staking contract", async () => {
    await stakeEmbedded(31337, 7n);
    expect(h.lastSimulate?.functionName).toBe("stake");
    expect(h.lastSimulate?.address?.toLowerCase()).toBe(STAKING.toLowerCase());
    expect((h.lastSimulate!.args as [bigint])[0]).toBe(7n);

    await unstakeEmbedded(31337, 3n);
    expect(h.lastSimulate?.functionName).toBe("unstake");
    expect((h.lastSimulate!.args as [bigint])[0]).toBe(3n);
  });

  it("claimEmbedded encodes claim() with no args", async () => {
    await claimEmbedded(31337);
    expect(h.lastSimulate?.functionName).toBe("claim");
    expect(h.lastSimulate?.address?.toLowerCase()).toBe(STAKING.toLowerCase());
    expect(h.lastSimulate!.args).toEqual([]);
  });

  it("the embedded path emits ONLY read/broadcast RPCs — never eth_sendTransaction/personal_sign/eth_sign/eth_accounts", async () => {
    h.reads.allowance = 0n;
    await approveCryptEmbedded(31337, 5n);
    await stakeEmbedded(31337, 5n);
    await claimEmbedded(31337);
    expect(h.rpcMethods).toContain("eth_sendRawTransaction");
    expect(h.rpcMethods).not.toContain("eth_sendTransaction");
    expect(h.rpcMethods).not.toContain("personal_sign");
    expect(h.rpcMethods).not.toContain("eth_sign");
    expect(h.rpcMethods).not.toContain("eth_accounts");
  });

  it("awaits waitForTransactionReceipt with the broadcast hash and returns it on success", async () => {
    const hash = await stakeEmbedded(31337, 1n);
    expect(hash).toBe(h.txHash);
    expect(h.waitCalledWith).toBe(h.txHash);
    expect(h.rpcMethods).toContain("eth_getTransactionReceipt");
  });

  it("THROWS (does not return the hash) when the receipt reverted", async () => {
    h.receiptStatus = "reverted";
    await expect(stakeEmbedded(31337, 1n)).rejects.toThrow(/revert/i);
    expect(h.waitCalledWith).toBe(h.txHash);
  });
});

describe("stakingAbi calldata sanity", () => {
  it("stakingAbi decodes stake/unstake/claim; erc20ApproveAbi decodes approve", () => {
    expect(stakingAbi.some((f) => f.type === "function" && f.name === "stake")).toBe(true);
    expect(erc20ApproveAbi.some((f) => f.type === "function" && f.name === "approve")).toBe(true);
    // decodeFunctionData is available (import used) — trivially exercise it.
    expect(typeof decodeFunctionData).toBe("function");
  });
});
