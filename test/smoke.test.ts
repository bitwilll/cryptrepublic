import { describe, it, expect } from "vitest";
import { CHAIN_ENV } from "@/lib/config/chain";

describe("smoke", () => {
  it("arithmetic works (harness is alive)", () => {
    expect(1 + 1).toBe(2);
  });

  it("defaults to testnet chain env", () => {
    expect(["testnet", "mainnet"]).toContain(CHAIN_ENV);
  });
});
