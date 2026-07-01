// @vitest-environment node
import { describe, it, expect } from "vitest";
import { tokensForChain, TOKENS } from "./tokens";

describe("token registry", () => {
  it("Base Sepolia (84532) includes CRYPT/WETH/WBTC/USDC", () => {
    const symbols = tokensForChain(84532).map((t) => t.symbol);
    expect(symbols).toEqual(expect.arrayContaining(["CRYPT", "WETH", "WBTC", "USDC"]));
  });
  it("$CRYPT address is a Wave-4 placeholder (undefined) on every chain", () => {
    for (const list of Object.values(TOKENS)) {
      const crypt = list.find((t) => t.symbol === "CRYPT");
      expect(crypt).toBeDefined();
      expect(crypt?.address).toBeUndefined();
    }
  });
  it("returns [] for an unknown chain", () => {
    expect(tokensForChain(999999)).toEqual([]);
  });
});
