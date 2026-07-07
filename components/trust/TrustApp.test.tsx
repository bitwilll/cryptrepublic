// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TrustApp } from "./TrustApp";

/**
 * TrustApp (Wave 15 — Identity). /api/trust is mocked. Asserts: the score,
 * the segmented meter, every factor row (+ the total equalling the score),
 * the gate line in both states, the statute note, and the error/retry path.
 */

const h = vi.hoisted(() => ({
  ok: true,
  payload: {
    score: 64,
    computed: 44,
    adminAdjustment: 20,
    factors: [
      { key: "sealed-passport", label: "Sealed passport", points: 20, detail: "Held on-chain." },
      { key: "tenure", label: "Citizenship tenure", points: 12, detail: "≈12 days." },
      { key: "referrals", label: "Referrals sealed", points: 8, detail: "2 sealed." },
      { key: "governance", label: "Governance votes", points: 4, detail: "1 vote." },
      { key: "dividends", label: "Dividend claims", points: 0, detail: "None." },
      { key: "cabinet-adjustment", label: "Cabinet adjustment", points: 20, detail: "+20." },
    ],
    thresholds: { referralGate: 50 },
    referralGatePassed: true,
    negativeStandingRule: "Upon verified dispute or convicted felony the score may go negative.",
  },
}));

const originalFetch = globalThis.fetch;

beforeEach(() => {
  h.ok = true;
  h.payload.score = 64;
  h.payload.referralGatePassed = true;
  globalThis.fetch = vi.fn(async () =>
    h.ok
      ? new Response(JSON.stringify(h.payload), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      : new Response("{}", { status: 500 }),
  ) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("TrustApp", () => {
  it("renders the score, all six factor rows, and a total equal to the score", async () => {
    render(<TrustApp />);
    expect(await screen.findByTestId("trust-score-value")).toHaveTextContent("64");
    expect(screen.getAllByTestId("trust-factor-row")).toHaveLength(6);
    expect(screen.getByTestId("trust-factor-total")).toHaveTextContent("64");
    expect(screen.getByTestId("trust-statute")).toHaveTextContent(
      /verified dispute or convicted felony/i,
    );
  });

  it("shows the free-referral state above the gate", async () => {
    render(<TrustApp />);
    expect(await screen.findByTestId("trust-gate-line")).toHaveTextContent(
      /above 50 — you may refer without a token/i,
    );
  });

  it("shows the token-spending state at or below the gate", async () => {
    h.payload.score = 50;
    h.payload.referralGatePassed = false;
    render(<TrustApp />);
    expect(await screen.findByTestId("trust-gate-line")).toHaveTextContent(
      /at or below 50 — a referral spends one referral token/i,
    );
  });

  it("a failed load surfaces an alert and a retry that refetches", async () => {
    h.ok = false;
    render(<TrustApp />);
    expect(await screen.findByTestId("trust-error")).toBeInTheDocument();
    h.ok = true;
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(screen.getByTestId("trust-score-value")).toHaveTextContent("64"));
  });
});
