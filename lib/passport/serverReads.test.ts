// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * readPassportStatusServer mirrors the client-only readPassportStatus's
 * CitizenMinted-log tokenId resolution, but server-side via createPublicClient.
 * We mock viem's createPublicClient and the registry so no live chain is needed.
 */

const WHO = "0x00000000000000000000000000000000000000a1" as `0x${string}`;
const PASSPORT = "0x1111111111111111111111111111111111111111" as `0x${string}`;

const h = vi.hoisted(() => ({
  hasPassport: false,
  logs: [] as { args: { tokenId: bigint } }[],
}));

vi.mock("@/config/chains.config", () => ({
  evmEntry: () => ({ viemChain: { id: 31337, name: "Anvil" } }),
}));

vi.mock("@/lib/rpc/allowlist", () => ({
  serverRpcUrl: () => "http://127.0.0.1:8545",
}));

vi.mock("@/config/contracts", () => ({
  passportAddress: () => PASSPORT,
}));

vi.mock("viem", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    createPublicClient: () => ({
      async readContract({ functionName }: { functionName: string }) {
        if (functionName === "hasPassport") return h.hasPassport;
        throw new Error(`unexpected read ${functionName}`);
      },
      async getLogs() {
        return h.logs;
      },
    }),
  };
});

import { readPassportStatusServer } from "./serverReads";

beforeEach(() => {
  h.hasPassport = false;
  h.logs = [];
});

describe("readPassportStatusServer", () => {
  it("returns {isCitizen:true, tokenId} from a matching CitizenMinted log", async () => {
    h.hasPassport = true;
    h.logs = [{ args: { tokenId: 42n } }];
    const s = await readPassportStatusServer(31337, WHO);
    expect(s.isCitizen).toBe(true);
    expect(s.tokenId).toBe(42n);
  });

  it("returns {isCitizen:false, tokenId:null} when not a citizen (no throw)", async () => {
    h.hasPassport = false;
    const s = await readPassportStatusServer(31337, WHO);
    expect(s.isCitizen).toBe(false);
    expect(s.tokenId).toBeNull();
  });

  it("returns {isCitizen:true, tokenId:null} when hasPassport but no log resolves", async () => {
    h.hasPassport = true;
    h.logs = [];
    const s = await readPassportStatusServer(31337, WHO);
    expect(s.isCitizen).toBe(true);
    expect(s.tokenId).toBeNull();
  });
});
