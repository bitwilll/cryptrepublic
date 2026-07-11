// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TrustApp } from "./TrustApp";

/**
 * TrustApp (Wave 15 — Identity; v2 Wave 17). /api/trust is mocked. Asserts:
 * the score, the segmented meter with BOTH gold gate ticks (50 + 65), all
 * EIGHT factor rows (+ the total equalling the score), both gate lines in
 * both states, the NEGATIVE STANDING render (banner + empty meter + negative
 * figure), the statute note, and the error/retry path.
 */

const factors = () => [
  { key: "sealed-passport", label: "Sealed passport", points: 20, detail: "Held on-chain." },
  { key: "tenure", label: "Citizenship tenure", points: 12, detail: "≈12 days." },
  { key: "referrals", label: "Referrals sealed", points: 8, detail: "2 sealed." },
  { key: "governance", label: "Governance votes", points: 4, detail: "1 vote." },
  { key: "dividends", label: "Dividend claims", points: 0, detail: "None." },
  { key: "civic-activity", label: "Civic activity", points: 3, detail: "3 civic acts." },
  { key: "penal-record", label: "Penal record", points: -3, detail: "1 verified report." },
  { key: "cabinet-adjustment", label: "Cabinet adjustment", points: 20, detail: "+20." },
];

const h = vi.hoisted(() => ({
  ok: true,
  payload: {
    score: 64,
    computed: 47,
    adminAdjustment: 20,
    factors: [] as ReturnType<typeof factors>,
    thresholds: { referralGate: 50, referralLinkGate: 65 },
    referralGatePassed: true,
    referralLinkGatePassed: false,
    negativeStanding: false,
    negativeStandingRule: "Upon verified dispute or convicted felony the score may go negative.",
  },
}));

const originalFetch = globalThis.fetch;

beforeEach(() => {
  h.ok = true;
  h.payload.score = 64;
  h.payload.factors = factors();
  h.payload.referralGatePassed = true;
  h.payload.referralLinkGatePassed = false;
  h.payload.negativeStanding = false;
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
  it("renders the score, all EIGHT factor rows, and a total equal to the score", async () => {
    render(<TrustApp />);
    expect(await screen.findByTestId("trust-score-value")).toHaveTextContent("64");
    expect(screen.getAllByTestId("trust-factor-row")).toHaveLength(8);
    expect(screen.getByTestId("trust-factor-total")).toHaveTextContent("64");
    expect(screen.getByText("Penal record")).toBeInTheDocument();
    expect(screen.getByText("Civic activity")).toBeInTheDocument();
    expect(screen.getByTestId("trust-statute")).toHaveTextContent(
      /verified dispute or convicted felony/i,
    );
  });

  it("negative penal points render in the error text tone (#8b3a3a via pointsNegative)", async () => {
    render(<TrustApp />);
    await screen.findByTestId("trust-score-value");
    const penalRow = screen.getByText("Penal record").closest("tr")!;
    const cell = penalRow.querySelector("td:last-child")!;
    expect(cell.textContent).toBe("-3");
    expect(cell.className).toMatch(/pointsNegative/);
  });

  it("marks BOTH gold gate ticks on the meter and labels them (50 + 65)", async () => {
    render(<TrustApp />);
    const meter = await screen.findByTestId("trust-meter");
    const gated = meter.querySelectorAll("[class*='segmentGate']");
    expect(gated).toHaveLength(2); // segment 10 (50) and segment 13 (65)
    expect(screen.getByText(/50 — referral gate/)).toBeInTheDocument();
    expect(screen.getByText(/65 — referral links/)).toBeInTheDocument();
    expect(meter.getAttribute("aria-label")).toMatch(/referral links unlock above 65/i);
  });

  it("shows the free-referral state above the gate and the locked link-gate below 65", async () => {
    render(<TrustApp />);
    expect(await screen.findByTestId("trust-gate-line")).toHaveTextContent(
      /above 50 — you may refer without a token/i,
    );
    expect(screen.getByTestId("trust-linkgate-line")).toHaveTextContent(
      /at or below 65 — shareable referral links stay locked/i,
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

  it("shows the unlocked link-gate state above 65", async () => {
    h.payload.score = 70;
    h.payload.referralLinkGatePassed = true;
    render(<TrustApp />);
    expect(await screen.findByTestId("trust-linkgate-line")).toHaveTextContent(
      /above 65 — shareable referral links are unlocked/i,
    );
  });

  it("NEGATIVE STANDING: banner, EMPTY meter, and the negative figure in the error tone", async () => {
    h.payload.score = -22;
    h.payload.referralGatePassed = false;
    h.payload.referralLinkGatePassed = false;
    h.payload.negativeStanding = true;
    render(<TrustApp />);
    const banner = await screen.findByTestId("trust-negative-banner");
    expect(banner).toHaveTextContent(/negative standing — penal code/i);
    expect(banner.className).toMatch(/negativeBanner/);
    const value = screen.getByTestId("trust-score-value");
    expect(value).toHaveTextContent("-22");
    expect(value.className).toMatch(/scoreNegative/);
    const meter = screen.getByTestId("trust-meter");
    expect(meter.querySelectorAll("[class*='segmentFilled']")).toHaveLength(0); // empty
  });

  it("no negative banner in ordinary standing", async () => {
    render(<TrustApp />);
    await screen.findByTestId("trust-score-value");
    expect(screen.queryByTestId("trust-negative-banner")).toBeNull();
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
