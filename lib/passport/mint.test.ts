// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createPublicClient,
  custom,
  decodeFunctionData,
  toFunctionSelector,
  encodeEventTopics,
  encodeAbiParameters,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { passportAbi } from "./abi";
import type { Attestation } from "./attestation";

const PASSPORT = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address;
// anvil default key #0 — LOCAL/TEST ONLY, throwaway.
const APPLICANT_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const applicantAccount = privateKeyToAccount(APPLICANT_PK);

const nameHash = ("0x" + "11".repeat(32)) as Hex;
const motto = ("0x" + "22".repeat(32)) as Hex;
const domicile = ("0x" + "33".repeat(32)) as Hex;

function makeAttestations(nonce: bigint): Attestation[] {
  return Array.from({ length: 7 }).map(() => ({
    applicant: applicantAccount.address,
    nameHash,
    nonce,
    deadline: 9_999_999_999n,
  }));
}
const signatures: Hex[] = Array.from({ length: 7 }).map(
  (_v, i) => ("0x" + (i + 10).toString(16).padStart(2, "0").repeat(65)) as Hex,
);

// --- Mock the real read + signer path ---
const state: {
  responder: (m: string, p: unknown[]) => unknown;
  nonce: bigint;
  recorded: string[];
} = { responder: () => "0x", nonce: 0n, recorded: [] };

vi.mock("@/config/contracts", () => ({ passportAddress: () => PASSPORT }));
vi.mock("@/lib/wallet/services/evmClients", () => ({
  publicClientFor: () =>
    createPublicClient({
      chain: foundry,
      transport: custom({
        async request({ method, params }: { method: string; params?: unknown[] }) {
          state.recorded.push(method);
          return state.responder(method, (params ?? []) as unknown[]);
        },
      }),
    }),
}));
vi.mock("@/lib/wallet/embedded/session", () => ({
  withEvmSigner: async (fn: (account: unknown) => Promise<unknown>) => fn(applicantAccount),
}));
vi.mock("./client", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    readApplicantNonce: async () => state.nonce,
  };
});

import {
  encodeMintCall,
  parseMintResult,
  assertAttestationsFresh,
  submitMintEmbedded,
  StaleAttestationsError,
  type MintArgs,
} from "./mint";

function baseArgs(nonce: bigint): MintArgs {
  return {
    chainId: 31337,
    nameHash,
    motto,
    domicile,
    oathAccepted: true,
    attestations: makeAttestations(nonce),
    signatures,
  };
}

/** Build a synthetic receipt containing an encoded CitizenMinted log. */
function syntheticReceipt(tokenId: bigint, mintBlock: bigint) {
  const topics = encodeEventTopics({
    abi: passportAbi,
    eventName: "CitizenMinted",
    args: { tokenId, citizen: applicantAccount.address },
  });
  const data = encodeAbiParameters(
    [{ type: "bytes32" }, { type: "uint64" }],
    [nameHash, mintBlock],
  );
  return {
    status: "success" as const,
    logs: [{ address: PASSPORT, topics, data }],
  };
}

beforeEach(() => {
  state.recorded = [];
  state.nonce = 0n;
  state.responder = () => "0x";
});

describe("mint calldata + result parsing", () => {
  it("encodeMintCall selector matches the canonical signature and decodes back to the same args", () => {
    const args = baseArgs(0n);
    const data = encodeMintCall(args);
    const selector = toFunctionSelector(
      "mintWithWitnesses(bytes32,bytes32,bytes32,bool,(address,bytes32,uint256,uint256)[],bytes[])",
    );
    expect(data.slice(0, 10)).toBe(selector);

    const decoded = decodeFunctionData({ abi: passportAbi, data });
    expect(decoded.functionName).toBe("mintWithWitnesses");
    const [dNameHash, dMotto, dDomicile, dOath, dAtt, dSigs] = decoded.args;
    expect(dNameHash).toBe(nameHash);
    expect(dMotto).toBe(motto);
    expect(dDomicile).toBe(domicile);
    expect(dOath).toBe(true);
    expect(dAtt).toHaveLength(7);
    expect(dSigs).toHaveLength(7);
    const att0 = dAtt![0]!;
    expect(att0.applicant.toLowerCase()).toBe(applicantAccount.address.toLowerCase());
    expect(att0.nonce).toBe(0n);
  });

  it("parseMintResult extracts tokenId + mintBlock from a CitizenMinted log", () => {
    const receipt = syntheticReceipt(48393n, 21_408_932n);
    const result = parseMintResult(receipt);
    expect(result.tokenId).toBe(48393n);
    expect(result.mintBlock).toBe(21_408_932n);
  });
});

describe("stale-nonce guard", () => {
  it("assertAttestationsFresh resolves when the on-chain nonce matches the attestations' nonce", async () => {
    state.nonce = 5n;
    await expect(assertAttestationsFresh(31337, baseArgs(5n))).resolves.toBeUndefined();
  });

  it("assertAttestationsFresh throws StaleAttestationsError on nonce drift", async () => {
    state.nonce = 6n; // on-chain moved
    await expect(assertAttestationsFresh(31337, baseArgs(5n))).rejects.toBeInstanceOf(
      StaleAttestationsError,
    );
    await expect(assertAttestationsFresh(31337, baseArgs(5n))).rejects.toThrow(
      /attestations are stale — witnesses must re-sign/,
    );
  });

  it("submitMintEmbedded fails fast with StaleAttestationsError and sends NO tx on nonce drift", async () => {
    state.nonce = 9n; // drift vs the args' nonce 5
    await expect(submitMintEmbedded(baseArgs(5n))).rejects.toBeInstanceOf(StaleAttestationsError);
    expect(state.recorded).not.toContain("eth_sendRawTransaction");
    expect(state.recorded).not.toContain("eth_sendTransaction");
  });
});

describe("embedded broadcast path (no eth_sendTransaction)", () => {
  it("uses eth_call (simulate) + eth_sendRawTransaction and NEVER eth_sendTransaction/eth_accounts", async () => {
    state.nonce = 0n; // fresh
    const txHash = ("0x" + "ab".repeat(32)) as Hex;
    const receipt = syntheticReceipt(48393n, 21_408_932n);

    state.responder = (m) => {
      switch (m) {
        case "eth_chainId":
          return "0x7a69"; // 31337
        case "eth_call":
          // simulateContract dry-run — decode returns tokenId (uint256)
          return ("0x" + (48393).toString(16).padStart(64, "0")) as Hex;
        case "eth_getTransactionCount":
          return "0x0";
        case "eth_estimateGas":
          return "0x100000";
        case "eth_gasPrice":
          return "0x3b9aca00";
        case "eth_maxPriorityFeePerGas":
          return "0x3b9aca00";
        case "eth_getBlockByNumber":
          // viem's estimateFeesPerGas reads baseFeePerGas from the latest block.
          return {
            number: "0x1466a44",
            hash: ("0x" + "cd".repeat(32)) as Hex,
            baseFeePerGas: "0x3b9aca00",
            gasLimit: "0x1c9c380",
            gasUsed: "0x0",
            timestamp: "0x0",
            miner: applicantAccount.address,
            transactions: [],
          };
        case "eth_feeHistory":
          return {
            oldestBlock: "0x1",
            baseFeePerGas: ["0x3b9aca00", "0x3b9aca00"],
            gasUsedRatio: [0.5],
            reward: [["0x3b9aca00"]],
          };
        case "eth_sendRawTransaction":
          return txHash;
        case "eth_getTransactionReceipt":
          return {
            transactionHash: txHash,
            status: "0x1",
            blockNumber: "0x1466a44",
            blockHash: ("0x" + "cd".repeat(32)) as Hex,
            contractAddress: null,
            cumulativeGasUsed: "0x1",
            effectiveGasPrice: "0x3b9aca00",
            from: applicantAccount.address,
            to: PASSPORT,
            gasUsed: "0x1",
            logs: receipt.logs.map((l, i) => ({
              ...l,
              blockNumber: "0x1466a44",
              blockHash: ("0x" + "cd".repeat(32)) as Hex,
              transactionHash: txHash,
              transactionIndex: "0x0",
              logIndex: "0x" + i.toString(16),
              removed: false,
            })),
            logsBloom: ("0x" + "00".repeat(256)) as Hex,
            type: "0x2",
          };
        default:
          return "0x";
      }
    };

    const result = await submitMintEmbedded(baseArgs(0n));
    expect(result.txHash).toBe(txHash);
    expect(result.tokenId).toBe(48393n);
    expect(state.recorded).toContain("eth_call");
    expect(state.recorded).toContain("eth_sendRawTransaction");
    expect(state.recorded).not.toContain("eth_sendTransaction");
    expect(state.recorded).not.toContain("eth_accounts");
  });
});
