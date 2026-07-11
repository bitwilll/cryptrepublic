// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { TribunalApp } from "./TribunalApp";

/**
 * TribunalApp (Wave 17) — the officers' docket island. The queue GET and the
 * decide POST are mocked. Asserts the 403 reserved notice, the docket render
 * (complaint body, subject Civic ID + display, withheld reporter, category
 * grade hint, the deciding office pill), the empty docket, and the decide
 * flow POSTing to /api/reports/[id]/decide then reloading the queue.
 */

const h = vi.hoisted(() => ({
  status: 200,
  payload: {} as unknown,
  posts: [] as Array<{ url: string; body: Record<string, unknown> }>,
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function queueItem(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "rep-1",
    category: "MISREPRESENTATION",
    body: "The subject misrepresented the provenance of a listed artifact.",
    createdAt: "2026-07-01T00:00:00.000Z",
    subjectCivicId: "CR-QQQQ-WWWW",
    subjectDisplay: "Citizen № 7",
    reporterDisplay: "Citizen (withheld)",
    ...over,
  };
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  h.status = 200;
  h.payload = { office: "PROTECTOR", queue: [queueItem()] };
  h.posts = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if ((init?.method ?? "GET") === "POST") {
      h.posts.push({ url, body: init?.body ? JSON.parse(String(init.body)) : {} });
      return jsonResponse({ ok: true });
    }
    if (h.status !== 200) return jsonResponse({ error: "Forbidden." }, h.status);
    return jsonResponse(h.payload);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("TribunalApp", () => {
  it("renders the reserved notice on a 403", async () => {
    h.status = 403;
    render(<TribunalApp />);
    await waitFor(() => expect(screen.getByTestId("tribunal-forbidden")).toBeTruthy());
    expect(
      screen.getByText("Reserved for sitting Protectors and the Chief of Protectors."),
    ).toBeTruthy();
    expect(screen.queryByTestId("tribunal-docket")).toBeNull();
  });

  it("renders the docket: office pill, category grade hint, subject id, withheld reporter, body", async () => {
    render(<TribunalApp />);
    await waitFor(() => expect(screen.getByTestId("tribunal-docket")).toBeTruthy());
    expect(screen.getByTestId("tribunal-office").textContent).toContain("Protector");
    expect(screen.getByText("Misrepresentation (Grade II)")).toBeTruthy(); // grade hint label
    expect(screen.getByText(/CR-QQQQ-WWWW/)).toBeTruthy();
    expect(screen.getByText(/Citizen \(withheld\)/)).toBeTruthy();
    expect(
      screen.getByText("The subject misrepresented the provenance of a listed artifact."),
    ).toBeTruthy();
  });

  it("renders the empty docket state", async () => {
    h.payload = { office: "CHIEF_OF_PROTECTORS", queue: [] };
    render(<TribunalApp />);
    await waitFor(() => expect(screen.getByTestId("tribunal-empty")).toBeTruthy());
  });

  it("decides through the shared form: POSTs to /api/reports/[id]/decide and reloads", async () => {
    render(<TribunalApp />);
    await waitFor(() => expect(screen.getByTestId("open-decide-rep-1")).toBeTruthy());
    fireEvent.click(screen.getByTestId("open-decide-rep-1"));

    // The suggested grade follows the category (MISREPRESENTATION → II).
    const grade = screen.getByTestId("docket-rep-1-grade-select") as HTMLSelectElement;
    expect(grade.value).toBe("II");

    fireEvent.change(screen.getByTestId("docket-rep-1-penalty-input"), {
      target: { value: "-10" },
    });
    fireEvent.change(screen.getByTestId("docket-rep-1-note-input"), {
      target: { value: "Established against the registry." },
    });
    fireEvent.click(screen.getByTestId("docket-rep-1-submit"));
    fireEvent.click(screen.getByTestId("docket-rep-1-confirm"));

    await waitFor(() => expect(h.posts).toHaveLength(1));
    expect(h.posts[0]!.url).toBe("/api/reports/rep-1/decide");
    expect(h.posts[0]!.body).toEqual({
      action: "verify",
      grade: "II",
      penalty: -10,
      note: "Established against the registry.",
    });
    await waitFor(() =>
      expect(screen.getByTestId("tribunal-status").textContent).toMatch(/entered on the record/i),
    );
  });
});
