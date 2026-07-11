// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ConductDeskApp } from "./ConductDeskApp";

/**
 * ConductDeskApp (Wave 17). The desk GET and decide POSTs are mocked.
 * Asserts the three panels render (submitted queue WITH the reporter's email
 * and the complaint body, verified ledger with the grade pill + OFFICES
 * FORFEITED tag and decider + office, dismissed ledger), the statutory
 * footer, and that a desk decision POSTs to the SHARED
 * /api/reports/[id]/decide endpoint (no admin decide route exists).
 */

const h = vi.hoisted(() => ({
  desk: {
    submitted: [] as Array<Record<string, unknown>>,
    verified: [] as Array<Record<string, unknown>>,
    dismissed: [] as Array<Record<string, unknown>>,
  },
  posts: [] as Array<{ url: string; body: Record<string, unknown> }>,
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function base(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "rep-1",
    category: "MISREPRESENTATION",
    status: "SUBMITTED",
    body: "The subject misrepresented the provenance of a listed artifact.",
    grade: null,
    penalty: null,
    note: null,
    deciderOffice: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    decidedAt: null,
    reporter: { id: "u-rep", email: "reporter@example.com", name: null },
    subject: { id: "u-sub", email: "subject@example.com", name: null, civicId: "CR-QQQQ-WWWW" },
    subjectDisplay: "Citizen № 7",
    ...over,
  };
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  h.desk = { submitted: [], verified: [], dismissed: [] };
  h.posts = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if ((init?.method ?? "GET") === "POST") {
      h.posts.push({ url, body: init?.body ? JSON.parse(String(init.body)) : {} });
      return jsonResponse({ ok: true });
    }
    if (url.includes("/api/admin/reports")) return jsonResponse(h.desk);
    return jsonResponse({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("ConductDeskApp", () => {
  it("renders the submitted queue with reporter email + complaint body, and the statutory footer", async () => {
    h.desk.submitted = [base()];
    render(<ConductDeskApp />);
    await waitFor(() => expect(screen.getByTestId("panel-submitted")).toBeTruthy());
    expect(screen.getByText(/reporter@example\.com/)).toBeTruthy(); // admins see the reporter
    expect(
      screen.getByText("The subject misrepresented the provenance of a listed artifact."),
    ).toBeTruthy();
    expect(screen.getByText(/Citizen № 7 — CR-QQQQ-WWWW/)).toBeTruthy();
    expect(screen.getByText("Misrepresentation (Grade II)")).toBeTruthy();
    expect(screen.getByTestId("desk-footer").textContent).toBe(
      "Verified penalties enter the subject’s trust score under the Penal Code. Every decision is audit-logged.",
    );
  });

  it("verified ledger: grade pill styling + OFFICES FORFEITED tag + decider and office", async () => {
    h.desk.verified = [
      base({
        id: "rep-v",
        status: "VERIFIED",
        grade: "V",
        penalty: -80,
        note: "Fraud upon the Republic.",
        deciderOffice: "PROTECTOR",
        deciderLabel: "protector@example.com",
        decidedAt: "2026-07-02T00:00:00.000Z",
        forfeitedSeats: 2,
        officesForfeited: true,
      }),
      base({
        id: "rep-v2",
        status: "VERIFIED",
        grade: "II",
        penalty: -10,
        note: "Established.",
        deciderOffice: "ADMIN",
        deciderLabel: "admin@example.com",
        decidedAt: "2026-07-03T00:00:00.000Z",
        forfeitedSeats: 0,
        officesForfeited: false,
      }),
    ];
    render(<ConductDeskApp />);
    await waitFor(() => expect(screen.getByTestId("panel-verified")).toBeTruthy());
    expect(screen.getByText("Grade V")).toBeTruthy();
    expect(screen.getByTestId("forfeited-tag").textContent).toBe("OFFICES FORFEITED");
    expect(screen.getAllByTestId("forfeited-tag")).toHaveLength(1); // only the forfeiting row
    expect(screen.getByText("Grade II")).toBeTruthy();
    expect(screen.getByText(/protector@example\.com/)).toBeTruthy();
    expect(screen.getByText("PROTECTOR")).toBeTruthy();
    expect(screen.getByTestId("penalty-rep-v").textContent).toBe("-80");
  });

  it("dismissed ledger renders decider + note", async () => {
    h.desk.dismissed = [
      base({
        id: "rep-d",
        status: "DISMISSED",
        note: "No evidence beyond the assertion.",
        deciderOffice: "ADMIN",
        deciderLabel: "admin@example.com",
        decidedAt: "2026-07-04T00:00:00.000Z",
      }),
    ];
    render(<ConductDeskApp />);
    await waitFor(() => expect(screen.getByTestId("panel-dismissed")).toBeTruthy());
    expect(screen.getByText("No evidence beyond the assertion.")).toBeTruthy();
  });

  it("desk decisions POST to the SHARED /api/reports/[id]/decide endpoint", async () => {
    h.desk.submitted = [base()];
    render(<ConductDeskApp />);
    await waitFor(() => expect(screen.getByTestId("open-decide-rep-1")).toBeTruthy());
    fireEvent.click(screen.getByTestId("open-decide-rep-1"));

    fireEvent.click(screen.getByTestId("desk-rep-1-mode-dismiss"));
    fireEvent.change(screen.getByTestId("desk-rep-1-note-input"), {
      target: { value: "No evidence beyond the assertion." },
    });
    fireEvent.click(screen.getByTestId("desk-rep-1-submit"));
    fireEvent.click(screen.getByTestId("desk-rep-1-confirm"));

    await waitFor(() => expect(h.posts).toHaveLength(1));
    expect(h.posts[0]!.url).toBe("/api/reports/rep-1/decide");
    expect(h.posts[0]!.body).toEqual({
      action: "dismiss",
      note: "No evidence beyond the assertion.",
    });
    await waitFor(() =>
      expect(screen.getByTestId("desk-status").textContent).toMatch(/entered on the record/i),
    );
  });
});
