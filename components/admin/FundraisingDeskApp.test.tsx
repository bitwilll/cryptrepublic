// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { formatCoin } from "@/lib/store/format";

/**
 * FundraisingDeskApp tests (Wave 16). The desk GET + decision POSTs are
 * mocked. Asserts the three panels render (submitted queue with endorsement
 * tally + COMMUNITY-BACKED pill at the threshold, active register with the
 * pledged total, decided ledger with review notes), approve POSTs directly,
 * decline is two-step and REQUIRES a note, close is two-step, and the
 * non-custodial registry line is always on the page.
 */

const h = vi.hoisted(() => ({
  desk: {
    submitted: [] as Array<Record<string, unknown>>,
    active: [] as Array<Record<string, unknown>>,
    decided: [] as Array<Record<string, unknown>>,
  },
  posts: [] as Array<{ url: string; body: Record<string, unknown> }>,
}));

import { FundraisingDeskApp } from "./FundraisingDeskApp";

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function creator() {
  return { id: "u1", email: "founder@example.com", name: null };
}
function submitted(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "prj-1",
    title: "Municipal solar array",
    summary: "A shared solar array for the digital district.",
    category: "INFRASTRUCTURE",
    goalCoin: "50000",
    status: "SUBMITTED",
    reviewNote: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    creator: creator(),
    creatorDisplay: "Citizen № 7",
    endorsementCount: 5,
    communityBacked: false,
    ...over,
  };
}
function active(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "prj-2",
    title: "Archive digitisation",
    summary: "Scanning the founding documents.",
    category: "CULTURE",
    goalCoin: "1200",
    status: "ACTIVE",
    reviewNote: null,
    createdAt: "2026-07-02T00:00:00.000Z",
    creator: creator(),
    creatorDisplay: "Citizen № 7",
    pledgeCount: 2,
    pledgedTotalCoin: "124.75",
    ...over,
  };
}
function decided(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "prj-3",
    title: "Fleet of drones",
    summary: "Aerial survey drones.",
    category: "DEFENSE",
    goalCoin: "9000",
    status: "DECLINED",
    reviewNote: "Goal is unsubstantiated.",
    createdAt: "2026-06-20T00:00:00.000Z",
    creator: creator(),
    creatorDisplay: "Applicant",
    ...over,
  };
}

beforeEach(() => {
  h.desk = { submitted: [], active: [], decided: [] };
  h.posts = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "POST") {
      h.posts.push({ url, body: init?.body ? JSON.parse(String(init.body)) : {} });
      return jsonResponse({ ok: true });
    }
    if (url.includes("/api/admin/fundraising")) return jsonResponse(h.desk);
    return jsonResponse({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("FundraisingDeskApp", () => {
  it("renders the three panels with tallies and the non-custodial registry line", async () => {
    h.desk.submitted = [submitted()];
    h.desk.active = [active()];
    h.desk.decided = [decided()];
    render(<FundraisingDeskApp />);

    await waitFor(() => expect(screen.getByText("Municipal solar array")).toBeInTheDocument());
    expect(screen.getByTestId("endorsements-prj-1")).toHaveTextContent(
      "5 / 7 community endorsements",
    );
    expect(screen.queryByTestId("community-backed-prj-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("panel-submitted")).toHaveTextContent(
      "Citizen № 7 — founder@example.com",
    );

    expect(screen.getByTestId("pledged-prj-2")).toHaveTextContent(formatCoin("124.75"));
    expect(screen.getByTestId("panel-decided")).toHaveTextContent("Goal is unsubstantiated.");
    expect(screen.getByTestId("panel-decided")).toHaveTextContent("DECLINED");

    // The non-custodial posture is stated on the page.
    expect(screen.getByTestId("fundraising-desk")).toHaveTextContent(
      "Pledges are recorded commitments — settlement is wallet-to-wallet; the Republic never holds funds.",
    );
  });

  it("shows the COMMUNITY-BACKED pill at the 7-endorsement threshold", async () => {
    h.desk.submitted = [submitted({ endorsementCount: 7, communityBacked: true })];
    render(<FundraisingDeskApp />);
    await waitFor(() =>
      expect(screen.getByTestId("community-backed-prj-1")).toHaveTextContent("COMMUNITY-BACKED"),
    );
    expect(screen.getByTestId("endorsements-prj-1")).toHaveTextContent(
      "7 / 7 community endorsements",
    );
  });

  it("approve POSTs {action:'approve'} directly", async () => {
    h.desk.submitted = [submitted()];
    render(<FundraisingDeskApp />);
    await waitFor(() => expect(screen.getByTestId("approve-prj-1")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("approve-prj-1"));
    await waitFor(() => expect(h.posts).toHaveLength(1));
    expect(h.posts[0]!.url).toBe("/api/admin/fundraising/prj-1");
    expect(h.posts[0]!.body).toEqual({ action: "approve" });
  });

  it("decline is two-step and requires a note before the confirm enables", async () => {
    h.desk.submitted = [submitted()];
    render(<FundraisingDeskApp />);
    await waitFor(() => expect(screen.getByTestId("decline-prj-1")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("decline-prj-1"));
    const confirm = await screen.findByTestId("decline-confirm");
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/review note \(required\)/i), {
      target: { value: "The declared goal could not be substantiated." },
    });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() => expect(h.posts).toHaveLength(1));
    expect(h.posts[0]!.body).toEqual({
      action: "decline",
      note: "The declared goal could not be substantiated.",
    });
  });

  it("close is two-step and POSTs {action:'close'} (note optional)", async () => {
    h.desk.active = [active()];
    render(<FundraisingDeskApp />);
    await waitFor(() => expect(screen.getByTestId("close-prj-2")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("close-prj-2"));
    fireEvent.click(await screen.findByTestId("close-confirm"));

    await waitFor(() => expect(h.posts).toHaveLength(1));
    expect(h.posts[0]!.url).toBe("/api/admin/fundraising/prj-2");
    expect(h.posts[0]!.body).toEqual({ action: "close" });
  });

  it("a failed decision surfaces the API error", async () => {
    h.desk.submitted = [submitted()];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "POST") {
        return jsonResponse({ error: "A SUBMITTED project cannot be closed." }, 400);
      }
      if (String(input).includes("/api/admin/fundraising")) return jsonResponse(h.desk);
      return jsonResponse({});
    }) as unknown as typeof fetch;

    render(<FundraisingDeskApp />);
    await waitFor(() => expect(screen.getByTestId("approve-prj-1")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("approve-prj-1"));
    await waitFor(() =>
      expect(screen.getByTestId("desk-error")).toHaveTextContent(/cannot be closed/i),
    );
  });
});
