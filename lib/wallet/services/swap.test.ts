// @vitest-environment node
import { describe, it, expect } from "vitest";
import { getSwapQuote } from "./swap";

/**
 * Default CHAIN_ENV is testnet, so getSwapQuote returns a clearly-labeled MOCK
 * quote (no real aggregator execution this wave).
 */
describe("getSwapQuote (testnet mock)", () => {
  it("returns a labeled TESTNET MOCK quote", async () => {
    const q = await getSwapQuote("WETH", "USDC", 1_000_000n);
    expect(q.mock).toBe(true);
    expect(q.label).toBe("TESTNET MOCK");
    expect(q.fromToken).toBe("WETH");
    expect(q.toToken).toBe("USDC");
    expect(BigInt(q.estOut)).toBe(990_000n);
  });
});
