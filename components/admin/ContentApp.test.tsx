// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

/**
 * ContentApp tests (Wave 9 C3). The /api/admin/content/* routes are mocked.
 * Asserts (constraint #7 honesty):
 * - tabs switch between the 6 content groups
 * - asset create POSTs the schema shape; the SEEDED/DEMONSTRATIVE note stays
 * - a "TITLED ON CHAIN" status trips the CLIENT-SIDE provenance mirror (no
 *   POST fired) with the API's exact message; a server 400 renders verbatim
 * - the allocations form warns when the new table-wide sum exceeds 10000
 * - the proposal body field is disabled when descriptionHash is set
 * - comment moderation confirms, notes the audit preservation, and DELETEs
 */

const h = vi.hoisted(() => ({
  posts: [] as Array<{ url: string; method: string; body: Record<string, unknown> | null }>,
  assetPostStatus: 200 as number,
  assetPostError: "",
  comments: [] as Array<Record<string, unknown>>,
}));

const originalFetch = globalThis.fetch;

import { ContentApp } from "./ContentApp";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const ASSET = {
  id: "a1",
  ref: "RE-001",
  kind: "re",
  name: "Alfama Quarter Block",
  location: "Lisbon, Portugal",
  valueUsd: "28400000",
  yieldBps: 480,
  annualYieldUsd: "1363200",
  status: "OWNED (demonstrative)",
  acquiredAt: "2024.11.04",
};

const EMBASSY = {
  code: "LIS",
  name: "Lisbon Embassy",
  neighborhood: "Avenida da Liberdade",
  hours: "Mon-Sun 09-22 WET",
  foundedAt: "2024.11.04",
  brandColor: "#7cffa6",
  city: "Lisbon",
  country: "Portugal",
};

const ALLOCS = [
  {
    id: "t1",
    bucket: "embassy_ops",
    label: "Embassy operations",
    targetBps: 3800,
    color: "#c9a227",
  },
  { id: "t2", bucket: "reserve", label: "Sovereign reserve", targetBps: 2600, color: "#1957d3" },
];

const PROPOSALS = [
  {
    id: "p1",
    chainId: 31337,
    proposalId: "1",
    title: "Bound proposal",
    tag: "CIVIC",
    body: "hash-bound body",
    descriptionHash: "0xabc",
    createdAt: "2026-07-01T00:00:00.000Z",
    commentCount: 1,
  },
  {
    id: "p2",
    chainId: 31337,
    proposalId: "2",
    title: "Free proposal",
    tag: "CULTURAL",
    body: "editable body",
    descriptionHash: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    commentCount: 0,
  },
];

beforeEach(() => {
  h.posts = [];
  h.assetPostStatus = 200;
  h.assetPostError = "";
  h.comments = [
    {
      id: "c1",
      proposalContentId: "p1",
      authorAddress: "0x00000000000000000000000000000000000000C3",
      citizenTokenId: "7",
      body: "an unkind comment",
      upvotes: 0,
      createdAt: "2026-07-01T00:00:00.000Z",
    },
  ];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method !== "GET") {
      h.posts.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (url.includes("/content/assets") && h.assetPostStatus !== 200) {
        return jsonResponse({ error: h.assetPostError }, h.assetPostStatus);
      }
      return jsonResponse({ ok: true });
    }
    if (url.includes("/api/admin/content/assets")) return jsonResponse({ assets: [ASSET] });
    if (url.includes("/api/admin/content/embassies")) return jsonResponse({ embassies: [EMBASSY] });
    if (url.includes("/api/admin/content/census")) return jsonResponse({ census: [] });
    if (url.includes("/api/admin/content/allocations"))
      return jsonResponse({ allocations: ALLOCS });
    if (url.includes("/api/admin/content/constitution")) return jsonResponse({ entries: [] });
    if (url.includes("/api/admin/content/proposals/p1"))
      return jsonResponse({ proposal: PROPOSALS[0], comments: h.comments });
    if (url.includes("/api/admin/content/proposals")) return jsonResponse({ proposals: PROPOSALS });
    return jsonResponse({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("ContentApp", () => {
  it("switches tabs between the content groups", async () => {
    render(<ContentApp />);
    await waitFor(() => expect(screen.getByText("Alfama Quarter Block")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^EMBASSIES$/i }));
    await waitFor(() => expect(screen.getByText("Lisbon Embassy")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^ALLOCATIONS$/i }));
    await waitFor(() => expect(screen.getByText("Embassy operations")).toBeInTheDocument());
  });

  it("keeps the SEEDED / DEMONSTRATIVE note on the assets tab", async () => {
    render(<ContentApp />);
    await waitFor(() => expect(screen.getByText("Alfama Quarter Block")).toBeInTheDocument());
    expect(screen.getByTestId("assets-demonstrative-note")).toHaveTextContent(/demonstrative/i);
  });

  it("creates an asset with the exact schema shape", async () => {
    render(<ContentApp />);
    await waitFor(() => expect(screen.getByText("Alfama Quarter Block")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /new asset/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/^ref$/i), { target: { value: "RE-002" } });
    fireEvent.change(within(dialog).getByLabelText(/^kind$/i), { target: { value: "re" } });
    fireEvent.change(within(dialog).getByLabelText(/^name$/i), { target: { value: "Test Block" } });
    fireEvent.change(within(dialog).getByLabelText(/location/i), { target: { value: "Porto" } });
    fireEvent.change(within(dialog).getByLabelText(/value usd/i), {
      target: { value: "1000000" },
    });
    fireEvent.change(within(dialog).getByLabelText(/yield bps/i), { target: { value: "480" } });
    fireEvent.change(within(dialog).getByLabelText(/annual yield usd/i), {
      target: { value: "48000" },
    });
    fireEvent.change(within(dialog).getByLabelText(/^status$/i), {
      target: { value: "OWNED (demonstrative)" },
    });
    fireEvent.change(within(dialog).getByLabelText(/acquired/i), {
      target: { value: "2026.01.01" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(h.posts.length).toBe(1));
    expect(h.posts[0].method).toBe("POST");
    expect(h.posts[0].url).toContain("/api/admin/content/assets");
    expect(h.posts[0].body).toEqual({
      ref: "RE-002",
      kind: "re",
      name: "Test Block",
      location: "Porto",
      valueUsd: "1000000",
      yieldBps: 480,
      annualYieldUsd: "48000",
      status: "OWNED (demonstrative)",
      acquiredAt: "2026.01.01",
    });
  });

  it("trips the client-side provenance mirror on TITLED ON CHAIN (no POST)", async () => {
    render(<ContentApp />);
    await waitFor(() => expect(screen.getByText("Alfama Quarter Block")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /new asset/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/^ref$/i), { target: { value: "RE-002" } });
    fireEvent.change(within(dialog).getByLabelText(/^name$/i), { target: { value: "Test" } });
    fireEvent.change(within(dialog).getByLabelText(/location/i), { target: { value: "Porto" } });
    fireEvent.change(within(dialog).getByLabelText(/value usd/i), { target: { value: "1" } });
    fireEvent.change(within(dialog).getByLabelText(/annual yield usd/i), {
      target: { value: "1" },
    });
    fireEvent.change(within(dialog).getByLabelText(/^status$/i), {
      target: { value: "OWNED · TITLED ON CHAIN" },
    });
    fireEvent.change(within(dialog).getByLabelText(/acquired/i), {
      target: { value: "2026.01.01" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(screen.getByTestId("form-error")).toHaveTextContent(
        "Fabricated on-chain provenance is not allowed.",
      ),
    );
    expect(h.posts).toHaveLength(0);
  });

  it("renders a server 400 error verbatim", async () => {
    h.assetPostStatus = 400;
    h.assetPostError = "An asset with this ref already exists.";
    render(<ContentApp />);
    await waitFor(() => expect(screen.getByText("Alfama Quarter Block")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /new asset/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/^ref$/i), { target: { value: "RE-001" } });
    fireEvent.change(within(dialog).getByLabelText(/^name$/i), { target: { value: "Test" } });
    fireEvent.change(within(dialog).getByLabelText(/location/i), { target: { value: "Porto" } });
    fireEvent.change(within(dialog).getByLabelText(/value usd/i), { target: { value: "1" } });
    fireEvent.change(within(dialog).getByLabelText(/annual yield usd/i), {
      target: { value: "1" },
    });
    fireEvent.change(within(dialog).getByLabelText(/^status$/i), {
      target: { value: "OWNED (demonstrative)" },
    });
    fireEvent.change(within(dialog).getByLabelText(/acquired/i), {
      target: { value: "2026.01.01" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(screen.getByTestId("form-error")).toHaveTextContent(
        "An asset with this ref already exists.",
      ),
    );
  });

  it("warns when an allocation edit pushes the table-wide sum over 10000", async () => {
    render(<ContentApp />);
    await waitFor(() => expect(screen.getByText("Alfama Quarter Block")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^ALLOCATIONS$/i }));
    await waitFor(() => expect(screen.getByText("Embassy operations")).toBeInTheDocument());
    // live table-wide sum renders
    expect(screen.getByTestId("allocation-sum")).toHaveTextContent("6400");
    const editButtons = screen.getAllByRole("button", { name: /^edit$/i });
    fireEvent.click(editButtons[0]); // embassy_ops (3800)
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/target bps/i), {
      target: { value: "8000" },
    });
    // 8000 + 2600 (reserve) = 10600 > 10000
    await waitFor(() =>
      expect(screen.getByTestId("allocation-sum-warning")).toHaveTextContent(/exceed/i),
    );
  });

  it("disables the proposal body when descriptionHash is set, keeps it editable when null", async () => {
    render(<ContentApp />);
    await waitFor(() => expect(screen.getByText("Alfama Quarter Block")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^PROPOSALS$/i }));
    await waitFor(() => expect(screen.getByText("Bound proposal")).toBeInTheDocument());
    const editButtons = screen.getAllByRole("button", { name: /^edit$/i });
    fireEvent.click(editButtons[0]); // hash-bound p1
    let dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText(/body/i)).toBeDisabled();
    expect(within(dialog).getByText(/bound to the on-chain descriptionHash/i)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /close/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /^edit$/i })[1]); // p2, hash null
    dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText(/body/i)).not.toBeDisabled();
  });

  it("moderates a comment: confirm notes audit preservation, then DELETEs", async () => {
    render(<ContentApp />);
    await waitFor(() => expect(screen.getByText("Alfama Quarter Block")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^PROPOSALS$/i }));
    await waitFor(() => expect(screen.getByText("Bound proposal")).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: /comments/i })[0]);
    await waitFor(() => expect(screen.getByText("an unkind comment")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^moderate$/i }));
    expect(screen.getByText(/preserved in the audit log/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /confirm removal/i }));
    await waitFor(() => expect(h.posts.length).toBe(1));
    expect(h.posts[0].method).toBe("DELETE");
    expect(h.posts[0].url).toContain("/api/admin/content/comments/c1");
  });
});
