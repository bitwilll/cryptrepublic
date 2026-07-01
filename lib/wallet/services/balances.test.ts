// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { encodeAbiParameters, numberToHex } from "viem";
import { evmBalances, solanaBalances, btcBalance } from "./balances";
import { tokensForChain } from "@/config/tokens";

/**
 * Read-layer tests. Every read routes through the `/api/*` proxy — we stub
 * `global.fetch` to answer the JSON-RPC / REST calls the balance layer makes.
 */

const OWNER = "0x9858EfFD232B4033E47d90003D41EC34EcaEda94" as const;

function rpcResult(id: unknown, result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), { status: 200 });
}

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("evmBalances", () => {
  it("returns native + one entry per registry token with a defined address", async () => {
    // Answer each JSON-RPC method the balance layer emits.
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(url).toContain("/api/rpc/84532");
      const body = JSON.parse(String(init?.body)) as { method: string; id: unknown };
      if (body.method === "eth_getBalance") {
        // 1 ETH
        return rpcResult(body.id, numberToHex(10n ** 18n));
      }
      if (body.method === "eth_call") {
        // ERC-20 balanceOf → uint256 (say 250 units at whatever decimals)
        return rpcResult(body.id, encodeAbiParameters([{ type: "uint256" }], [1234567n]));
      }
      throw new Error(`unexpected method ${body.method}`);
    }) as typeof globalThis.fetch;

    const balances = await evmBalances(84532, OWNER);
    const definedTokens = tokensForChain(84532).filter((t) => t.address);
    // native + defined tokens
    expect(balances).toHaveLength(1 + definedTokens.length);
    const native = balances[0];
    expect(native.symbol).toBe("ETH");
    expect(native.raw).toBe(10n ** 18n);
    expect(native.formatted).toBe("1");
    // token entries carry the registry symbol + decimals + address
    for (const t of definedTokens) {
      const entry = balances.find((b) => b.address === t.address);
      expect(entry).toBeDefined();
      expect(entry?.symbol).toBe(t.symbol);
      expect(entry?.decimals).toBe(t.decimals);
      expect(entry?.raw).toBe(1234567n);
    }
  });
});

describe("solanaBalances", () => {
  it("returns a SOL entry from getBalance via the solana proxy", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("/api/rpc/solana");
      const body = JSON.parse(String(init?.body)) as { method: string; id: unknown };
      if (body.method === "getBalance") {
        return rpcResult(body.id, { context: { slot: 1 }, value: 2_000_000_000 }); // 2 SOL
      }
      if (body.method === "getParsedTokenAccountsByOwner") {
        return rpcResult(body.id, { context: { slot: 1 }, value: [] });
      }
      throw new Error(`unexpected method ${body.method}`);
    }) as typeof globalThis.fetch;

    const balances = await solanaBalances("So11111111111111111111111111111111111111112");
    const sol = balances.find((b) => b.symbol === "SOL");
    expect(sol).toBeDefined();
    expect(sol?.raw).toBe(2_000_000_000n);
    expect(sol?.formatted).toBe("2");
  });
});

describe("btcBalance", () => {
  it("sums confirmed + mempool funded-minus-spent", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url.startsWith("/api/btc/address/")).toBe(true);
      return new Response(
        JSON.stringify({
          address: "tb1qexample",
          chain_stats: { funded_txo_sum: 150_000, spent_txo_sum: 50_000 },
          mempool_stats: { funded_txo_sum: 10_000, spent_txo_sum: 0 },
        }),
        { status: 200 },
      );
    }) as typeof globalThis.fetch;

    const bal = await btcBalance("tb1qexample");
    expect(bal.symbol).toBe("BTC");
    // (150000 - 50000) + (10000 - 0) = 110000 sats
    expect(bal.raw).toBe(110_000n);
    expect(bal.formatted).toBe("0.0011");
  });
});
