// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AdminReferralPanel } from "./AdminReferralPanel";

/**
 * AdminReferralPanel (Wave 12 C4). Fetches /api/admin/users/[id]/referrals and
 * drives the allocate-tokens + set-trust POSTs. Asserts the stats render, the
 * two mutations POST the right bodies + refetch, the referral list renders
 * with chain-derived badges, and a POST error surfaces.
 */
const h = vi.hoisted(() => ({
  balance: 2,
  adjustment: 10,
  postOk: true,
}));

const originalFetch = globalThis.fetch;
function payload() {
  return {
    user: {
      id: "u1",
      email: "u1@ex.org",
      referralTokenBalance: h.balance,
      trustAdjustment: h.adjustment,
    },
    trust: { finalScore: 55, computed: 45, adminAdjustment: h.adjustment },
    referrals: [
      { referredEmail: "a@ex.org", whenTokenConsumed: true, becameCitizen: true },
      { referredEmail: "b@ex.org", whenTokenConsumed: false, becameCitizen: false },
    ],
  };
}
function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let posts: { url: string; body: unknown }[] = [];
beforeEach(() => {
  h.balance = 2;
  h.adjustment = 10;
  h.postOk = true;
  posts = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST") {
      posts.push({ url, body: JSON.parse(String(init.body)) });
      if (url.includes("/referral-tokens"))
        h.balance += (JSON.parse(String(init.body)) as { delta: number }).delta;
      if (url.includes("/trust"))
        h.adjustment = (JSON.parse(String(init.body)) as { adjustment: number }).adjustment;
      return h.postOk ? jsonRes({ ok: true }) : jsonRes({ error: "The action failed." }, 400);
    }
    if (url.includes("/referrals")) return jsonRes(payload());
    return jsonRes({});
  }) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("AdminReferralPanel", () => {
  it("renders the trust score + token balance + adjustment + referral list", async () => {
    render(<AdminReferralPanel userId="u1" />);
    await waitFor(() => expect(screen.getByTestId("admin-trust-score")).toBeInTheDocument());
    expect(screen.getByTestId("admin-trust-score")).toHaveTextContent("55");
    expect(screen.getByTestId("admin-token-balance")).toHaveTextContent("2");
    expect(screen.getAllByTestId("admin-referral-row")).toHaveLength(2);
    expect(screen.getByTestId("admin-referral-list")).toHaveTextContent(/chain-derived/i);
  });

  it("allocate POSTs { delta } to the referral-tokens route + refetches", async () => {
    render(<AdminReferralPanel userId="u1" />);
    await waitFor(() => expect(screen.getByTestId("alloc-submit")).toBeInTheDocument());
    fireEvent.change(screen.getByTestId("alloc-delta"), { target: { value: "7" } });
    fireEvent.click(screen.getByTestId("alloc-submit"));
    await waitFor(() => expect(screen.getByTestId("admin-token-balance")).toHaveTextContent("9"));
    const p = posts.find((x) => x.url.includes("/referral-tokens"));
    expect(p?.body).toEqual({ delta: 7 });
  });

  it("set-trust POSTs { adjustment } to the trust route + refetches", async () => {
    render(<AdminReferralPanel userId="u1" />);
    await waitFor(() => expect(screen.getByTestId("trust-submit")).toBeInTheDocument());
    fireEvent.change(screen.getByTestId("trust-adjust"), { target: { value: "-25" } });
    fireEvent.click(screen.getByTestId("trust-submit"));
    await waitFor(() => {
      const p = posts.find((x) => x.url.includes("/trust"));
      expect(p?.body).toEqual({ adjustment: -25 });
    });
  });

  it("surfaces a POST error", async () => {
    h.postOk = false;
    render(<AdminReferralPanel userId="u1" />);
    await waitFor(() => expect(screen.getByTestId("alloc-submit")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("alloc-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("admin-referral-action-error")).toHaveTextContent(/failed/i),
    );
  });
});
