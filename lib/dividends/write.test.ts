// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { decodeFunctionData, type Account } from "viem";
import { dividendsAbi } from "./abi";

/**
 * Dividends embedded-write tests. Mirrors staking.test.ts / governance write
 * test: capture every RPC method and assert the embedded path records ONLY the
 * safe methods (eth_call / eth_estimateGas / eth_getTransactionCount /
 * eth_sendRawTransaction) and NEVER eth_sendTransaction / personal_sign /
 * eth_sign / eth_accounts. claimDividendEmbedded encodes claim(epochId, tokenId);
 * the writer awaits the receipt and THROWS when reverted.
 */

const DIST = "0x1111111111111111111111111111111111111111" as `0x${string}`;
const SIGNER = "0x00000000000000000000000000000000000000a1" as `0x${string}`;
const TXHASH =
  "0xabc0000000000000000000000000000000000000000000000000000000000001" as `0x${string}`;

const h = vi.hoisted(() => ({
  rpcMethods: [] as string[],
  receiptStatus: "success" as "success" | "reverted",
  lastData: "0x" as `0x${string}`,
}));

vi.mock("@/config/contracts", () => ({
  distributorAddress: () => DIST,
}));

vi.mock("@/lib/wallet/embedded/session", () => ({
  withEvmSigner: async <T>(fn: (a: Account) => Promise<T>): Promise<T> => {
    const account = {
      address: SIGNER,
      signTransaction: async () => {
        h.rpcMethods.push("__local_sign__");
        return "0x02deadbeef" as `0x${string}`;
      },
    } as unknown as Account;
    return fn(account);
  },
}));

vi.mock("@/lib/wallet/services/evmClients", () => ({
  publicClientFor: () => ({
    async simulateContract() {
      h.rpcMethods.push("eth_call");
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
      return TXHASH;
    },
    async waitForTransactionReceipt() {
      h.rpcMethods.push("eth_getTransactionReceipt");
      return { status: h.receiptStatus, logs: [] };
    },
  }),
}));

vi.mock("viem", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    encodeFunctionData: (params: { abi: unknown; functionName: string; args: unknown[] }) => {
      const data = (actual.encodeFunctionData as typeof import("viem").encodeFunctionData)(
        params as never,
      );
      h.lastData = data;
      return data;
    },
  };
});

import { claimDividendEmbedded, claimManyEmbedded } from "./write";

const FORBIDDEN = ["eth_sendTransaction", "personal_sign", "eth_sign", "eth_accounts"];

beforeEach(() => {
  h.rpcMethods.length = 0;
  h.receiptStatus = "success";
  h.lastData = "0x";
});

describe("claimDividendEmbedded", () => {
  it("encodes claim(epochId, tokenId) with the exact args", async () => {
    const hash = await claimDividendEmbedded(31337, 2n, 9n);
    expect(hash).toBe(TXHASH);
    const decoded = decodeFunctionData({ abi: dividendsAbi, data: h.lastData });
    expect(decoded.functionName).toBe("claim");
    expect(decoded.args).toEqual([2n, 9n]);
  });

  it("records ONLY the safe RPC methods and NEVER a forbidden one", async () => {
    await claimDividendEmbedded(31337, 1n, 1n);
    expect(h.rpcMethods).toContain("eth_call");
    expect(h.rpcMethods).toContain("eth_sendRawTransaction");
    expect(h.rpcMethods).toContain("eth_getTransactionReceipt");
    for (const m of FORBIDDEN) {
      expect(h.rpcMethods).not.toContain(m);
    }
  });

  it("awaits the receipt and THROWS when reverted", async () => {
    h.receiptStatus = "reverted";
    await expect(claimDividendEmbedded(31337, 1n, 1n)).rejects.toThrow(/reverted/i);
  });
});

describe("claimManyEmbedded", () => {
  it("encodes claimMany(epochId, tokenIds[]) with the exact args", async () => {
    await claimManyEmbedded(31337, 5n, [1n, 2n, 3n]);
    const decoded = decodeFunctionData({ abi: dividendsAbi, data: h.lastData });
    expect(decoded.functionName).toBe("claimMany");
    expect(decoded.args).toEqual([5n, [1n, 2n, 3n]]);
  });
});
