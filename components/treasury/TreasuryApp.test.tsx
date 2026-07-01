// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * TreasuryApp tests. The treasury read client, staking, `useCitizen`,
 * `useChainInfo`, contract availability probes, and the `/api/treasury/*`
 * fetches are mocked so the read-only screen renders without a live chain.
 * Asserts (§7.9, constraints #5/#9/#11):
 * - a fresh chain shows honest near-zero reserves (NEVER "$14.20M") + an empty
 *   disbursements ledger
 * - allocation targets render tagged as TARGETS (not live splits)
 * - "STAKE" is a link to /dashboard/wallet (no on-chain write from this screen)
 * - a treasury-read error renders a per-card retry
 * - on an unregistered chain (treasury unavailable) the screen still renders
 */

const h = vi.hoisted(() => ({
  isCitizen: true,
  tokenId: 7n as bigint | null,
  treasuryAvailable: true,
  summary: { available: true, cryptWei: "0", ethWei: "0" } as Record<string, unknown>,
  allocations: [] as Array<Record<string, unknown>>,
  flows: [] as Array<Record<string, unknown>>,
  summaryThrows: false,
}));

vi.mock("@/components/shell/SessionCitizenProvider", () => ({
  useCitizen: () => ({
    address: "0x00000000000000000000000000000000000000A1",
    isCitizen: h.isCitizen,
    tokenId: h.tokenId,
    loading: false,
    refresh: () => {},
  }),
}));

vi.mock("@/lib/hooks/useChainInfo", () => ({
  useChainInfo: () => ({
    chainId: 84532,
    chainName: "Base Sepolia",
    blockNumber: 100n,
    gasMaxFeePerGasWei: null,
    explorerBase: "https://sepolia.basescan.org",
    online: true,
  }),
}));

vi.mock("@/lib/config/chain", () => ({
  activeChain: () => ({ primaryChainId: 84532 }),
}));

vi.mock("@/config/contracts", () => ({
  treasuryAvailable: () => h.treasuryAvailable,
  stakingAvailable: () => false,
}));

vi.mock("@/lib/wallet/services/staking", () => ({
  stakingAvailable: () => false,
  readStakePosition: async () => ({
    staked: 0n,
    earned: 0n,
    aprBps: 0,
    totalStaked: 0n,
    rewardPoolRemaining: 0n,
  }),
}));

const originalFetch = globalThis.fetch;

import { TreasuryApp } from "./TreasuryApp";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  h.isCitizen = true;
  h.tokenId = 7n;
  h.treasuryAvailable = true;
  h.summary = { available: true, cryptWei: "0", ethWei: "0" };
  h.allocations = [];
  h.flows = [];
  h.summaryThrows = false;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/treasury/summary")) {
      if (h.summaryThrows) return new Response("boom", { status: 500 });
      return jsonResponse(h.summary);
    }
    if (url.includes("/api/treasury/allocations")) {
      return jsonResponse({ allocations: h.allocations, isTargets: true });
    }
    if (url.includes("/api/treasury/flows")) {
      return jsonResponse({ available: true, flows: h.flows });
    }
    return jsonResponse({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("TreasuryApp", () => {
  it("shows honest near-zero reserves on a fresh chain (never $14.20M)", async () => {
    h.summary = { available: true, cryptWei: "0", ethWei: "0" };
    render(<TreasuryApp />);
    await waitFor(() => expect(screen.getByTestId("treasury-hero")).toBeInTheDocument());
    expect(screen.getByTestId("treasury-hero")).toHaveTextContent(/0/);
    expect(screen.queryByText(/\$14\.20M/)).not.toBeInTheDocument();
  });

  it("renders an empty disbursements ledger on a fresh chain", async () => {
    h.flows = [];
    render(<TreasuryApp />);
    await waitFor(() => expect(screen.getByTestId("disbursements")).toBeInTheDocument());
    expect(screen.getByTestId("ledger-empty")).toBeInTheDocument();
  });

  it("renders allocation targets tagged as TARGETS (not live splits)", async () => {
    h.allocations = [
      {
        bucket: "embassy_ops",
        label: "Embassy operations",
        targetBps: 3800,
        color: "#c8a96a",
        onchainBps: null,
      },
    ];
    render(<TreasuryApp />);
    await waitFor(() => expect(screen.getByTestId("allocation-card")).toBeInTheDocument());
    const card = screen.getByTestId("allocation-card");
    expect(card).toHaveTextContent(/Embassy operations/);
    expect(card).toHaveTextContent(/TARGET/i);
  });

  it("STAKE is a link to /dashboard/wallet (no on-chain write from this screen)", async () => {
    render(<TreasuryApp />);
    const stake = await screen.findByRole("link", { name: /stake/i });
    expect(stake).toHaveAttribute("href", "/dashboard/wallet");
  });

  it("renders a per-card retry when the treasury summary read errors", async () => {
    h.summaryThrows = true;
    render(<TreasuryApp />);
    await waitFor(() => expect(screen.getByTestId("treasury-hero-error")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("renders gracefully when the treasury is unavailable (unregistered chain)", async () => {
    h.treasuryAvailable = false;
    h.summary = { available: false, cryptWei: null, ethWei: null };
    render(<TreasuryApp />);
    await waitFor(() => expect(screen.getByTestId("treasury-hero")).toBeInTheDocument());
    expect(screen.getByTestId("treasury-unavailable")).toBeInTheDocument();
  });
});
