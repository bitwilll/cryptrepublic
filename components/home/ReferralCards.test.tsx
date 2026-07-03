// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * ReferralCards (Wave 12 D2). /api/citizen/referrals + /api/referrals fetches
 * and useCitizen are mocked. Asserts: the read-only trust score + token
 * balance render; the refer form POSTs {referredEmail}, clears + refetches on
 * success; the button is disabled + the reason shows when canCreateReferral is
 * false; a non-citizen sees no refer form; a POST error surfaces as an alert.
 */

const h = vi.hoisted(() => ({
  isCitizen: true,
  payload: {
    trustScore: 62,
    trustBreakdown: { computed: 62, adminAdjustment: 0, signals: {} },
    referralTokenBalance: 4,
    canCreateReferral: true,
    createReason: null as string | null,
    referrals: [
      { referredEmail: "a@ex.org", whenTokenConsumed: false, createdAt: "", becameCitizen: true },
      { referredEmail: "b@ex.org", whenTokenConsumed: true, createdAt: "", becameCitizen: false },
    ],
  },
  postOk: true,
  postError: "You have already referred this person.",
}));

vi.mock("@/components/shell/SessionCitizenProvider", () => ({
  useCitizen: () => ({
    isCitizen: h.isCitizen,
    address: null,
    tokenId: null,
    loading: false,
    refresh: () => {},
  }),
}));

const originalFetch = globalThis.fetch;
import { ReferralCards } from "./ReferralCards";

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  h.isCitizen = true;
  h.postOk = true;
  h.payload.canCreateReferral = true;
  h.payload.createReason = null;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/citizen/referrals")) return jsonRes(h.payload);
    if (url.includes("/api/referrals") && init?.method === "POST") {
      return h.postOk ? jsonRes({ ok: true }) : jsonRes({ error: h.postError }, 400);
    }
    return jsonRes({});
  }) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("ReferralCards", () => {
  it("renders the read-only trust score + token balance", async () => {
    render(<ReferralCards />);
    await waitFor(() => expect(screen.getByTestId("referral-trust-score")).toBeInTheDocument());
    expect(screen.getByTestId("referral-trust-score")).toHaveTextContent("62");
    expect(screen.getByTestId("referral-token-balance")).toHaveTextContent("4");
  });

  it("the refer form POSTs {referredEmail} and clears on success", async () => {
    render(<ReferralCards />);
    await waitFor(() => expect(screen.getByTestId("refer-email")).toBeInTheDocument());
    fireEvent.change(screen.getByTestId("refer-email"), { target: { value: "new@ex.org" } });
    fireEvent.click(screen.getByTestId("refer-submit"));
    await waitFor(() => expect(screen.getByTestId("refer-success")).toBeInTheDocument());
    const post = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => String(c[0]).includes("/api/referrals") && c[1]?.method === "POST",
    );
    expect(JSON.parse(post![1].body)).toEqual({ referredEmail: "new@ex.org" });
    expect((screen.getByTestId("refer-email") as HTMLInputElement).value).toBe("");
  });

  it("disables Refer + shows the reason when canCreateReferral is false", async () => {
    h.payload.canCreateReferral = false;
    h.payload.createReason =
      "You need a referral token or a trust score above 50 to refer someone.";
    render(<ReferralCards />);
    await waitFor(() => expect(screen.getByTestId("refer-submit")).toBeInTheDocument());
    expect(screen.getByTestId("refer-submit")).toBeDisabled();
    expect(screen.getByText(/referral token or a trust score/i)).toBeInTheDocument();
  });

  it("a non-citizen sees no refer form (only citizens refer)", async () => {
    h.isCitizen = false;
    render(<ReferralCards />);
    await waitFor(() => expect(screen.getByTestId("referral-tokens-card")).toBeInTheDocument());
    expect(screen.queryByTestId("refer-form")).not.toBeInTheDocument();
    expect(screen.getByText(/only citizens can refer/i)).toBeInTheDocument();
  });

  it("a POST error surfaces as an alert (no false success)", async () => {
    h.postOk = false;
    render(<ReferralCards />);
    await waitFor(() => expect(screen.getByTestId("refer-email")).toBeInTheDocument());
    fireEvent.change(screen.getByTestId("refer-email"), { target: { value: "dup@ex.org" } });
    fireEvent.click(screen.getByTestId("refer-submit"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/already referred/i));
    expect(screen.queryByTestId("refer-success")).not.toBeInTheDocument();
  });

  it("full mode renders the who-I-referred list with became-citizen badges", async () => {
    render(<ReferralCards full />);
    await waitFor(() => expect(screen.getByTestId("referral-list")).toBeInTheDocument());
    const rows = screen.getAllByTestId("referral-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("a@ex.org");
    expect(rows[0]).toHaveTextContent(/citizen/i);
    expect(rows[1]).toHaveTextContent(/pending/i);
  });
});
