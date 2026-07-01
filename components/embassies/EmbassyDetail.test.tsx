// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * EmbassyDetail tests. The `/api/embassies/[code]` fetch is mocked. Asserts
 * (§7.12): renders directory info + a LIVE per-city citizen count for a code;
 * a not-found state for an unknown code.
 */

const h = vi.hoisted(() => ({
  found: true,
  liveCitizenCount: 0,
}));

const originalFetch = globalThis.fetch;

import { EmbassyDetail } from "./EmbassyDetail";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  h.found = true;
  h.liveCitizenCount = 0;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/embassies/")) {
      if (!h.found) return jsonResponse({ error: "Embassy not found." }, 404);
      return jsonResponse({
        embassy: {
          code: "LIS",
          name: "Lisbon",
          neighborhood: "Avenida da Liberdade",
          hours: "Mon–Sun · 09–22 WET",
          foundedAt: "2024.11.04",
          brandColor: "#7cffa6",
          city: "Lisbon",
          country: "Portugal",
        },
        liveCitizenCount: h.liveCitizenCount,
        liveCitizenCountSource: "self-declared domicile (minted citizens only)",
      });
    }
    return jsonResponse({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("EmbassyDetail", () => {
  it("renders directory info + the live citizen count for a code", async () => {
    h.liveCitizenCount = 2;
    render(<EmbassyDetail code="LIS" />);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Lisbon/ })).toBeInTheDocument(),
    );
    expect(screen.getByText(/Avenida da Liberdade/)).toBeInTheDocument();
    expect(screen.getByTestId("live-citizen-count")).toHaveTextContent(/2/);
  });

  it("shows a not-found state for an unknown code", async () => {
    h.found = false;
    render(<EmbassyDetail code="ZZZ" />);
    await waitFor(() => expect(screen.getByTestId("embassy-not-found")).toBeInTheDocument());
  });
});
