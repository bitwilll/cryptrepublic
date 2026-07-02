// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

/**
 * AdminOverviewApp tests (Wave 9 C1). /api/admin/overview is mocked. Asserts
 * the Wave-7 state matrix (loading skeleton / error + RETRY that refetches) +
 * the stat tiles and the recent-audit ledger (rows + empty state).
 */

const h = vi.hoisted(() => ({
  fail: false,
  statsFail: false,
  citizens: 12 as number | null,
  chainAvailable: true,
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

const STATS = () => ({
  applicationsByStatus: [
    { status: "DRAFT", count: 5 },
    { status: "ATTESTED", count: 1 },
    { status: "OATH_ACCEPTED", count: 0 },
    { status: "WITNESSED", count: 2 },
    { status: "SEALED", count: 7 },
  ],
  counts: { users: 42, citizens: h.citizens, embassies: 4 },
  chainAvailable: h.chainAvailable,
  auditActivity: [
    { day: "2026-07-01", count: 3 },
    { day: "2026-07-02", count: 1 },
  ],
  censusByCity: [
    { code: "LIS", name: "Lisbon", count: 1204 },
    { code: "SIN", name: "Singapore", count: 986 },
  ],
  censusSource: "seeded" as const,
});

beforeEach(() => {
  h.fail = false;
  h.statsFail = false;
  h.citizens = 12;
  h.chainAvailable = true;
  h.recentAudit = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/admin/stats")) {
      if (h.statsFail) return jsonResponse({ error: "boom" }, 500);
      return jsonResponse(STATS());
    }
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

  it("C2: 'Republic at a glance' renders CountTiles + the three charts with accessible tables", async () => {
    render(<AdminOverviewApp />);
    await waitFor(() => expect(screen.getByTestId("overview-glance")).toBeInTheDocument());
    // CountTiles carry the real numbers.
    expect(screen.getByTestId("glance-users")).toHaveTextContent("42");
    expect(screen.getByTestId("glance-citizens")).toHaveTextContent("12");
    expect(screen.getByTestId("glance-embassies")).toHaveTextContent("4");
    // The charts' visually-hidden data tables list the real values.
    const appsTable = screen.getByTestId("apps-chart-table");
    expect(appsTable).toHaveTextContent("SEALED");
    expect(appsTable).toHaveTextContent("7");
    expect(screen.getByTestId("audit-chart-table")).toHaveTextContent("2026-07-01");
    expect(screen.getByTestId("census-chart-table")).toHaveTextContent("LIS");
  });

  it("C2 HONESTY: chain unavailable → citizens tile shows '—' + note, never a fake number", async () => {
    h.citizens = null;
    h.chainAvailable = false;
    render(<AdminOverviewApp />);
    await waitFor(() => expect(screen.getByTestId("glance-citizens")).toBeInTheDocument());
    expect(screen.getByTestId("glance-citizens")).toHaveTextContent("—");
    expect(screen.getByTestId("glance-citizens-unavailable")).toHaveTextContent(
      /chain unavailable/i,
    );
  });

  it("C2 HONESTY: seeded census chart carries the SEEDED/not-live wording (visible + accessible)", async () => {
    render(<AdminOverviewApp />);
    await waitFor(() => expect(screen.getByTestId("census-chart-title")).toBeInTheDocument());
    expect(screen.getByTestId("census-chart-title")).toHaveTextContent(/SEEDED/);
    expect(screen.getByTestId("census-chart-title")).toHaveTextContent(/not live/i);
    expect(screen.getByTestId("census-chart-table")).toHaveTextContent(/SEEDED/);
  });

  it("C2: a stats fetch error renders its own retry card; the stat tiles stay up (independent cards)", async () => {
    h.statsFail = true;
    render(<AdminOverviewApp />);
    await waitFor(() => expect(screen.getByTestId("stats-error")).toBeInTheDocument());
    expect(screen.getByTestId("overview-users")).toBeInTheDocument();
    h.statsFail = false;
    const retry = within(screen.getByTestId("stats-error")).getByRole("button", {
      name: /retry/i,
    });
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByTestId("overview-glance")).toBeInTheDocument());
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
