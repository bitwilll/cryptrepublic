// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

/**
 * DashboardShell tests. The chain-stats reader, passport client, and embedded
 * session are mocked so the shell renders without a live chain. Asserts:
 * - the 8 nav items render with the correct hrefs
 * - "MINT A PASSPORT" links to /dashboard/mint
 * - the Topbar shows the REAL chain name (never CR-L2/7331) + a live block
 * - the Citizen card shows an APPLICANT state when not a citizen
 * - the burger toggles the mobile drawer
 * - the shell still renders (graceful) when the passport accessor throws
 *   (unregistered chain — constraint #11)
 */

const h = vi.hoisted(() => ({ passportThrows: false, isCitizen: false }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

vi.mock("@/lib/config/chain", () => ({
  activeChain: () => ({ primaryChainId: 84532 }),
}));

vi.mock("@/lib/wallet/services/chainStats", () => ({
  readChainStats: async () => ({
    chainId: 84532,
    chainName: "Base Sepolia",
    blockNumber: 12345n,
    gasMaxFeePerGasWei: 1_000_000_000n,
    explorerBase: "https://sepolia.basescan.org",
    representativeNote:
      "Validators, TPS, and finality are not measurable on this network and are omitted.",
  }),
}));

vi.mock("@/lib/wallet/embedded/storage", () => ({
  hasVault: async () => true,
}));

vi.mock("@/lib/wallet/embedded/session", () => ({
  isUnlocked: () => false,
  loadPublicAccounts: async () => ({
    evm: "0x00000000000000000000000000000000000000A1",
    solana: "So",
    bitcoin: "tb1",
  }),
}));

vi.mock("@/lib/passport/client", () => ({
  readPassportStatus: async () => {
    if (h.passportThrows) throw new Error("Passport not deployed on chain 84532");
    return h.isCitizen ? { isCitizen: true, tokenId: 7n } : { isCitizen: false };
  },
}));

// Fetch is used for nav badges (open proposals / obligations) — stub to empty.
const originalFetch = globalThis.fetch;

import { DashboardShell } from "./DashboardShell";

beforeEach(() => {
  h.passportThrows = false;
  h.isCitizen = false;
  globalThis.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ proposals: [], obligations: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const NAV = [
  ["Citizen home", "/dashboard"],
  ["Constitution & votes", "/dashboard/governance"],
  ["Treasury", "/dashboard/treasury"],
  ["Population", "/dashboard/population"],
  ["Your passport", "/dashboard/passport"],
  ["Sovereign holdings", "/dashboard/holdings"],
  ["Embassies", "/dashboard/embassies"],
  ["Wallet & chain", "/dashboard/wallet"],
] as const;

describe("DashboardShell", () => {
  it("renders the 8 nav items with correct hrefs", async () => {
    render(
      <DashboardShell>
        <div>child</div>
      </DashboardShell>,
    );
    for (const [label, href] of NAV) {
      const link = await screen.findByRole("link", { name: new RegExp(label, "i") });
      expect(link).toHaveAttribute("href", href);
    }
  });

  it("links MINT A PASSPORT to /dashboard/mint", async () => {
    render(
      <DashboardShell>
        <div>child</div>
      </DashboardShell>,
    );
    const mint = await screen.findByRole("link", { name: /mint a passport/i });
    expect(mint).toHaveAttribute("href", "/dashboard/mint");
  });

  it("shows the REAL chain name (not CR-L2/7331) and a live block in the topbar", async () => {
    render(
      <DashboardShell>
        <div>child</div>
      </DashboardShell>,
    );
    await waitFor(() => expect(screen.getAllByText(/Base Sepolia/i).length).toBeGreaterThan(0));
    expect(screen.queryAllByText(/CR-L2/i)).toHaveLength(0);
    expect(screen.queryAllByText(/7331/)).toHaveLength(0);
    // live block appears somewhere in the topbar
    await waitFor(() => expect(screen.getByTestId("topbar-block")).toHaveTextContent(/12345/));
  });

  it("shows an APPLICANT state in the citizen card when not a citizen", async () => {
    render(
      <DashboardShell>
        <div>child</div>
      </DashboardShell>,
    );
    const card = await screen.findByTestId("citizen-card");
    await waitFor(() => expect(within(card).getByText(/applicant/i)).toBeInTheDocument());
  });

  it("burger toggles the mobile drawer", async () => {
    render(
      <DashboardShell>
        <div>child</div>
      </DashboardShell>,
    );
    const burger = await screen.findByRole("button", { name: /open navigation/i });
    expect(screen.queryByTestId("nav-backdrop")).not.toBeInTheDocument();
    fireEvent.click(burger);
    expect(screen.getByTestId("nav-backdrop")).toBeInTheDocument();
  });

  it("renders gracefully (no crash) when the passport accessor throws (unregistered chain)", async () => {
    h.passportThrows = true;
    render(
      <DashboardShell>
        <div data-testid="child-content">child</div>
      </DashboardShell>,
    );
    // children still render; citizen card falls back to APPLICANT
    expect(await screen.findByTestId("child-content")).toBeInTheDocument();
    const card = await screen.findByTestId("citizen-card");
    await waitFor(() => expect(within(card).getByText(/applicant/i)).toBeInTheDocument());
  });
});
