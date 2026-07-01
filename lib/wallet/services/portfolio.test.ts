// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Balance } from "./balances";

/**
 * Portfolio aggregator tests. `evmBalances` and `publicClientFor` are mocked so
 * the aggregator's price-attach + $CRYPT-append + resolvable-only summing logic
 * is exercised without a live chain.
 */

const h = vi.hoisted(() => ({
  balances: [] as Balance[],
  cryptBalance: 0n,
  cryptToken: undefined as `0x${string}` | undefined,
}));

const CRYPT = "0x3333333333333333333333333333333333333333" as `0x${string}`;
const OWNER = "0x00000000000000000000000000000000000000a1" as `0x${string}`;

vi.mock("./balances", () => ({
  evmBalances: async () => h.balances,
}));

vi.mock("@/config/contracts", () => ({
  contractEntry: () => (h.cryptToken ? { token: h.cryptToken } : {}),
}));

vi.mock("./evmClients", () => ({
  publicClientFor: () => ({
    async readContract() {
      return h.cryptBalance;
    },
  }),
}));

import { loadPortfolio, REPRESENTATIVE_PRICES } from "./portfolio";

beforeEach(() => {
  h.balances = [];
  h.cryptBalance = 0n;
  h.cryptToken = undefined;
});

describe("loadPortfolio", () => {
  it("sums only priced assets and never returns NaN", async () => {
    h.balances = [
      { symbol: "ETH", decimals: 18, raw: 10n ** 18n, formatted: "1" }, // priced 3240
      { symbol: "USDC", decimals: 6, raw: 1_000_000n, formatted: "1", address: "0xusdc" }, // priced 1
      { symbol: "MYSTERY", decimals: 18, raw: 5n * 10n ** 18n, formatted: "5", address: "0xzzz" }, // no price
    ];
    const p = await loadPortfolio(31337, OWNER);
    // ETH: 1 * 3240 = 3240; USDC: 1 * 1 = 1; MYSTERY: undefined => 0
    expect(p.totalUsd).toBe(3241);
    expect(Number.isNaN(p.totalUsd)).toBe(false);
    const mystery = p.assets.find((a) => a.symbol === "MYSTERY");
    expect(mystery?.usdPrice).toBeUndefined();
    expect(mystery?.usdValue).toBeUndefined();
  });

  it("appends $CRYPT from contractEntry.token when registered", async () => {
    h.balances = [{ symbol: "ETH", decimals: 18, raw: 0n, formatted: "0" }];
    h.cryptToken = CRYPT;
    h.cryptBalance = 2_000n * 10n ** 18n;
    const p = await loadPortfolio(31337, OWNER);
    const crypt = p.assets.find((a) => a.symbol === "CRYPT");
    expect(crypt).toBeDefined();
    expect(crypt?.address?.toLowerCase()).toBe(CRYPT.toLowerCase());
    expect(crypt?.raw).toBe(2_000n * 10n ** 18n);
    expect(crypt?.usdPrice).toBe(REPRESENTATIVE_PRICES.CRYPT);
    expect(crypt?.usdValue).toBe(2_000); // 2000 * 1
    expect(p.totalUsd).toBe(2_000);
  });

  it("omits $CRYPT (no NaN) when contractEntry.token is unregistered", async () => {
    h.balances = [{ symbol: "ETH", decimals: 18, raw: 10n ** 18n, formatted: "1" }];
    h.cryptToken = undefined;
    const p = await loadPortfolio(31337, OWNER);
    expect(p.assets.find((a) => a.symbol === "CRYPT")).toBeUndefined();
    expect(p.totalUsd).toBe(3240);
    expect(Number.isNaN(p.totalUsd)).toBe(false);
  });

  it("REPRESENTATIVE_PRICES marks CRYPT/USDC at 1 (representative, not live)", () => {
    expect(REPRESENTATIVE_PRICES.CRYPT).toBe(1);
    expect(REPRESENTATIVE_PRICES.USDC).toBe(1);
    expect(REPRESENTATIVE_PRICES.ETH).toBeGreaterThan(0);
  });
});
