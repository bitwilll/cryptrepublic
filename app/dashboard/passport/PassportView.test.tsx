// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * PassportView provisional states (look-and-feel). Chain-truth is preserved:
 * the REAL sealed passport only renders when the chain says citizen. When the
 * chain says NOT a citizen but an application exists off-chain, a clearly
 * labeled PROVISIONAL card renders — "TO BE MINTED" (admin-approved or
 * witnessed) or "PENDING · TO BE VERIFIED" (earlier) — never presented as real
 * citizenship.
 */
const h = vi.hoisted(() => ({
  isCitizen: false,
  application: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/passport/client", () => ({
  readPassportStatus: async () => ({
    isCitizen: h.isCitizen,
    tokenId: h.isCitizen ? 7n : null,
    citizen: h.isCitizen ? { motto: undefined, domicile: undefined, mintBlock: 100n } : undefined,
    tokenURI: null,
  }),
  readTotalCitizens: async () => 12n,
}));
vi.mock("@/lib/wallet/embedded/session", () => ({
  getAccounts: () => ({ evm: "0x00000000000000000000000000000000000000A1" }),
  loadPublicAccounts: async () => ({ evm: "0x00000000000000000000000000000000000000A1" }),
}));
vi.mock("wagmi", () => ({ useAccount: () => ({ address: undefined }) }));
vi.mock("@/lib/config/chain", () => ({ activeChain: () => ({ primaryChainId: 84532 }) }));

const originalFetch = globalThis.fetch;
import PassportView from "./PassportView";

function jsonRes(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  h.isCitizen = false;
  h.application = null;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("/api/applications")) return jsonRes({ application: h.application });
    return jsonRes({});
  }) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("PassportView provisional states", () => {
  it("admin-approved (not on chain) → a provisional 'TO BE MINTED' passport card with the declared name", async () => {
    h.application = {
      status: "OATH_ACCEPTED",
      name: "Jay Doe",
      domicileCity: "Lisbon",
      motto: "code is law",
      adminApprovedAt: "2026-07-04T00:00:00.000Z",
    };
    render(<PassportView />);
    await waitFor(() => expect(screen.getByTestId("passport-provisional")).toBeInTheDocument());
    expect(screen.getByTestId("passport-provisional-status")).toHaveTextContent(/to be minted/i);
    expect(screen.getByTestId("passport-provisional")).toHaveTextContent(/JAY DOE/i);
    expect(screen.getByTestId("passport-provisional")).toHaveTextContent(/not yet on chain/i);
    // Never claims real citizenship.
    expect(screen.queryByText(/Citizen №7/)).not.toBeInTheDocument();
  });

  it("WITNESSED (not on chain) → a provisional 'TO BE MINTED' card", async () => {
    h.application = {
      status: "WITNESSED",
      name: "Ada",
      domicileCity: "",
      motto: "",
      adminApprovedAt: null,
    };
    render(<PassportView />);
    await waitFor(() =>
      expect(screen.getByTestId("passport-provisional-status")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("passport-provisional-status")).toHaveTextContent(/to be minted/i);
  });

  it("an earlier application → a 'PENDING · TO BE VERIFIED' provisional card", async () => {
    h.application = {
      status: "OATH_ACCEPTED",
      name: "Sol",
      domicileCity: "",
      motto: "",
      adminApprovedAt: null,
    };
    render(<PassportView />);
    await waitFor(() =>
      expect(screen.getByTestId("passport-provisional-status")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("passport-provisional-status")).toHaveTextContent(
      /pending|to be verified/i,
    );
  });

  it("NO application → the plain 'not yet a citizen' CTA (no provisional card)", async () => {
    h.application = null;
    render(<PassportView />);
    await waitFor(() => expect(screen.getByText(/not yet a citizen/i)).toBeInTheDocument());
    expect(screen.queryByTestId("passport-provisional")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /mint your passport/i })).toBeInTheDocument();
  });

  it("a real on-chain citizen → the real sealed passport (unchanged)", async () => {
    h.isCitizen = true;
    render(<PassportView />);
    await waitFor(() => expect(screen.getByText(/Your Passport/i)).toBeInTheDocument());
    expect(screen.getByText(/Citizen №7/)).toBeInTheDocument();
    expect(screen.queryByTestId("passport-provisional")).not.toBeInTheDocument();
  });
});
