// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
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

  it("local profile: 31337 anvil entry resolves through /api/rpc and is primary", () => {
    const p = CHAINS.local;
    expect(p.primaryChainId).toBe(31337);
    const anvil = p.evm.find((e) => e.chainId === 31337);
    expect(anvil).toBeDefined();
    expect(anvil?.isPrimary).toBe(true);
    expect(anvil?.publicFallbackRpc).toBe("/api/rpc/31337");
    expect(anvil?.serverRpcEnv).toBe("RPC_ANVIL");
    expect(p.solanaCluster).toBe("devnet");
    expect(p.bitcoinNetwork).toBe("testnet");
  });
});

describe("local CHAIN_ENV profile (module-reload)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("under CHAIN_ENV=local, evmEntry(31337) resolves and activeChain is 31337", async () => {
    vi.stubEnv("NEXT_PUBLIC_CHAIN_ENV", "local");
    vi.resetModules();
    const mod = await import("./chains.config");
    const entry = mod.evmEntry(31337);
    expect(entry.chainId).toBe(31337);
    expect(entry.publicFallbackRpc).toBe("/api/rpc/31337");
    expect(mod.activeChain().primaryChainId).toBe(31337);
  });

  it("under CHAIN_ENV=local, serverRpcUrl(31337) defaults to the anvil localhost RPC when RPC_ANVIL is unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_CHAIN_ENV", "local");
    delete process.env.RPC_ANVIL;
    vi.resetModules();
    const { serverRpcUrl } = await import("@/lib/rpc/allowlist");
    expect(serverRpcUrl(31337)).toBe("http://127.0.0.1:8545");
  });
});
