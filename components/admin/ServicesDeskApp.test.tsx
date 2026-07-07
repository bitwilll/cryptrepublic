// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

/**
 * ServicesDeskApp tests (Wave 15 C). The three admin GETs + PATCH are mocked.
 * Asserts the three panels render their data; the decline dialog REQUIRES a
 * note before its confirm enables and PATCHes {action:"decline", reviewNote};
 * removal PATCHes {action:"remove", reason}; and the statistics panel shows
 * counts only with the BitWill privacy note.
 */

const h = vi.hoisted(() => ({
  applications: [] as Array<Record<string, unknown>>,
  listings: [] as Array<Record<string, unknown>>,
  overview: {
    insurance: { SUBMITTED: 2, IN_REVIEW: 1, APPROVED: 4, DECLINED: 1 },
    listings: { ACTIVE: 5, SOLD: 2, WITHDRAWN: 1, REMOVED: 1 },
    commissary: [
      { itemId: "lapel-pin", count: 12 },
      { itemId: "state-flag", count: 7 },
    ],
    bitwill: { activeCount: 9 },
  } as Record<string, unknown>,
  patches: [] as Array<{ url: string; body: Record<string, unknown> }>,
}));

import { ServicesDeskApp } from "./ServicesDeskApp";

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function application(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "app-1",
    product: "ASSET",
    coverageNote: "Cover the workshop.",
    valueUsd: "250000",
    status: "SUBMITTED",
    reviewNote: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    user: { id: "u1", email: "citizen@example.com", name: null },
    ...over,
  };
}
function listing(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "lst-1",
    title: "Ceremonial flag",
    description: "Hand-stitched.",
    category: "COLLECTIBLES",
    priceCoin: "125",
    status: "ACTIVE",
    createdAt: "2026-07-01T00:00:00.000Z",
    seller: { id: "u2", email: "seller@example.com", name: null },
    ...over,
  };
}

beforeEach(() => {
  h.applications = [];
  h.listings = [];
  h.patches = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "PATCH") {
      h.patches.push({ url, body: init?.body ? JSON.parse(String(init.body)) : {} });
      return jsonResponse({ ok: true });
    }
    if (url.includes("/api/admin/services/overview")) return jsonResponse(h.overview);
    if (url.includes("/api/admin/services/insurance")) {
      return jsonResponse({ applications: h.applications });
    }
    if (url.includes("/api/admin/services/store")) return jsonResponse({ listings: h.listings });
    return jsonResponse({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("ServicesDeskApp", () => {
  it("renders the three panels with queue, table, and statistics", async () => {
    h.applications = [application()];
    h.listings = [listing()];
    render(<ServicesDeskApp />);

    await waitFor(() => expect(screen.getByText("citizen@example.com")).toBeInTheDocument());
    expect(screen.getByTestId("panel-insurance")).toHaveTextContent("$250,000");
    expect(screen.getByTestId("panel-store")).toHaveTextContent("Ceremonial flag");
    expect(screen.getByTestId("panel-store")).toHaveTextContent("seller@example.com");

    const stats = screen.getByTestId("panel-stats");
    expect(stats).toHaveTextContent("lapel-pin");
    expect(screen.getByTestId("bitwill-active-count")).toHaveTextContent("9");
    // counts ONLY — the privacy posture is stated on the panel
    expect(stats).toHaveTextContent(/directives are private instruments/i);
    expect(stats).toHaveTextContent(/never a\s+beneficiary, memo, or signer/i);
  });

  it("begin review PATCHes {action:'review'} directly", async () => {
    h.applications = [application()];
    render(<ServicesDeskApp />);
    await waitFor(() => expect(screen.getByTestId("insurance-review-app-1")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("insurance-review-app-1"));
    await waitFor(() => expect(h.patches).toHaveLength(1));
    expect(h.patches[0]!.url).toBe("/api/admin/services/insurance/app-1");
    expect(h.patches[0]!.body).toEqual({ action: "review" });
  });

  it("decline dialog requires a note before confirm enables, then PATCHes it", async () => {
    h.applications = [application({ status: "IN_REVIEW" })];
    render(<ServicesDeskApp />);
    await waitFor(() => expect(screen.getByTestId("insurance-decline-app-1")).toBeInTheDocument());
    // IN_REVIEW rows do not offer "Begin review"
    expect(screen.queryByTestId("insurance-review-app-1")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("insurance-decline-app-1"));
    const confirm = await screen.findByTestId("decline-confirm");
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/review note \(required\)/i), {
      target: { value: "Declared value could not be substantiated." },
    });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() => expect(h.patches).toHaveLength(1));
    expect(h.patches[0]!.body).toEqual({
      action: "decline",
      reviewNote: "Declared value could not be substantiated.",
    });
  });

  it("approve dialog PATCHes {action:'approve'} (note optional)", async () => {
    h.applications = [application()];
    render(<ServicesDeskApp />);
    await waitFor(() => expect(screen.getByTestId("insurance-approve-app-1")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("insurance-approve-app-1"));
    fireEvent.click(await screen.findByTestId("approve-confirm"));
    await waitFor(() => expect(h.patches).toHaveLength(1));
    expect(h.patches[0]!.body).toEqual({ action: "approve" });
  });

  it("decided applications offer no actions", async () => {
    h.applications = [application({ status: "APPROVED" })];
    render(<ServicesDeskApp />);
    await waitFor(() => expect(screen.getByText("citizen@example.com")).toBeInTheDocument());
    expect(screen.queryByTestId("insurance-approve-app-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("insurance-decline-app-1")).not.toBeInTheDocument();
    expect(screen.getByText("Decided")).toBeInTheDocument();
  });

  it("remove dialog requires a reason and PATCHes {action:'remove', reason}", async () => {
    h.listings = [listing()];
    render(<ServicesDeskApp />);
    await waitFor(() => expect(screen.getByTestId("store-remove-lst-1")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("store-remove-lst-1"));
    const confirm = await screen.findByTestId("remove-confirm");
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/reason \(required\)/i), {
      target: { value: "Violates the trade ordinance." },
    });
    fireEvent.click(confirm);

    await waitFor(() => expect(h.patches).toHaveLength(1));
    expect(h.patches[0]!.url).toBe("/api/admin/services/store/lst-1");
    expect(h.patches[0]!.body).toEqual({
      action: "remove",
      reason: "Violates the trade ordinance.",
    });
  });

  it("REMOVED listings offer no remove action", async () => {
    h.listings = [listing({ status: "REMOVED" })];
    render(<ServicesDeskApp />);
    await waitFor(() => expect(screen.getByText("Ceremonial flag")).toBeInTheDocument());
    expect(screen.queryByTestId("store-remove-lst-1")).not.toBeInTheDocument();
  });
});
