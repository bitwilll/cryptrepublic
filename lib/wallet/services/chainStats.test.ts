// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

/**
 * Honest chain-stats reader tests. `publicClientFor` (live block + fees) and
 * `evmEntry` (chain name + explorer) are mocked. Asserts the reader models ONLY
 * real telemetry — no fabricated validators/TPS/finality.
 */

vi.mock("./evmClients", () => ({
  publicClientFor: () => ({
    async getBlockNumber() {
      return 123n;
    },
    async estimateFeesPerGas() {
      return { maxFeePerGas: 1_000_000_000n, maxPriorityFeePerGas: 1n };
    },
  }),
}));

vi.mock("@/config/chains.config", () => ({
  evmEntry: (chainId: number) => ({
    chainId,
    viemChain: { name: "Base Sepolia" },
    explorer: "https://sepolia.basescan.org",
  }),
}));

import { readChainStats } from "./chainStats";

describe("readChainStats", () => {
  it("maps real block + gas + chain name + explorer", async () => {
    const stats = await readChainStats(84532);
    expect(stats.chainId).toBe(84532);
    expect(stats.chainName).toBe("Base Sepolia");
    expect(stats.blockNumber).toBe(123n);
    expect(stats.gasMaxFeePerGasWei).toBe(1_000_000_000n);
    expect(stats.explorerBase).toBe("https://sepolia.basescan.org");
    expect(stats.representativeNote).toMatch(/omitted/i);
  });

  it("does NOT model fabricated validators/TPS/finality", async () => {
    const stats = await readChainStats(84532);
    expect(stats).not.toHaveProperty("validators");
    expect(stats).not.toHaveProperty("tps");
    expect(stats).not.toHaveProperty("finality");
  });
});
