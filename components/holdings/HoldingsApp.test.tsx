// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

/**
 * HoldingsApp tests. The dividends read client + claim writer, `useCitizen`,
 * `useChainInfo`, distributor availability, the embedded session, and the
 * `/api/holdings/*` + `/api/constitution` fetches are mocked. Asserts (§7.10,
 * constraints #5/#6/#7/#9):
 * - the AUM hero + composition carry a visible SEEDED/DEMONSTRATIVE tag; the
 *   fabricated register total is NEVER shown untagged as a live valuation
 * - the asset register renders with working kind filters
 * - a fresh chain (currentEpoch 0 / claimable 0) shows the honest "no epoch open"
 *   state and a DISABLED claim button
 * - a citizen with claimable > 0 can claim; claimDividendEmbedded(chainId, epoch,
 *   tokenId) is called
 * - a non-citizen sees "Mint your passport to receive dividends"
 * - the visible LEGAL dividend note renders (regulated security)
 * - dividend history renders from DividendClaimed logs (empty when none)
 */

const h = vi.hoisted(() => ({
  isCitizen: true,
  tokenId: 7n as bigint | null,
  distributorAvailable: true,
  currentEpoch: 0n,
  epoch: {
    epochId: 1n,
    amount: 0n,
    snapshotCitizens: 0n,
    perCitizen: 0n,
    openedAt: 0n,
    open: false,
  },
  claimable: 0n,
  claimArgs: null as null | [number, bigint, bigint],
  assets: [] as Array<Record<string, unknown>>,
  claims: [] as Array<Record<string, unknown>>,
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
    chainId: 31337,
    chainName: "Anvil",
    blockNumber: 100n,
    gasMaxFeePerGasWei: null,
    explorerBase: null,
    online: true,
  }),
}));

vi.mock("@/lib/config/chain", () => ({
  activeChain: () => ({ primaryChainId: 31337 }),
}));

vi.mock("@/config/contracts", () => ({
  distributorAvailable: () => h.distributorAvailable,
}));

vi.mock("@/lib/wallet/embedded/session", () => ({
  isUnlocked: () => true,
  unlock: async () => ({ evm: "0x00000000000000000000000000000000000000A1" }),
}));

vi.mock("@/lib/dividends/client", () => ({
  readCurrentEpoch: async () => h.currentEpoch,
  readEpoch: async () => h.epoch,
  readClaimable: async () => h.claimable,
}));

vi.mock("@/lib/dividends/write", () => ({
  claimDividendEmbedded: async (chainId: number, epochId: bigint, tokenId: bigint) => {
    h.claimArgs = [chainId, epochId, tokenId];
    return "0xclaimhash" as `0x${string}`;
  },
}));

const originalFetch = globalThis.fetch;

import { HoldingsApp } from "./HoldingsApp";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  h.isCitizen = true;
  h.tokenId = 7n;
  h.distributorAvailable = true;
  h.currentEpoch = 0n;
  h.epoch = {
    epochId: 1n,
    amount: 0n,
    snapshotCitizens: 0n,
    perCitizen: 0n,
    openedAt: 0n,
    open: false,
  };
  h.claimable = 0n;
  h.claimArgs = null;
  h.assets = [];
  h.claims = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/holdings/assets")) {
      const total = h.assets.reduce((s, a) => s + BigInt(a.valueUsd as string), 0n);
      const byKind: Record<string, bigint> = {};
      for (const a of h.assets)
        byKind[a.kind as string] = (byKind[a.kind as string] ?? 0n) + BigInt(a.valueUsd as string);
      const composition = Object.entries(byKind).map(([kind, value]) => ({
        kind,
        valueUsd: value.toString(),
        shareBps: total > 0n ? Number((value * 10000n) / total) : 0,
      }));
      return jsonResponse({
        assets: h.assets,
        totalValueUsd: total.toString(),
        totalAnnualYieldUsd: "0",
        composition,
        seeded: true,
      });
    }
    if (url.includes("/api/holdings/dividends")) {
      return jsonResponse({ available: true, claims: h.claims });
    }
    if (url.includes("/api/constitution")) {
      return jsonResponse({ texts: [] });
    }
    return jsonResponse({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const ASSETS = [
  {
    ref: "RE-001",
    kind: "re",
    name: "Embassy Lisbon",
    location: "Lisbon, PT",
    valueUsd: "28400000",
    yieldBps: 480,
    annualYieldUsd: "1363200",
    status: "OWNED (demonstrative)",
    acquiredAt: "2024.11.04",
  },
  {
    ref: "IP-001",
    kind: "ip",
    name: "US 11,492,818",
    location: "USPTO",
    valueUsd: "18600000",
    yieldBps: 940,
    annualYieldUsd: "1748400",
    status: "GRANTED",
    acquiredAt: "2025.04.11",
  },
];

describe("HoldingsApp", () => {
  it("carries a visible SEEDED/DEMONSTRATIVE tag on the AUM hero (never a live valuation)", async () => {
    h.assets = ASSETS;
    render(<HoldingsApp />);
    await waitFor(() => expect(screen.getByTestId("holdings-hero")).toBeInTheDocument());
    const hero = screen.getByTestId("holdings-hero");
    expect(hero).toHaveTextContent(/SEEDED|DEMONSTRATIVE/i);
  });

  it("renders the asset register with working kind filters", async () => {
    h.assets = ASSETS;
    render(<HoldingsApp />);
    await waitFor(() => expect(screen.getByText(/Embassy Lisbon/)).toBeInTheDocument());
    expect(screen.getByText(/US 11,492,818/)).toBeInTheDocument();
    // filter to Real estate only
    fireEvent.click(screen.getByRole("button", { name: /real estate/i }));
    await waitFor(() => expect(screen.queryByText(/US 11,492,818/)).not.toBeInTheDocument());
    expect(screen.getByText(/Embassy Lisbon/)).toBeInTheDocument();
  });

  it("shows the 'no dividend epoch open' empty state + a DISABLED claim on a fresh chain", async () => {
    h.currentEpoch = 0n;
    h.claimable = 0n;
    render(<HoldingsApp />);
    await waitFor(() => expect(screen.getByTestId("dividend-panel")).toBeInTheDocument());
    expect(screen.getByTestId("no-epoch")).toBeInTheDocument();
    const claim = screen.getByRole("button", { name: /claim dividend/i });
    expect(claim).toBeDisabled();
  });

  it("a citizen with claimable > 0 can claim; claimDividendEmbedded(chainId, epoch, tokenId) is called", async () => {
    h.currentEpoch = 1n;
    h.epoch = {
      epochId: 1n,
      amount: 1000n,
      snapshotCitizens: 10n,
      perCitizen: 100n,
      openedAt: 5n,
      open: true,
    };
    h.claimable = 100n;
    render(<HoldingsApp />);
    await waitFor(() => expect(screen.getByTestId("dividend-panel")).toBeInTheDocument());
    const claim = await screen.findByRole("button", { name: /claim dividend/i });
    await waitFor(() => expect(claim).not.toBeDisabled());
    fireEvent.click(claim);
    await waitFor(() => expect(h.claimArgs).not.toBeNull());
    expect(h.claimArgs).toEqual([31337, 1n, 7n]);
  });

  it("a non-citizen sees 'Mint your passport to receive dividends'", async () => {
    h.isCitizen = false;
    h.tokenId = null;
    render(<HoldingsApp />);
    await waitFor(() => expect(screen.getByTestId("dividend-panel")).toBeInTheDocument());
    const panel = screen.getByTestId("dividend-panel");
    expect(
      within(panel).getAllByText(/mint your passport to receive dividends/i).length,
    ).toBeGreaterThan(0);
  });

  it("renders the visible LEGAL dividend note (regulated security)", async () => {
    render(<HoldingsApp />);
    await waitFor(() => expect(screen.getByText(/regulated security/i)).toBeInTheDocument());
  });

  it("renders dividend history from DividendClaimed logs (empty state when none)", async () => {
    h.claims = [];
    render(<HoldingsApp />);
    await waitFor(() => expect(screen.getByTestId("dividend-history")).toBeInTheDocument());
    const history = screen.getByTestId("dividend-history");
    expect(within(history).getByTestId("ledger-empty")).toBeInTheDocument();
  });
});
