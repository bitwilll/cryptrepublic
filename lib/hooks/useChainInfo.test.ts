// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

/**
 * useChainInfo maps readChainStats into the shell-facing ChainInfo shape and
 * degrades gracefully (never throws in render): a rejected read yields
 * { online:false, blockNumber:null } instead of crashing.
 */

const h = vi.hoisted(() => ({ throws: false }));

vi.mock("@/lib/config/chain", () => ({
  activeChain: () => ({ primaryChainId: 84532 }),
}));

vi.mock("@/lib/wallet/services/chainStats", () => ({
  readChainStats: async () => {
    if (h.throws) throw new Error("rpc down");
    return {
      chainId: 84532,
      chainName: "Base Sepolia",
      blockNumber: 999n,
      gasMaxFeePerGasWei: 1_000_000_000n,
      explorerBase: "https://sepolia.basescan.org",
      representativeNote:
        "Validators, TPS, and finality are not measurable on this network and are omitted.",
    };
  },
}));

import { useChainInfo } from "./useChainInfo";

beforeEach(() => {
  h.throws = false;
});

describe("useChainInfo", () => {
  it("maps readChainStats into ChainInfo with online:true", async () => {
    const { result } = renderHook(() => useChainInfo());
    await waitFor(() => expect(result.current.online).toBe(true));
    expect(result.current.chainId).toBe(84532);
    expect(result.current.chainName).toBe("Base Sepolia");
    expect(result.current.blockNumber).toBe(999n);
    expect(result.current.gasMaxFeePerGasWei).toBe(1_000_000_000n);
    expect(result.current.explorerBase).toBe("https://sepolia.basescan.org");
  });

  it("degrades to online:false, blockNumber:null on a rejected read (no throw)", async () => {
    h.throws = true;
    const { result } = renderHook(() => useChainInfo());
    await waitFor(() => expect(result.current.online).toBe(false));
    expect(result.current.blockNumber).toBeNull();
    // The chain name is still the registry name (not "CR-L2"/"7331").
    expect(result.current.chainName).not.toMatch(/CR-L2|7331/);
  });
});
