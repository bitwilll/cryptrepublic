// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

/**
 * FlagsApp tests (Wave 9 C3). /api/admin/flags is mocked. Asserts:
 * - effective values + their SOURCE (DB row vs declared default) render
 * - toggling posts a flag upsert; delete removes the row
 * - the create form posts the schema shape
 * - the declared-defaults note is in voice
 */

const h = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  mutations: [] as Array<{ url: string; method: string; body: Record<string, unknown> | null }>,
}));

const originalFetch = globalThis.fetch;

import { FlagsApp } from "./FlagsApp";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  h.rows = [];
  h.mutations = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method !== "GET") {
      h.mutations.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      return jsonResponse({ ok: true });
    }
    if (url.includes("/api/admin/flags")) {
      return jsonResponse({ flags: h.rows, defaults: { population_world_map: true } });
    }
    return jsonResponse({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("FlagsApp", () => {
  it("renders the declared default as effective ON with source 'declared default'", async () => {
    render(<FlagsApp />);
    await waitFor(() => expect(screen.getByText("population_world_map")).toBeInTheDocument());
    const row = screen.getByTestId("flag-row-population_world_map");
    expect(row).toHaveTextContent(/on/i);
    expect(row).toHaveTextContent(/declared default/i);
    expect(
      screen.getByText(/missing flags fall back to their declared defaults/i),
    ).toBeInTheDocument();
  });

  it("renders a DB row as the source when one exists", async () => {
    h.rows = [
      {
        key: "population_world_map",
        enabled: false,
        description: "flipped off",
        createdAt: "2026-07-02T00:00:00.000Z",
        updatedAt: "2026-07-02T00:00:00.000Z",
      },
    ];
    render(<FlagsApp />);
    await waitFor(() => expect(screen.getByText("population_world_map")).toBeInTheDocument());
    const row = screen.getByTestId("flag-row-population_world_map");
    expect(row).toHaveTextContent(/off/i);
    expect(row).toHaveTextContent(/db row/i);
  });

  it("toggle posts an upsert flipping the effective value", async () => {
    render(<FlagsApp />);
    await waitFor(() => expect(screen.getByText("population_world_map")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /turn off population_world_map/i }));
    await waitFor(() => expect(h.mutations.length).toBe(1));
    expect(h.mutations[0].method).toBe("POST");
    expect(h.mutations[0].url).toContain("/api/admin/flags");
    expect(h.mutations[0].body).toEqual({ key: "population_world_map", enabled: false });
  });

  it("delete removes the DB row (falls back to the declared default)", async () => {
    h.rows = [
      {
        key: "population_world_map",
        enabled: false,
        description: null,
        createdAt: "2026-07-02T00:00:00.000Z",
        updatedAt: "2026-07-02T00:00:00.000Z",
      },
    ];
    render(<FlagsApp />);
    await waitFor(() => expect(screen.getByText("population_world_map")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /delete population_world_map/i }));
    await waitFor(() => expect(h.mutations.length).toBe(1));
    expect(h.mutations[0].method).toBe("DELETE");
    expect(h.mutations[0].url).toContain("/api/admin/flags/population_world_map");
  });

  it("creates a flag via the form", async () => {
    render(<FlagsApp />);
    await waitFor(() => expect(screen.getByText("population_world_map")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/^key$/i), { target: { value: "beta_banner" } });
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "Show the beta banner" },
    });
    fireEvent.click(screen.getByLabelText(/enabled/i));
    fireEvent.click(screen.getByRole("button", { name: /create flag/i }));
    await waitFor(() => expect(h.mutations.length).toBe(1));
    expect(h.mutations[0].body).toEqual({
      key: "beta_banner",
      enabled: true,
      description: "Show the beta banner",
    });
  });

  it("shows error + RETRY when the fetch fails", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ error: "boom" }, 500),
    ) as unknown as typeof fetch;
    render(<FlagsApp />);
    await waitFor(() => expect(screen.getByTestId("flags-error")).toBeInTheDocument());
  });
});
