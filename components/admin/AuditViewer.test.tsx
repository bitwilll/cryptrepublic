// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

/**
 * AuditViewer tests (Wave 9 C1). /api/admin/audit is mocked. Asserts:
 * - rows render (newest-first list from the API)
 * - the action filter refetches with the ?action= query param
 * - expanding a row shows the parsed before/after JSON
 * - pagination buttons drive ?page=
 * - loading / empty / error+retry state matrix
 */

const h = vi.hoisted(() => ({
  fail: false,
  rows: [] as Array<Record<string, unknown>>,
  total: 0,
  calls: [] as string[],
}));

const originalFetch = globalThis.fetch;

import { AuditViewer } from "./AuditViewer";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  h.fail = false;
  h.rows = [];
  h.total = 0;
  h.calls = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/admin/audit")) {
      h.calls.push(url);
      if (h.fail) return jsonResponse({ error: "boom" }, 500);
      const page = Number(new URL(url, "http://x").searchParams.get("page") ?? "1");
      return jsonResponse({ rows: h.rows, page, pageSize: 20, total: h.total });
    }
    return jsonResponse({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const ROW = {
  id: "a1",
  actorUserId: "u1",
  actorLabel: "admin:root@cryptrepublic.local",
  action: "user.kyc.set",
  targetType: "USER",
  targetId: "u2",
  beforeJson: JSON.stringify({ kycStatus: "PENDING" }),
  afterJson: JSON.stringify({ kycStatus: "APPROVED" }),
  ipHash: null,
  userAgent: "vitest",
  createdAt: "2026-07-02T10:00:00.000Z",
};

describe("AuditViewer", () => {
  it("renders audit rows from the API", async () => {
    h.rows = [ROW];
    h.total = 1;
    render(<AuditViewer />);
    await waitFor(() => expect(screen.getByTestId("audit-row")).toBeInTheDocument());
    expect(screen.getByTestId("audit-row")).toHaveTextContent("user.kyc.set");
    expect(screen.getByTestId("audit-row")).toHaveTextContent(/admin:root@cryptrepublic\.local/);
  });

  it("refetches with the action filter as a query param", async () => {
    h.rows = [ROW];
    h.total = 1;
    render(<AuditViewer />);
    await waitFor(() => expect(screen.getByTestId("audit-row")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/action/i), { target: { value: "user.suspend" } });
    fireEvent.click(screen.getByRole("button", { name: /apply filters/i }));
    await waitFor(() => expect(h.calls.some((u) => u.includes("action=user.suspend"))).toBe(true));
  });

  it("expands a row to the parsed before/after JSON", async () => {
    h.rows = [ROW];
    h.total = 1;
    render(<AuditViewer />);
    await waitFor(() => expect(screen.getByTestId("audit-row")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /user\.kyc\.set/i }));
    await waitFor(() => expect(screen.getByTestId("audit-before")).toBeInTheDocument());
    expect(screen.getByTestId("audit-before")).toHaveTextContent(/"kycStatus":\s*"PENDING"/);
    expect(screen.getByTestId("audit-after")).toHaveTextContent(/"kycStatus":\s*"APPROVED"/);
  });

  it("drives ?page= with the pagination buttons (prev disabled on page 1)", async () => {
    h.rows = [ROW];
    h.total = 45; // 3 pages at pageSize 20
    render(<AuditViewer />);
    await waitFor(() => expect(screen.getByTestId("audit-row")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /previous page/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /next page/i }));
    await waitFor(() => expect(h.calls.some((u) => u.includes("page=2"))).toBe(true));
  });

  it("shows an empty state when there are no rows", async () => {
    h.rows = [];
    h.total = 0;
    render(<AuditViewer />);
    await waitFor(() => expect(screen.getByTestId("audit-empty")).toBeInTheDocument());
  });

  it("shows an in-voice error with RETRY when the fetch fails", async () => {
    h.fail = true;
    render(<AuditViewer />);
    await waitFor(() => expect(screen.getByTestId("audit-error")).toBeInTheDocument());
    h.fail = false;
    h.rows = [ROW];
    h.total = 1;
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(screen.getByTestId("audit-row")).toBeInTheDocument());
  });
});
