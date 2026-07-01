// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { decodeFunctionData, type Account } from "viem";
import { governanceAbi, VOTE } from "./abi";

/**
 * Governance embedded-write tests. Mirrors staking.test.ts: mock the viem public
 * client + the embedded signer and CAPTURE every RPC method so we can assert the
 * embedded path records ONLY eth_call / eth_estimateGas / eth_getTransactionCount
 * / eth_sendRawTransaction and NEVER eth_sendTransaction / personal_sign /
 * eth_sign / eth_accounts. castVoteEmbedded encodes the exact args; the writer
 * awaits the receipt and THROWS when reverted.
 */

const GOV = "0x1111111111111111111111111111111111111111" as `0x${string}`;
const SIGNER = "0x00000000000000000000000000000000000000a1" as `0x${string}`;
const TXHASH =
  "0xabc0000000000000000000000000000000000000000000000000000000000001" as `0x${string}`;

const h = vi.hoisted(() => ({
  rpcMethods: [] as string[],
  receiptStatus: "success" as "success" | "reverted",
  lastData: "0x" as `0x${string}`,
  proposalCreatedLog: null as unknown,
}));

vi.mock("@/config/contracts", () => ({
  governanceAddress: () => GOV,
}));

vi.mock("@/lib/wallet/embedded/session", () => ({
  withEvmSigner: async <T>(fn: (a: Account) => Promise<T>): Promise<T> => {
    const account = {
      address: SIGNER,
      signTransaction: async () => {
        h.rpcMethods.push("__local_sign__"); // NOT an RPC — proves no personal_sign
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
      return {
        status: h.receiptStatus,
        logs: h.proposalCreatedLog ? [h.proposalCreatedLog] : [],
      };
    },
  }),
}));

// Capture the encoded calldata so we can decode + assert the args.
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

import { castVoteEmbedded, proposeEmbedded } from "./write";

const FORBIDDEN = ["eth_sendTransaction", "personal_sign", "eth_sign", "eth_accounts"];

beforeEach(() => {
  h.rpcMethods.length = 0;
  h.receiptStatus = "success";
  h.lastData = "0x";
  h.proposalCreatedLog = null;
});

describe("castVoteEmbedded", () => {
  it("encodes castVote(proposalId, tokenId, support) with the exact args", async () => {
    const hash = await castVoteEmbedded(31337, 3n, 9n, VOTE.For);
    expect(hash).toBe(TXHASH);
    const decoded = decodeFunctionData({ abi: governanceAbi, data: h.lastData });
    expect(decoded.functionName).toBe("castVote");
    expect(decoded.args).toEqual([3n, 9n, VOTE.For]);
  });

  it("records ONLY the safe RPC methods and NEVER a forbidden one", async () => {
    await castVoteEmbedded(31337, 1n, 1n, VOTE.Against);
    expect(h.rpcMethods).toContain("eth_call");
    expect(h.rpcMethods).toContain("eth_sendRawTransaction");
    expect(h.rpcMethods).toContain("eth_getTransactionReceipt");
    for (const m of FORBIDDEN) {
      expect(h.rpcMethods).not.toContain(m);
    }
  });

  it("awaits the receipt and THROWS when reverted (no fake success)", async () => {
    h.receiptStatus = "reverted";
    await expect(castVoteEmbedded(31337, 1n, 1n, VOTE.For)).rejects.toThrow(/reverted/i);
  });
});

describe("proposeEmbedded", () => {
  it("throws when the receipt has no ProposalCreated log", async () => {
    // success receipt but no log -> cannot resolve proposalId
    await expect(
      proposeEmbedded(
        31337,
        "0x0000000000000000000000000000000000000000",
        0n,
        "0x",
        "0xdead000000000000000000000000000000000000000000000000000000000001",
      ),
    ).rejects.toThrow(/ProposalCreated/i);
  });

  it("never uses a forbidden RPC method on the embedded path", async () => {
    try {
      await proposeEmbedded(
        31337,
        "0x0000000000000000000000000000000000000000",
        0n,
        "0x",
        "0xdead000000000000000000000000000000000000000000000000000000000001",
      );
    } catch {
      // expected (no log) — we only care about the RPC surface here
    }
    for (const m of FORBIDDEN) {
      expect(h.rpcMethods).not.toContain(m);
    }
    expect(h.rpcMethods).toContain("eth_sendRawTransaction");
  });
});
