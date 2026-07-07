// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { StoreApp } from "./StoreApp";

/**
 * StoreApp tests (Wave 15 store). fetch is mocked per-URL. Asserts:
 * - browse renders listing cards (mono price / category / seller / date)
 *   from GET /api/store/listings, and the official empty state otherwise
 * - the settlement notice ("the Republic never holds funds") is on the page
 * - the My-listings tab lists the seller ledger and WITHDRAW is two-step:
 *   no PATCH fires until "Confirm withdrawal" is pressed
 */

const h = vi.hoisted(() => ({
  browse: { listings: [] as unknown[], nextCursor: null as string | null },
  mine: { listings: [] as unknown[] },
  inquiries: { inquiries: [] as unknown[] },
  patches: [] as Array<{ url: string; body: unknown }>,
}));

function jsonRes(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => data,
  } as Response;
}

beforeEach(() => {
  h.browse = { listings: [], nextCursor: null };
  h.mine = { listings: [] };
  h.inquiries = { inquiries: [] };
  h.patches = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "PATCH") {
        h.patches.push({ url, body: JSON.parse(String(init.body)) });
        return jsonRes({ ok: true, listing: {} });
      }
      if (url.includes("/api/store/listings?mine=1")) return jsonRes(h.mine);
      if (url.includes("/api/store/inquiries")) return jsonRes(h.inquiries);
      if (url.includes("/api/store/listings")) return jsonRes(h.browse);
      throw new Error(`unmocked fetch ${url}`);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const card = {
  id: "lst1",
  title: "Ceremonial flag",
  description: "A full-size ceremonial flag of the Republic.",
  category: "GOODS",
  priceCoin: "128.00",
  status: "ACTIVE",
  createdAt: "2026-07-01T10:00:00.000Z",
  sellerDisplay: "Citizen № 42",
};

describe("StoreApp — browse", () => {
  it("renders listing cards with the mono price, seller display, and settlement copy", async () => {
    h.browse.listings = [card];
    render(<StoreApp />);
    await waitFor(() => expect(screen.getByText("Ceremonial flag")).toBeTruthy());
    expect(screen.getByText("₡ 128.00 CRPT")).toBeTruthy();
    expect(screen.getByText("Citizen № 42")).toBeTruthy();
    expect(screen.getByText(/Posted 01 Jul 2026/)).toBeTruthy();
    expect(
      screen.getByText(/Settlement is arranged citizen-to-citizen; the Republic never holds funds/),
    ).toBeTruthy();
    const link = screen.getByText("Ceremonial flag").closest("a");
    expect(link?.getAttribute("href")).toBe("/dashboard/store/lst1");
  });

  it("shows the official empty state when nothing is listed", async () => {
    render(<StoreApp />);
    await waitFor(() =>
      expect(screen.getByTestId("store-empty").textContent).toMatch(
        /No listings under this seal yet\./,
      ),
    );
  });
});

describe("StoreApp — my listings", () => {
  it("withdraw is two-step: no PATCH until the confirmation button", async () => {
    h.mine.listings = [{ ...card, openInquiries: 0 }];
    render(<StoreApp />);
    fireEvent.click(screen.getByTestId("store-tab-mine"));
    await waitFor(() => expect(screen.getByTestId("my-listing-row")).toBeTruthy());

    fireEvent.click(screen.getByTestId("withdraw-btn"));
    expect(h.patches).toHaveLength(0); // confirmation gate — nothing sent yet

    fireEvent.click(screen.getByTestId("withdraw-confirm-btn"));
    await waitFor(() => expect(h.patches).toHaveLength(1));
    expect(h.patches[0]!.url).toBe("/api/store/listings/lst1");
    expect(h.patches[0]!.body).toEqual({ action: "withdraw" });
  });

  it("a WITHDRAWN row offers Relist which PATCHes the relist action", async () => {
    h.mine.listings = [{ ...card, status: "WITHDRAWN" }];
    render(<StoreApp />);
    fireEvent.click(screen.getByTestId("store-tab-mine"));
    await waitFor(() => expect(screen.getByTestId("relist-btn")).toBeTruthy());
    fireEvent.click(screen.getByTestId("relist-btn"));
    await waitFor(() => expect(h.patches).toHaveLength(1));
    expect(h.patches[0]!.body).toEqual({ action: "relist" });
  });
});
