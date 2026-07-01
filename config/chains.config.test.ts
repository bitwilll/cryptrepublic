// @vitest-environment node
import { describe, it, expect } from "vitest";
import { CHAINS, activeChain, evmEntry } from "./chains.config";

describe("chains registry", () => {
  it("testnet primary is Base Sepolia (84532) and includes 5 EVM chains", () => {
    const p = CHAINS.testnet;
    expect(p.primaryChainId).toBe(84532);
    expect(p.evm.map((e) => e.chainId).sort((a, b) => a - b)).toEqual(
      [84532, 11155111, 421614, 11155420, 80002].sort((a, b) => a - b),
    );
    expect(p.solanaCluster).toBe("devnet");
    expect(p.bitcoinNetwork).toBe("testnet");
  });
  it("mainnet primary is Base (8453) with Base/ETH/Arb/OP/Polygon", () => {
    const p = CHAINS.mainnet;
    expect(p.primaryChainId).toBe(8453);
    expect(p.evm.map((e) => e.chainId).sort((a, b) => a - b)).toEqual(
      [8453, 1, 42161, 10, 137].sort((a, b) => a - b),
    );
    expect(p.solanaCluster).toBe("mainnet-beta");
    expect(p.bitcoinNetwork).toBe("mainnet");
  });
  it("evmEntry throws for a chain not in the active profile", () => {
    expect(() => evmEntry(999999)).toThrow();
  });
  it("activeChain defaults to testnet", () => {
    expect(activeChain().primaryChainId).toBe(84532);
  });
  it("primary EVM entry is flagged isPrimary and public fallback routes through /api/rpc", () => {
    const p = CHAINS.testnet;
    const primary = p.evm.find((e) => e.chainId === p.primaryChainId);
    expect(primary?.isPrimary).toBe(true);
    for (const e of p.evm) {
      // CSP-safe: fallback must be a relative /api/* path, never a direct public-RPC origin.
      expect(e.publicFallbackRpc).toBe(`/api/rpc/${e.chainId}`);
    }
  });
});
