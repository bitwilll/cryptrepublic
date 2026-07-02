// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

/**
 * UsersApp tests (Wave 9 C2). /api/admin/users is mocked. Asserts:
 * - the list renders allowlisted fields and links to /admin/users/[id]
 * - the search box drives ?q=
 * - suspended users show the SUSPENDED tag
 * - loading / empty / error+retry state matrix
 */

const h = vi.hoisted(() => ({
  fail: false,
  users: [] as Array<Record<string, unknown>>,
  total: 0,
  calls: [] as string[],
}));

const originalFetch = globalThis.fetch;

import { UsersApp } from "./UsersApp";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  h.fail = false;
  h.users = [];
  h.total = 0;
  h.calls = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/admin/users")) {
      h.calls.push(url);
      if (h.fail) return jsonResponse({ error: "boom" }, 500);
      return jsonResponse({ users: h.users, page: 1, pageSize: 20, total: h.total });
    }
    return jsonResponse({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const USER = {
  id: "u1",
  email: "citizen@ex.org",
  name: "Citizen One",
  role: "USER",
  kycStatus: "PENDING",
  suspendedAt: null as string | null,
  lockedUntil: null,
  failedLoginCount: 0,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  sessionCount: 2,
};

describe("UsersApp", () => {
  it("renders the user list with a detail link", async () => {
    h.users = [USER];
    h.total = 1;
    render(<UsersApp />);
    await waitFor(() => expect(screen.getByText("citizen@ex.org")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /citizen@ex\.org/i })).toHaveAttribute(
      "href",
      "/admin/users/u1",
    );
    expect(screen.getByText("PENDING")).toBeInTheDocument();
  });

  it("drives ?q= from the search box", async () => {
    h.users = [USER];
    h.total = 1;
    render(<UsersApp />);
    await waitFor(() => expect(screen.getByText("citizen@ex.org")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: "citizen" } });
    fireEvent.click(screen.getByRole("button", { name: /^search$/i }));
    await waitFor(() => expect(h.calls.some((u) => u.includes("q=citizen"))).toBe(true));
  });

  it("shows the SUSPENDED tag for suspended users", async () => {
    h.users = [{ ...USER, suspendedAt: "2026-07-02T00:00:00.000Z" }];
    h.total = 1;
    render(<UsersApp />);
    await waitFor(() => expect(screen.getByText(/suspended/i)).toBeInTheDocument());
  });

  it("shows loading first, then an empty state when there are no users", async () => {
    render(<UsersApp />);
    expect(screen.getAllByTestId("skeleton-line").length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByTestId("ledger-empty")).toBeInTheDocument());
  });

  it("shows an in-voice error with RETRY that refetches", async () => {
    h.fail = true;
    render(<UsersApp />);
    await waitFor(() => expect(screen.getByTestId("users-error")).toBeInTheDocument());
    h.fail = false;
    h.users = [USER];
    h.total = 1;
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(screen.getByText("citizen@ex.org")).toBeInTheDocument());
  });

  it("offers a keyboard-focusable CSV download anchor to the audited export route (B3)", async () => {
    render(<UsersApp />);
    const link = await screen.findByTestId("download-users-csv");
    expect(link.tagName).toBe("A"); // a real anchor — keyboard-focusable, no onClick div
    expect(link).toHaveAttribute("href", "/api/admin/export/users");
    expect(link).toHaveAttribute("download");
  });
});
