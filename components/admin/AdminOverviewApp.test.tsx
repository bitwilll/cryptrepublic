// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

/**
 * AdminOverviewApp tests (Wave 9 C1). /api/admin/overview is mocked. Asserts
 * the Wave-7 state matrix (loading skeleton / error + RETRY that refetches) +
 * the stat tiles and the recent-audit ledger (rows + empty state).
 */

const h = vi.hoisted(() => ({
  fail: false,
  recentAudit: [] as Array<Record<string, unknown>>,
}));

const originalFetch = globalThis.fetch;

import { AdminOverviewApp } from "./AdminOverviewApp";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const OVERVIEW = () => ({
  users: { total: 42, suspended: 3, admins: 2 },
  applications: { DRAFT: 5, ATTESTED: 1, OATH_ACCEPTED: 0, WITNESSED: 2, SEALED: 7 },
  content: {
    assets: 6,
    embassies: 4,
    census: 12,
    allocations: 5,
    constitution: 9,
    proposalContent: 3,
    comments: 11,
  },
  flags: 1,
  recentAudit: h.recentAudit,
});

beforeEach(() => {
  h.fail = false;
  h.recentAudit = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/admin/overview")) {
      if (h.fail) return jsonResponse({ error: "boom" }, 500);
      return jsonResponse(OVERVIEW());
    }
    return jsonResponse({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const AUDIT_ROW = {
  id: "a1",
  actorUserId: "u1",
  actorLabel: "admin:root@cryptrepublic.local",
  action: "user.suspend",
  targetType: "USER",
  targetId: "u2",
  beforeJson: JSON.stringify({ suspendedAt: null }),
  afterJson: JSON.stringify({ suspendedAt: "2026-07-02T00:00:00.000Z" }),
  ipHash: null,
  userAgent: "vitest",
  createdAt: "2026-07-02T10:00:00.000Z",
};

describe("AdminOverviewApp", () => {
  it("shows a loading skeleton first, then the stat tiles from the API", async () => {
    render(<AdminOverviewApp />);
    expect(screen.getAllByTestId("skeleton-line").length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByTestId("overview-users")).toBeInTheDocument());
    expect(screen.getByTestId("overview-users")).toHaveTextContent("42");
    expect(screen.getByTestId("overview-users")).toHaveTextContent(/suspended/i);
    expect(screen.getByTestId("overview-users")).toHaveTextContent("3");
    expect(screen.getByTestId("overview-applications")).toHaveTextContent("SEALED");
    expect(screen.getByTestId("overview-applications")).toHaveTextContent("7");
    expect(screen.getByTestId("overview-content")).toHaveTextContent("6");
    expect(screen.getByTestId("overview-flags")).toHaveTextContent("1");
  });

  it("renders an in-voice error with a RETRY that refetches", async () => {
    h.fail = true;
    render(<AdminOverviewApp />);
    await waitFor(() => expect(screen.getByTestId("overview-error")).toBeInTheDocument());
    h.fail = false;
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(screen.getByTestId("overview-users")).toBeInTheDocument());
  });

  it("renders the recent-audit ledger rows", async () => {
    h.recentAudit = [AUDIT_ROW];
    render(<AdminOverviewApp />);
    await waitFor(() => expect(screen.getByText("user.suspend")).toBeInTheDocument());
    expect(screen.getByText(/admin:root@cryptrepublic\.local/)).toBeInTheDocument();
  });

  it("renders an empty state when there are no audit rows", async () => {
    h.recentAudit = [];
    render(<AdminOverviewApp />);
    await waitFor(() => expect(screen.getByTestId("overview-users")).toBeInTheDocument());
    expect(screen.getByTestId("ledger-empty")).toBeInTheDocument();
  });

  it("C1: the four stat tiles are real keyboard-focusable Links (not onClick divs) → their sections", async () => {
    render(<AdminOverviewApp />);
    await waitFor(() => expect(screen.getByTestId("overview-users")).toBeInTheDocument());
    const cases: Array<[string, string, RegExp]> = [
      ["overview-users", "/admin/users", /users/i],
      ["overview-applications", "/admin/applications", /applications/i],
      ["overview-content", "/admin/content", /content/i],
      ["overview-flags", "/admin/flags", /flags/i],
    ];
    for (const [testid, href, labelRe] of cases) {
      const tile = screen.getByTestId(testid);
      expect(tile.tagName, testid).toBe("A"); // native anchor from next/link — focusable
      expect(tile).toHaveAttribute("href", href);
      expect(tile.getAttribute("aria-label")).toMatch(labelRe);
    }
  });
});
