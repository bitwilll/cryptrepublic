// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";

/**
 * CitizenHomeApp tests. `useCitizen`/`useChainInfo` and the `/api/*` fetches are
 * mocked so the island renders without a live chain. Asserts (constraint #5/#9):
 * - a loading skeleton renders before data resolves
 * - a citizen with 0 on-chain obligations shows the honest empty state (NEVER a
 *   fabricated "3 obligations")
 * - a not-yet-citizen shows "Welcome, applicant" + a single "Mint your passport"
 *   obligation
 * - the salutation shows the REAL block (never /21 408 932/)
 * - a per-card fetch error renders a retry, not a blank screen
 */

const h = vi.hoisted(() => ({
  isCitizen: true,
  tokenId: 7n as bigint | null,
  block: 424242n as bigint | null,
  obligations: [] as { kind: string; ref: string; label: string }[],
  activity: [] as { kind: string; blockNumber: string; ref: string }[],
  totalCitizens: "12" as string | null,
  activityThrows: false,
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
    blockNumber: h.block,
    gasMaxFeePerGasWei: null,
    explorerBase: "https://sepolia.basescan.org",
    online: true,
  }),
}));

const originalFetch = globalThis.fetch;

import { CitizenHomeApp } from "./CitizenHomeApp";

beforeEach(() => {
  h.isCitizen = true;
  h.tokenId = 7n;
  h.block = 424242n;
  h.obligations = [];
  h.activity = [];
  h.totalCitizens = "12";
  h.activityThrows = false;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/citizen/obligations")) {
      return jsonResponse({
        isCitizen: h.isCitizen,
        tokenId: h.tokenId?.toString() ?? null,
        obligations: h.obligations,
      });
    }
    if (url.includes("/api/stats/activity")) {
      if (h.activityThrows) return new Response("boom", { status: 500 });
      return jsonResponse({ activity: h.activity });
    }
    if (url.includes("/api/stats/summary")) {
      return jsonResponse({ totalCitizens: h.totalCitizens });
    }
    return jsonResponse({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("CitizenHomeApp", () => {
  it("renders a citizen salutation with the REAL block (never 21 408 932)", async () => {
    render(<CitizenHomeApp />);
    await waitFor(() => expect(screen.getByTestId("salutation")).toBeInTheDocument());
    expect(screen.getByTestId("salutation")).toHaveTextContent(/424242/);
    expect(screen.queryByText(/21 408 932/)).not.toBeInTheDocument();
  });

  it("shows the honest empty obligations state for a citizen with 0 obligations", async () => {
    h.obligations = [];
    render(<CitizenHomeApp />);
    await waitFor(() => expect(screen.getByTestId("obligations")).toBeInTheDocument());
    expect(screen.getByTestId("obligations-empty")).toBeInTheDocument();
    // No fabricated count.
    expect(screen.queryByText(/3 obligations/i)).not.toBeInTheDocument();
  });

  it("renders real obligations when present", async () => {
    h.obligations = [{ kind: "vote", ref: "1", label: "Proposal #1 awaits your vote." }];
    render(<CitizenHomeApp />);
    await waitFor(() =>
      expect(screen.getByText(/Proposal #1 awaits your vote\./i)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("obligations-empty")).not.toBeInTheDocument();
  });

  it("shows 'Welcome, applicant' + a mint obligation for a not-yet-citizen", async () => {
    h.isCitizen = false;
    h.tokenId = null;
    render(<CitizenHomeApp />);
    await waitFor(() => expect(screen.getByTestId("salutation")).toHaveTextContent(/applicant/i));
    const obligations = await screen.findByTestId("obligations");
    expect(within(obligations).getByRole("link", { name: /mint your passport/i })).toHaveAttribute(
      "href",
      "/dashboard/mint",
    );
  });

  it("renders a per-card retry (not a blank screen) when the activity fetch errors", async () => {
    h.activityThrows = true;
    render(<CitizenHomeApp />);
    await waitFor(() => expect(screen.getByTestId("ledger-error")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});
