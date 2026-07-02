// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

/**
 * ApplicationsApp tests (Wave 9 C2). /api/admin/applications is mocked.
 * Asserts: the status chips are the 5 REAL statuses (lib/applications/state.ts,
 * NOT the stale union in lib/auth/types.ts) and drive ?status=; rows link to
 * the detail; loading/empty/error states.
 */

const h = vi.hoisted(() => ({
  fail: false,
  applications: [] as Array<Record<string, unknown>>,
  total: 0,
  calls: [] as string[],
}));

const originalFetch = globalThis.fetch;

import { ApplicationsApp } from "./ApplicationsApp";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  h.fail = false;
  h.applications = [];
  h.total = 0;
  h.calls = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/admin/applications")) {
      h.calls.push(url);
      if (h.fail) return jsonResponse({ error: "boom" }, 500);
      return jsonResponse({ applications: h.applications, page: 1, pageSize: 20, total: h.total });
    }
    return jsonResponse({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const APP = {
  id: "app1",
  userId: "u2",
  status: "WITNESSED",
  kycStatus: "PENDING",
  reviewNote: null,
  name: "Citizen One",
  domicileCity: "Lisbon",
  hostCountry: "Portugal",
  motto: "Onward",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  user: { email: "citizen@ex.org", name: "Citizen One" },
};

describe("ApplicationsApp", () => {
  it("renders the list with a detail link", async () => {
    h.applications = [APP];
    h.total = 1;
    render(<ApplicationsApp />);
    await waitFor(() => expect(screen.getByText("citizen@ex.org")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /citizen@ex\.org/i })).toHaveAttribute(
      "href",
      "/admin/applications/app1",
    );
    // the status renders in the row (once as the filter chip, once in the ledger cell)
    expect(screen.getAllByText("WITNESSED").length).toBeGreaterThan(1);
  });

  it("renders the 5 REAL status chips and drives ?status=", async () => {
    h.applications = [APP];
    h.total = 1;
    render(<ApplicationsApp />);
    await waitFor(() => expect(screen.getByText("citizen@ex.org")).toBeInTheDocument());
    for (const s of ["DRAFT", "ATTESTED", "OATH_ACCEPTED", "WITNESSED", "SEALED"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${s}$`) })).toBeInTheDocument();
    }
    // the stale union's SUBMITTED/MINTED never appear
    expect(screen.queryByRole("button", { name: /^SUBMITTED$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^MINTED$/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^SEALED$/ }));
    await waitFor(() => expect(h.calls.some((u) => u.includes("status=SEALED"))).toBe(true));
  });

  it("shows loading then empty state", async () => {
    render(<ApplicationsApp />);
    expect(screen.getAllByTestId("skeleton-line").length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByTestId("ledger-empty")).toBeInTheDocument());
  });

  it("shows error + RETRY that refetches", async () => {
    h.fail = true;
    render(<ApplicationsApp />);
    await waitFor(() => expect(screen.getByTestId("applications-error")).toBeInTheDocument());
    h.fail = false;
    h.applications = [APP];
    h.total = 1;
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(screen.getByText("citizen@ex.org")).toBeInTheDocument());
  });

  it("offers a keyboard-focusable CSV download anchor to the audited export route (B3)", async () => {
    render(<ApplicationsApp />);
    const link = await screen.findByTestId("download-applications-csv");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/api/admin/export/applications");
    expect(link).toHaveAttribute("download");
  });
});
