// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

/**
 * OfficesDeskApp tests (Wave 16). The roster GET, ?q= search, appoint POST,
 * and revoke POST are mocked. Asserts the Council renders in protocol order
 * with VACANT SEAT cards for unheld single seats, the debounced search →
 * select → appoint flow POSTs the right body, a 409 seat conflict surfaces
 * inline, revocation is two-step, and the audited-everything footer is on
 * the page.
 */

const h = vi.hoisted(() => ({
  roster: [] as Array<Record<string, unknown>>,
  users: [] as Array<Record<string, unknown>>,
  posts: [] as Array<{ url: string; body: Record<string, unknown> }>,
  postStatus: 200 as number,
  postError: "" as string,
}));

import { OfficesDeskApp } from "./OfficesDeskApp";

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function seat(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "apt-1",
    userId: "u1",
    email: "pm@example.com",
    name: "First Citizen",
    citizen: "Citizen № 1",
    office: "PRIME_MINISTER",
    portfolio: null,
    note: null,
    appointedAt: "2026-07-01T00:00:00.000Z",
    appointedBy: "adm-1",
    ...over,
  };
}

beforeEach(() => {
  h.roster = [];
  h.users = [];
  h.posts = [];
  h.postStatus = 200;
  h.postError = "";
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "POST") {
      h.posts.push({ url, body: init?.body ? JSON.parse(String(init.body)) : {} });
      if (h.postStatus !== 200) return jsonResponse({ error: h.postError }, h.postStatus);
      return jsonResponse({ ok: true, appointment: { id: "apt-new" } });
    }
    if (url.includes("?q=")) return jsonResponse({ roster: h.roster, users: h.users });
    if (url.includes("/api/admin/offices")) return jsonResponse({ roster: h.roster });
    return jsonResponse({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("OfficesDeskApp", () => {
  it("renders held and VACANT single seats, grouped benches, and the audit footer", async () => {
    h.roster = [
      seat(),
      seat({
        id: "apt-2",
        userId: "u2",
        email: "minister@example.com",
        citizen: "Citizen № 4",
        office: "MINISTER",
        portfolio: "Treasury",
      }),
    ];
    render(<OfficesDeskApp />);

    await waitFor(() => expect(screen.getByTestId("seat-PRIME_MINISTER")).toBeInTheDocument());
    expect(screen.getByTestId("seat-PRIME_MINISTER")).toHaveTextContent("Citizen № 1");
    expect(screen.getByTestId("seat-PRIME_MINISTER")).toHaveTextContent("pm@example.com");
    // Unheld single seats render as VACANT SEAT empty states.
    expect(screen.getByTestId("seat-CHIEF_MINISTER")).toHaveTextContent(/vacant seat/i);
    expect(screen.getByTestId("seat-CHIEF_OF_PROTECTORS")).toHaveTextContent(/vacant seat/i);

    const ministers = screen.getByTestId("group-MINISTER");
    expect(ministers).toHaveTextContent("Ministers — 1 seated");
    expect(ministers).toHaveTextContent("Treasury");
    expect(screen.getByTestId("group-SENATOR")).toHaveTextContent(/no senators hold office/i);

    expect(
      screen.getByText(/every appointment and revocation is entered in the audit log/i),
    ).toBeInTheDocument();
  });

  it("search → select → appoint POSTs {userId, office, portfolio}", async () => {
    h.users = [
      {
        id: "u9",
        email: "candidate@example.com",
        name: "Candidate",
        citizen: "Citizen № 9",
        offices: [{ office: "SENATOR", portfolio: null }],
      },
    ];
    render(<OfficesDeskApp />);
    await waitFor(() => expect(screen.getByLabelText(/citizen \(search/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/citizen \(search/i), {
      target: { value: "candidate" },
    });
    const pick = await screen.findByTestId("pick-u9");
    expect(pick).toHaveTextContent("Holds: Senator"); // current offices shown
    fireEvent.click(pick);
    expect(screen.getByTestId("selected-user")).toHaveTextContent("Citizen № 9");

    // MINISTER is the default office — the portfolio field is visible.
    fireEvent.change(screen.getByLabelText(/portfolio — e\.g\. treasury/i), {
      target: { value: "Digital Infrastructure" },
    });
    fireEvent.change(screen.getByLabelText(/note \(optional\)/i), {
      target: { value: "First cabinet" },
    });
    fireEvent.click(screen.getByTestId("appoint-submit"));

    await waitFor(() => expect(h.posts).toHaveLength(1));
    expect(h.posts[0]!.url).toBe("/api/admin/offices");
    expect(h.posts[0]!.body).toEqual({
      userId: "u9",
      office: "MINISTER",
      portfolio: "Digital Infrastructure",
      note: "First cabinet",
    });
  });

  it("marks single-seat offices in the office select and hides portfolio for them", async () => {
    render(<OfficesDeskApp />);
    await waitFor(() => expect(screen.getByLabelText("Office")).toBeInTheDocument());

    expect(
      screen.getByRole("option", { name: /prime minister · single seat/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /^senator$/i })).toBeInTheDocument();

    // Switching to a non-portfolio office hides the portfolio input.
    expect(screen.getByLabelText(/portfolio/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Office"), { target: { value: "PROTECTOR" } });
    expect(screen.queryByLabelText(/portfolio/i)).not.toBeInTheDocument();
  });

  it("a 409 seat conflict surfaces inline in the persistent error container", async () => {
    h.users = [
      {
        id: "u9",
        email: "candidate@example.com",
        name: null,
        citizen: "Applicant",
        offices: [],
      },
    ];
    h.postStatus = 409;
    h.postError = "This seat is held by pm@example.com — revoke first.";
    render(<OfficesDeskApp />);
    await waitFor(() => expect(screen.getByLabelText(/citizen \(search/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/citizen \(search/i), {
      target: { value: "candidate" },
    });
    fireEvent.click(await screen.findByTestId("pick-u9"));
    fireEvent.click(screen.getByTestId("appoint-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("appoint-error")).toHaveTextContent(
        "This seat is held by pm@example.com — revoke first.",
      ),
    );
  });

  it("revoke is two-step and POSTs {appointmentId, note}", async () => {
    h.roster = [seat()];
    render(<OfficesDeskApp />);
    await waitFor(() => expect(screen.getByTestId("revoke-apt-1")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("revoke-apt-1"));
    const confirm = await screen.findByTestId("revoke-confirm");
    fireEvent.change(screen.getByLabelText(/revocation note \(optional\)/i), {
      target: { value: "Rotation of the guard." },
    });
    fireEvent.click(confirm);

    await waitFor(() => expect(h.posts).toHaveLength(1));
    expect(h.posts[0]!.url).toBe("/api/admin/offices/revoke");
    expect(h.posts[0]!.body).toEqual({ appointmentId: "apt-1", note: "Rotation of the guard." });
  });
});
