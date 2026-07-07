// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

/**
 * InsuranceApp tests (Wave 15 B). fetch is mocked. Asserts the registry
 * notice (no premiums), both product desks, the POST body shapes (ASSET
 * carries valueUsd; HEALTH does not), and the ledger's status chips with the
 * decline reviewNote shown to the citizen.
 */

const h = vi.hoisted(() => ({
  applications: [] as Array<Record<string, unknown>>,
  posts: [] as Array<{ url: string; body: Record<string, unknown> }>,
  postStatus: 200,
  postError: "",
}));

import { InsuranceApp } from "./InsuranceApp";

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  h.applications = [];
  h.posts = [];
  h.postStatus = 200;
  h.postError = "";
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "POST") {
      h.posts.push({ url, body: init?.body ? JSON.parse(String(init.body)) : {} });
      return h.postStatus === 200
        ? jsonResponse({ ok: true })
        : jsonResponse({ error: h.postError }, h.postStatus);
    }
    if (url.includes("/api/insurance/applications")) {
      return jsonResponse({ applications: h.applications });
    }
    return jsonResponse({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("InsuranceApp", () => {
  it("renders the no-premiums notice and both product desks", async () => {
    render(<InsuranceApp />);
    expect(
      screen.getByText(
        /The Insurance Office\s+registers applications for the Republic's mutual-cover programme\. No premiums are\s+collected during the registration period\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("insurance-product-ASSET")).toHaveTextContent(/asset cover/i);
    expect(screen.getByTestId("insurance-product-HEALTH")).toHaveTextContent(/health cover/i);
    await waitFor(() =>
      expect(screen.getByText(/no applications are on file/i)).toBeInTheDocument(),
    );
  });

  it("ASSET application posts product + note + integer valueUsd", async () => {
    render(<InsuranceApp />);
    const desk = screen.getByTestId("insurance-product-ASSET");
    fireEvent.change(desk.querySelector("textarea")!, {
      target: { value: "Cover my workshop against fire." },
    });
    fireEvent.change(desk.querySelector('input[type="number"]')!, {
      target: { value: "250000" },
    });
    fireEvent.click(screen.getByTestId("insurance-apply-ASSET"));

    await waitFor(() => expect(h.posts).toHaveLength(1));
    expect(h.posts[0]!.url).toBe("/api/insurance/applications");
    expect(h.posts[0]!.body).toEqual({
      product: "ASSET",
      coverageNote: "Cover my workshop against fire.",
      valueUsd: 250000,
    });
    await waitFor(() =>
      expect(screen.getByTestId("insurance-status")).toHaveTextContent(/application registered/i),
    );
  });

  it("HEALTH application posts WITHOUT valueUsd", async () => {
    render(<InsuranceApp />);
    const desk = screen.getByTestId("insurance-product-HEALTH");
    fireEvent.change(desk.querySelector("textarea")!, {
      target: { value: "Standard citizen health cover." },
    });
    fireEvent.click(screen.getByTestId("insurance-apply-HEALTH"));

    await waitFor(() => expect(h.posts).toHaveLength(1));
    expect(h.posts[0]!.body).toEqual({
      product: "HEALTH",
      coverageNote: "Standard citizen health cover.",
    });
  });

  it("surfaces the API's error verbatim (e.g. the 3-application cap)", async () => {
    h.postStatus = 400;
    h.postError =
      "You already have three applications on file for this product. Await their review.";
    render(<InsuranceApp />);
    const desk = screen.getByTestId("insurance-product-HEALTH");
    fireEvent.change(desk.querySelector("textarea")!, {
      target: { value: "Standard citizen health cover." },
    });
    fireEvent.click(screen.getByTestId("insurance-apply-HEALTH"));
    await waitFor(() => expect(screen.getByTestId("insurance-error")).toBeInTheDocument());
    expect(screen.getByTestId("insurance-error")).toHaveTextContent(/three applications/i);
  });

  it("ledger shows every status chip and the decline reviewNote", async () => {
    h.applications = [
      {
        id: "a1",
        product: "ASSET",
        coverageNote: "Cover the workshop.",
        valueUsd: "250000",
        status: "SUBMITTED",
        reviewNote: null,
        createdAt: "2026-07-01T00:00:00.000Z",
      },
      {
        id: "a2",
        product: "HEALTH",
        coverageNote: "Cover the citizen.",
        valueUsd: null,
        status: "IN_REVIEW",
        reviewNote: null,
        createdAt: "2026-06-20T00:00:00.000Z",
      },
      {
        id: "a3",
        product: "ASSET",
        coverageNote: "Cover the fleet.",
        valueUsd: "9000",
        status: "APPROVED",
        reviewNote: null,
        createdAt: "2026-06-10T00:00:00.000Z",
      },
      {
        id: "a4",
        product: "HEALTH",
        coverageNote: "Cover the household.",
        valueUsd: null,
        status: "DECLINED",
        reviewNote: "Insufficient detail in the cover note.",
        createdAt: "2026-06-01T00:00:00.000Z",
      },
    ];
    render(<InsuranceApp />);
    await waitFor(() => expect(screen.getByText("SUBMITTED")).toBeInTheDocument());
    expect(screen.getByText("IN REVIEW")).toBeInTheDocument();
    expect(screen.getByText("APPROVED")).toBeInTheDocument();
    expect(screen.getByText("DECLINED")).toBeInTheDocument();
    expect(screen.getByText(/insufficient detail in the cover note/i)).toBeInTheDocument();
    expect(screen.getByText("$250,000")).toBeInTheDocument();
  });
});
