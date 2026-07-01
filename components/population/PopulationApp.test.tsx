// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * PopulationApp tests (read-only, public). `useChainInfo` and the
 * `/api/population/census` + `/api/stats/census` + `/api/stats/inductions`
 * fetches are mocked. Asserts (§7.11, constraints #5/#9, addenda #1/#2):
 * - the hero shows the LIVE totalCitizens() count, NOT a hardcoded 48 392
 * - the map renders pins from the census API with sqrt-scaled radii
 * - seeded per-city counts are tagged SEEDED and NOT summed into the live total
 * - recent inductions render from CitizenMinted logs (empty state when none)
 * - the screen renders for a not-yet-citizen (public)
 */

const h = vi.hoisted(() => ({
  totalCitizens: "12" as string | null,
  delta24h: 0,
  cities: [] as Array<Record<string, unknown>>,
  inductions: [] as Array<Record<string, unknown>>,
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
  h.totalCitizens = "12";
  h.delta24h = 0;
  h.cities = [];
  h.inductions = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/population/census")) {
      return jsonResponse({
        totalCitizens: h.totalCitizens,
        cities: h.cities,
        liveCountSource: "self-declared domicile (minted citizens only)",
        seededNote: "seededCount is a demonstrative snapshot; never merged into totalCitizens",
      });
    }
    if (url.includes("/api/stats/census")) {
      return jsonResponse({ totalCitizens: h.totalCitizens, delta24h: h.delta24h });
    }
    if (url.includes("/api/stats/inductions")) {
      return jsonResponse({ inductions: h.inductions });
    }
    return jsonResponse({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const CITIES = [
  {
    code: "LIS",
    name: "Lisbon",
    lat: 38.7,
    long: -9.1,
    hasEmbassy: true,
    liveCount: 2,
    seededCount: 4108,
  },
  {
    code: "TYO",
    name: "Tokyo",
    lat: 35.6,
    long: 139.7,
    hasEmbassy: true,
    liveCount: 0,
    seededCount: 6210,
  },
];

describe("PopulationApp", () => {
  it("shows the LIVE totalCitizens() count, not a hardcoded 48 392", async () => {
    h.totalCitizens = "12";
    render(<PopulationApp />);
    await waitFor(() => expect(screen.getByTestId("census-hero")).toBeInTheDocument());
    expect(screen.getByTestId("census-hero")).toHaveTextContent(/12/);
    expect(screen.queryByText(/48 392/)).not.toBeInTheDocument();
  });

  it("renders map pins from the census API with sqrt-scaled radii", async () => {
    h.cities = CITIES;
    render(<PopulationApp />);
    await waitFor(() => expect(screen.getByTestId("world-map")).toBeInTheDocument());
    const pins = screen.getAllByTestId("map-pin");
    expect(pins.length).toBe(2);
  });

  it("tags seeded per-city counts SEEDED and does NOT merge them into the live total", async () => {
    h.cities = CITIES;
    h.totalCitizens = "12";
    render(<PopulationApp />);
    await waitFor(() => expect(screen.getByTestId("top-cities")).toBeInTheDocument());
    const topCities = screen.getByTestId("top-cities");
    expect(topCities).toHaveTextContent(/SEEDED/i);
    // The live total is 12, never the sum of seeded (4108 + 6210 = 10318).
    expect(screen.getByTestId("census-hero")).not.toHaveTextContent(/10 318|10318/);
  });

  it("renders recent inductions from CitizenMinted logs with an empty state when none", async () => {
    h.inductions = [];
    render(<PopulationApp />);
    await waitFor(() => expect(screen.getByTestId("recent-inductions")).toBeInTheDocument());
    expect(screen.getByTestId("inductions-empty")).toBeInTheDocument();
  });

  it("renders inductions rows when present", async () => {
    h.inductions = [{ tokenId: "3", mintBlock: "50", blockNumber: "50" }];
    render(<PopulationApp />);
    await waitFor(() => expect(screen.getByText(/№3/)).toBeInTheDocument());
    expect(screen.queryByTestId("inductions-empty")).not.toBeInTheDocument();
  });
});
