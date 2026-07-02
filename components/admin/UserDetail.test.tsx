// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

/**
 * UserDetail tests (Wave 9 C2). /api/admin/users/[id] + the three mutation
 * routes are mocked. Asserts:
 * - SUSPEND posts { suspended: true } AFTER the modal confirm and refreshes
 * - the self-user case renders a DISABLED suspend button with the note
 * - per-row session REVOKE posts { sessionId }; REVOKE ALL posts { all: true }
 * - kycStatus select + APPLY posts { kycStatus }
 * - there is NO role form control anywhere (constraint #2 — no promotion path)
 * - the rendered output never contains passwordHash/tokenHash text
 */

const h = vi.hoisted(() => ({
  suspendedAt: null as string | null,
  posts: [] as Array<{ url: string; body: Record<string, unknown> }>,
  detailFetches: 0,
}));

const originalFetch = globalThis.fetch;

import { UserDetail } from "./UserDetail";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const DETAIL = () => ({
  user: {
    id: "u2",
    email: "citizen@ex.org",
    name: "Citizen One",
    role: "USER",
    kycStatus: "PENDING",
    suspendedAt: h.suspendedAt,
    lockedUntil: null,
    failedLoginCount: 0,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  },
  sessions: [
    {
      id: "s1",
      userAgent: "vitest-agent",
      ipHash: "ip_abc",
      createdAt: "2026-07-01T00:00:00.000Z",
      expiresAt: "2026-07-31T00:00:00.000Z",
    },
  ],
  linkedWallets: [
    { address: "0x00000000000000000000000000000000000000A1", chain: "EVM", verifiedAt: null },
  ],
  application: null,
});

beforeEach(() => {
  h.suspendedAt = null;
  h.posts = [];
  h.detailFetches = 0;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST") {
      h.posts.push({ url, body: init.body ? JSON.parse(String(init.body)) : {} });
      return jsonResponse({ ok: true });
    }
    if (url.includes("/api/admin/users/u2")) {
      h.detailFetches += 1;
      return jsonResponse(DETAIL());
    }
    return jsonResponse({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("UserDetail", () => {
  it("suspends via modal confirm: POSTs { suspended: true } then refreshes", async () => {
    render(<UserDetail userId="u2" selfUserId="admin-1" />);
    await waitFor(() => expect(screen.getByText("citizen@ex.org")).toBeInTheDocument());
    const before = h.detailFetches;
    fireEvent.click(screen.getByRole("button", { name: /^suspend$/i }));
    // in-voice confirm copy: suspension revokes all sessions
    expect(screen.getByRole("dialog")).toHaveTextContent(/revokes all sessions/i);
    fireEvent.click(screen.getByRole("button", { name: /confirm suspension/i }));
    await waitFor(() => expect(h.posts.length).toBe(1));
    expect(h.posts[0].url).toContain("/api/admin/users/u2/suspend");
    expect(h.posts[0].body).toEqual({ suspended: true });
    await waitFor(() => expect(h.detailFetches).toBeGreaterThan(before));
  });

  it("renders UNSUSPEND for a suspended user and posts { suspended: false }", async () => {
    h.suspendedAt = "2026-07-02T00:00:00.000Z";
    render(<UserDetail userId="u2" selfUserId="admin-1" />);
    await waitFor(() => expect(screen.getByText("citizen@ex.org")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^unsuspend$/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    await waitFor(() => expect(h.posts.length).toBe(1));
    expect(h.posts[0].body).toEqual({ suspended: false });
  });

  it("disables suspend with a note when the target is the signed-in admin", async () => {
    render(<UserDetail userId="u2" selfUserId="u2" />);
    await waitFor(() => expect(screen.getByText("citizen@ex.org")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /^suspend$/i })).toBeDisabled();
    expect(screen.getByText(/cannot suspend your own account/i)).toBeInTheDocument();
  });

  it("revokes a single session and all sessions", async () => {
    render(<UserDetail userId="u2" selfUserId="admin-1" />);
    await waitFor(() => expect(screen.getByText("vitest-agent")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^revoke$/i }));
    await waitFor(() => expect(h.posts.length).toBe(1));
    expect(h.posts[0].url).toContain("/api/admin/users/u2/sessions/revoke");
    expect(h.posts[0].body).toEqual({ sessionId: "s1" });
    fireEvent.click(screen.getByRole("button", { name: /revoke all/i }));
    await waitFor(() => expect(h.posts.length).toBe(2));
    expect(h.posts[1].body).toEqual({ all: true });
  });

  it("applies a kycStatus via the select", async () => {
    render(<UserDetail userId="u2" selfUserId="admin-1" />);
    await waitFor(() => expect(screen.getByText("citizen@ex.org")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/kyc status/i), { target: { value: "APPROVED" } });
    fireEvent.click(screen.getByRole("button", { name: /apply kyc/i }));
    await waitFor(() => expect(h.posts.length).toBe(1));
    expect(h.posts[0].url).toContain("/api/admin/users/u2/kyc");
    expect(h.posts[0].body).toEqual({ kycStatus: "APPROVED" });
  });

  it("offers NO role form control (no promotion path) and leaks no secret text", async () => {
    render(<UserDetail userId="u2" selfUserId="admin-1" />);
    await waitFor(() => expect(screen.getByText("citizen@ex.org")).toBeInTheDocument());
    // the ONLY select is the KYC one; no control is labeled "role"
    expect(screen.queryByLabelText(/role/i)).not.toBeInTheDocument();
    const selects = screen.getAllByRole("combobox");
    expect(selects).toHaveLength(1);
    expect(selects[0]).toHaveAccessibleName(/kyc status/i);
    expect(document.body.textContent).not.toMatch(/passwordHash|tokenHash/i);
  });

  it("shows error + RETRY when the detail fetch fails", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ error: "boom" }, 500),
    ) as unknown as typeof fetch;
    render(<UserDetail userId="u2" selfUserId="admin-1" />);
    await waitFor(() => expect(screen.getByTestId("user-detail-error")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});
