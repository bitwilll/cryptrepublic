// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";

/**
 * PopulationApp — THE GOVERNMENT card (Wave 16). The /api/government fetch is
 * mocked. Asserts:
 * - the roster renders GROUPED by office in protocol precedence order (PM
 *   before Minister before Senator) with holder display + portfolio +
 *   appointed date
 * - the empty state renders the Cabinet wording when no offices are filled
 * - a signed-out visitor (401) gets a sign-in note, never a broken card
 */

const h = vi.hoisted(() => ({
  roster: [] as Array<Record<string, unknown>>,
  governmentStatus: 200,
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

const originalFetch = globalThis.fetch;

import { PopulationApp } from "./PopulationApp";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  h.roster = [];
  h.governmentStatus = 200;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/flags")) return jsonResponse({ flags: {} });
    if (url.includes("/api/population/census")) {
      return jsonResponse({ totalCitizens: "12", cities: [] });
    }
    if (url.includes("/api/stats/census")) return jsonResponse({ delta24h: 0 });
    if (url.includes("/api/stats/inductions")) return jsonResponse({ inductions: [] });
    if (url.includes("/api/government")) {
      if (h.governmentStatus !== 200) {
        return jsonResponse({ error: "Unauthorized." }, h.governmentStatus);
      }
      return jsonResponse({ roster: h.roster, mine: [] });
    }
    return jsonResponse({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const ROSTER = [
  // Deliberately OUT of precedence order — the card must re-group/order it.
  {
    office: "SENATOR",
    officeLabel: "Senator",
    portfolio: null,
    holder: { display: "Citizen № 12" },
    appointedAt: "2026-07-01T00:00:00.000Z",
  },
  {
    office: "MINISTER",
    officeLabel: "Minister",
    portfolio: "Treasury",
    holder: { display: "Ada Lovelace" },
    appointedAt: "2026-07-02T00:00:00.000Z",
  },
  {
    office: "PRIME_MINISTER",
    officeLabel: "Prime Minister",
    portfolio: null,
    holder: { display: "Citizen № 1" },
    appointedAt: "2026-07-03T00:00:00.000Z",
  },
  {
    office: "MINISTER",
    officeLabel: "Minister",
    portfolio: "Archives",
    holder: { display: "Citizen" },
    appointedAt: "2026-07-04T00:00:00.000Z",
  },
];

describe("PopulationApp — THE GOVERNMENT card", () => {
  it("renders the roster grouped by office in protocol precedence order", async () => {
    h.roster = ROSTER;
    render(<PopulationApp />);
    await waitFor(() => expect(screen.getAllByTestId("office-group").length).toBe(3));

    const groups = screen.getAllByTestId("office-group");
    // Precedence order: PM, then Minister, then Senator — regardless of input order.
    expect(within(groups[0]!).getByRole("heading")).toHaveTextContent(/^Prime Minister$/);
    expect(within(groups[1]!).getByRole("heading")).toHaveTextContent(/^Minister$/);
    expect(within(groups[2]!).getByRole("heading")).toHaveTextContent(/^Senator$/);

    // Both ministers live in ONE group, holder display + portfolio + date shown.
    const ministers = within(groups[1]!).getAllByTestId("office-holder");
    expect(ministers).toHaveLength(2);
    expect(groups[1]).toHaveTextContent("Ada Lovelace");
    expect(groups[1]).toHaveTextContent(/treasury/i);
    expect(groups[1]).toHaveTextContent(/archives/i);
    expect(groups[1]).toHaveTextContent(/appointed 02 jul 2026/i);
    expect(groups[0]).toHaveTextContent("Citizen № 1");
    expect(groups[2]).toHaveTextContent("Citizen № 12");
  });

  it("renders the Cabinet empty state when no offices are filled", async () => {
    h.roster = [];
    render(<PopulationApp />);
    await waitFor(() => expect(screen.getByTestId("government-empty")).toBeInTheDocument());
    expect(screen.getByTestId("government-empty")).toHaveTextContent(
      "No offices have been filled. The Cabinet appoints the government from the citizenry.",
    );
    expect(screen.queryByTestId("office-group")).not.toBeInTheDocument();
  });

  it("shows a sign-in note (not a broken card) for a signed-out visitor", async () => {
    h.governmentStatus = 401;
    render(<PopulationApp />);
    await waitFor(() => expect(screen.getByTestId("government-signin")).toBeInTheDocument());
    expect(screen.getByTestId("government-signin")).toHaveTextContent(/sign in/i);
    expect(screen.queryByTestId("government-error")).not.toBeInTheDocument();
    expect(screen.queryByTestId("government-empty")).not.toBeInTheDocument();
  });
});
