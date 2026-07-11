// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";

/**
 * CitizenHomeApp — OFFICE OF THE REPUBLIC strip (Wave 16). The /api/government
 * fetch is mocked. Asserts:
 * - a citizen holding offices sees one gold-ink pill per office in the order
 *   the API returns (protocol precedence), "Minister · Treasury" formatting
 * - an officeless citizen sees NOTHING (no strip, no layout shift)
 * - a failed fetch degrades to nothing (never a broken hero)
 */

const h = vi.hoisted(() => ({
  mine: [] as Array<Record<string, unknown>>,
  governmentThrows: false,
}));

vi.mock("@/components/shell/SessionCitizenProvider", () => ({
  useCitizen: () => ({
    address: "0x00000000000000000000000000000000000000A1",
    isCitizen: true,
    tokenId: 7n,
    loading: false,
    refresh: () => {},
  }),
}));

vi.mock("@/lib/hooks/useChainInfo", () => ({
  useChainInfo: () => ({
    chainId: 84532,
    chainName: "Base Sepolia",
    blockNumber: 424242n,
    gasMaxFeePerGasWei: null,
    explorerBase: "https://sepolia.basescan.org",
    online: true,
  }),
}));

const originalFetch = globalThis.fetch;

import { CitizenHomeApp } from "./CitizenHomeApp";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  h.mine = [];
  h.governmentThrows = false;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/citizen/obligations")) {
      return jsonResponse({ isCitizen: true, tokenId: "7", obligations: [] });
    }
    if (url.includes("/api/stats/activity")) return jsonResponse({ activity: [] });
    if (url.includes("/api/stats/summary")) return jsonResponse({ totalCitizens: "12" });
    if (url.includes("/api/applications")) return jsonResponse({ application: null });
    if (url.includes("/api/government")) {
      if (h.governmentThrows) return new Response("boom", { status: 500 });
      return jsonResponse({ roster: [], mine: h.mine });
    }
    return jsonResponse({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("CitizenHomeApp — OFFICE OF THE REPUBLIC strip", () => {
  it("renders a gold-ink pill per office ('Minister · Treasury') for an office holder", async () => {
    h.mine = [
      {
        office: "MINISTER",
        officeLabel: "Minister",
        portfolio: "Treasury",
        appointedAt: "2026-07-02T00:00:00.000Z",
      },
      {
        office: "SENATOR",
        officeLabel: "Senator",
        portfolio: null,
        appointedAt: "2026-07-01T00:00:00.000Z",
      },
    ];
    render(<CitizenHomeApp />);
    const strip = await screen.findByTestId("office-strip");
    expect(strip).toHaveTextContent(/office of the republic/i);
    const pills = within(strip).getAllByTestId("office-pill");
    expect(pills).toHaveLength(2);
    expect(pills[0]).toHaveTextContent("Minister · Treasury");
    expect(pills[1]).toHaveTextContent("Senator");
  });

  it("renders NOTHING for an officeless citizen", async () => {
    h.mine = [];
    render(<CitizenHomeApp />);
    await waitFor(() => expect(screen.getByTestId("salutation")).toBeInTheDocument());
    // Let the /api/government fetch settle, then assert absence.
    await waitFor(() => expect(screen.getByTestId("obligations")).toBeInTheDocument());
    expect(screen.queryByTestId("office-strip")).not.toBeInTheDocument();
    expect(screen.queryByTestId("office-pill")).not.toBeInTheDocument();
  });

  it("degrades to nothing (never a broken hero) when the government fetch fails", async () => {
    h.governmentThrows = true;
    render(<CitizenHomeApp />);
    await waitFor(() => expect(screen.getByTestId("salutation")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("obligations")).toBeInTheDocument());
    expect(screen.queryByTestId("office-strip")).not.toBeInTheDocument();
  });
});
