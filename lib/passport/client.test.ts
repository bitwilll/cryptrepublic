// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createPublicClient,
  custom,
  encodeAbiParameters,
  encodeFunctionResult,
  toFunctionSelector,
  keccak256,
  toHex,
  type Address,
} from "viem";
import { foundry } from "viem/chains";
import { passportAbi } from "./abi";

const PASSPORT = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address;
const WHO = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;

// --- selector / topic fixtures (computed once) ---
const hasPassportSelector = toFunctionSelector("hasPassport(address)");
const citizenOfSelector = toFunctionSelector("citizenOf(uint256)");
const tokenURISelector = toFunctionSelector("tokenURI(uint256)");
const citizenMintedTopic = keccak256(toHex("CitizenMinted(uint256,address,bytes32,uint64)"));

// A viem transport backed by a canned JSON-RPC responder. Records every method.
function stubTransport(responder: (method: string, params: unknown[]) => unknown) {
  const methods: string[] = [];
  const transport = custom({
    async request({ method, params }: { method: string; params?: unknown[] }) {
      methods.push(method);
      return responder(method, (params ?? []) as unknown[]);
    },
  });
  return { transport, methods };
}

// Mock the app's real read path so client.ts uses OUR stub client + fixed address.
const state: { responder: (m: string, p: unknown[]) => unknown } = {
  responder: () => "0x",
};
let recorded: string[] = [];

vi.mock("./abi", async (orig) => orig());
vi.mock("@/config/contracts", () => ({
  passportAddress: () => PASSPORT,
}));
vi.mock("@/lib/wallet/services/evmClients", () => ({
  publicClientFor: () => {
    const { transport, methods } = stubTransport((m, p) => state.responder(m, p));
    recorded = methods;
    return createPublicClient({ chain: foundry, transport });
  },
}));

import {
  readHasPassport,
  readTotalCitizens,
  readApplicantNonce,
  readRequiredWitnesses,
  readPassportStatus,
} from "./client";

function callResult<T extends string>(fn: T, values: readonly unknown[]) {
  return encodeFunctionResult({
    abi: passportAbi,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    functionName: fn as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result: (values.length === 1 ? values[0] : values) as any,
  });
}

beforeEach(() => {
  recorded = [];
});

describe("passport read client", () => {
  it("readHasPassport decodes a boolean", async () => {
    state.responder = (m) => {
      if (m === "eth_call") return callResult("hasPassport", [true]);
      return "0x";
    };
    expect(await readHasPassport(31337, WHO)).toBe(true);

    state.responder = (m) => {
      if (m === "eth_call") return callResult("hasPassport", [false]);
      return "0x";
    };
    expect(await readHasPassport(31337, WHO)).toBe(false);
  });

  it("readTotalCitizens decodes a uint", async () => {
    state.responder = (m) => {
      if (m === "eth_call") return callResult("totalCitizens", [42n]);
      return "0x";
    };
    expect(await readTotalCitizens(31337)).toBe(42n);
  });

  it("readApplicantNonce decodes a uint", async () => {
    state.responder = (m) => {
      if (m === "eth_call") return callResult("nonces", [7n]);
      return "0x";
    };
    expect(await readApplicantNonce(31337, WHO)).toBe(7n);
  });

  it("readRequiredWitnesses returns a number", async () => {
    state.responder = (m) => {
      if (m === "eth_call") return callResult("requiredWitnesses", [7]);
      return "0x";
    };
    expect(await readRequiredWitnesses(31337)).toBe(7);
  });

  it("readPassportStatus returns { isCitizen: false } for a non-citizen (and does not query logs)", async () => {
    state.responder = (m) => {
      if (m === "eth_call") return callResult("hasPassport", [false]);
      return "0x";
    };
    const status = await readPassportStatus(31337, WHO);
    expect(status).toEqual({ isCitizen: false });
    expect(recorded).not.toContain("eth_getLogs");
  });

  it("readPassportStatus for a citizen resolves tokenId via CitizenMinted logs + citizenOf + tokenURI", async () => {
    const nameHash = ("0x" + "aa".repeat(32)) as `0x${string}`;
    const motto = ("0x" + "bb".repeat(32)) as `0x${string}`;
    const domicile = ("0x" + "cc".repeat(32)) as `0x${string}`;
    // One CitizenMinted log with tokenId=5 for WHO.
    state.responder = (m, p) => {
      if (m === "eth_call") {
        const data = (p[0] as { data: string }).data;
        // hasPassport selector 0x... ; distinguish by decoding attempt.
        // Return hasPassport=true first, then citizenOf, then tokenURI.
        if (data.startsWith(hasPassportSelector)) return callResult("hasPassport", [true]);
        if (data.startsWith(citizenOfSelector))
          return callResult("citizenOf", [nameHash, motto, domicile, true, 100n]);
        if (data.startsWith(tokenURISelector))
          return callResult("tokenURI", ["https://x/passport/5"]);
        return "0x";
      }
      if (m === "eth_getLogs") {
        return [
          {
            address: PASSPORT,
            topics: [
              citizenMintedTopic,
              // tokenId indexed (5)
              ("0x" + (5).toString(16).padStart(64, "0")) as `0x${string}`,
              // citizen indexed (WHO)
              ("0x" + WHO.slice(2).toLowerCase().padStart(64, "0")) as `0x${string}`,
            ],
            data: encodeAbiParameters([{ type: "bytes32" }, { type: "uint64" }], [nameHash, 100n]),
            blockNumber: "0x64",
            transactionHash: ("0x" + "de".repeat(32)) as `0x${string}`,
            logIndex: "0x0",
            transactionIndex: "0x0",
            blockHash: ("0x" + "ef".repeat(32)) as `0x${string}`,
            removed: false,
          },
        ];
      }
      return "0x";
    };
    const status = await readPassportStatus(31337, WHO);
    expect(status.isCitizen).toBe(true);
    expect(status.tokenId).toBe(5n);
    expect(status.citizen?.nameHash).toBe(nameHash);
    expect(status.tokenURI).toBe("https://x/passport/5");
  });
});
