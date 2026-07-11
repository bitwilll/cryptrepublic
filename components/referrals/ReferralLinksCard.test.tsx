// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReferralLinksCard } from "./ReferralLinksCard";

/**
 * ReferralLinksCard (Wave 17). GET/POST /api/referral-links and the revoke
 * endpoint are mocked. Asserts: the LOCKED gate render (threshold + exact
 * standing + a link to /dashboard/trust), the unlocked registry (full
 * ?ref= URL, uses, pills), the create flow (label in the POST body; 403 gate
 * error surfaced), COPY LINK via the clipboard, and the two-step revoke
 * (confirm posts the linkId; cancel posts nothing).
 */

interface MockLink {
  id: string;
  code: string;
  label: string | null;
  createdAt: string;
  revokedAt: string | null;
  uses: number;
}

const h = vi.hoisted(() => ({
  gate: { unlocked: true, finalScore: 80, threshold: 65 },
  links: [] as MockLink[],
  createStatus: 200,
  createBody: {} as Record<string, unknown>,
  calls: [] as Array<{ url: string; body: unknown }>,
}));

const originalFetch = globalThis.fetch;

function liveLink(over: Partial<MockLink> = {}): MockLink {
  return {
    id: "l1",
    code: "bcdfgh2345",
    label: "Poster QR",
    createdAt: "2026-07-01T00:00:00.000Z",
    revokedAt: null,
    uses: 3,
    ...over,
  };
}

beforeEach(() => {
  h.gate = { unlocked: true, finalScore: 80, threshold: 65 };
  h.links = [];
  h.createStatus = 200;
  h.createBody = {
    ok: true,
    link: liveLink({ id: "new", code: "newcode234", label: null, uses: 0 }),
  };
  h.calls = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (init?.method === "POST") h.calls.push({ url, body });
    if (url.includes("/api/referral-links/revoke")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (init?.method === "POST") {
      return new Response(JSON.stringify(h.createBody), { status: h.createStatus });
    }
    return new Response(JSON.stringify({ gate: h.gate, maxActive: 3, links: h.links }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("ReferralLinksCard — locked", () => {
  it("shows the gate with the exact standing and links to the trust ledger", async () => {
    h.gate = { unlocked: false, finalScore: 42, threshold: 65 };
    render(<ReferralLinksCard />);
    const locked = await screen.findByTestId("reflinks-locked");
    expect(locked).toHaveTextContent("Unlocks above 65 — your standing: 42");
    const trustLink = screen.getByRole("link", { name: /trust ledger/i });
    expect(trustLink).toHaveAttribute("href", "/dashboard/trust");
    expect(screen.queryByTestId("reflinks-create-form")).toBeNull();
  });
});

describe("ReferralLinksCard — unlocked", () => {
  it("renders the empty state when no links exist", async () => {
    render(<ReferralLinksCard />);
    expect(await screen.findByTestId("reflinks-empty")).toBeInTheDocument();
    expect(screen.getByTestId("reflinks-create-form")).toBeInTheDocument();
  });

  it("lists links with the full ?ref= URL, uses, and status pills", async () => {
    h.links = [
      liveLink(),
      liveLink({
        id: "l2",
        code: "xyzw234567",
        label: null,
        revokedAt: "2026-07-05T00:00:00.000Z",
        uses: 1,
      }),
    ];
    render(<ReferralLinksCard />);
    const rows = await screen.findAllByTestId("reflink-row");
    expect(rows).toHaveLength(2);
    expect(screen.getAllByTestId("reflink-url")[0]).toHaveTextContent(
      `${window.location.origin}/auth?ref=bcdfgh2345`,
    );
    expect(rows[0]).toHaveTextContent("3 uses");
    expect(rows[1]).toHaveTextContent("1 use");
    const pills = screen.getAllByTestId("reflink-pill");
    expect(pills[0]).toHaveTextContent(/active/i);
    expect(pills[1]).toHaveTextContent(/revoked/i);
    // A revoked link offers no actions.
    expect(rows[1]!.querySelector("[data-testid='reflink-copy']")).toBeNull();
    expect(rows[1]!.querySelector("[data-testid='reflink-revoke']")).toBeNull();
  });

  it("creates a link with the trimmed label in the POST body and reports success", async () => {
    render(<ReferralLinksCard />);
    await screen.findByTestId("reflinks-create-form");
    fireEvent.change(screen.getByTestId("reflink-label-input"), {
      target: { value: "  Poster QR  " },
    });
    fireEvent.click(screen.getByTestId("reflink-create"));
    await waitFor(() => expect(screen.getByTestId("reflinks-status")).toHaveTextContent(/issued/i));
    const create = h.calls.find((c) => c.url.endsWith("/api/referral-links"));
    expect(create?.body).toEqual({ label: "Poster QR" });
  });

  it("surfaces the 403 gate error from the create endpoint", async () => {
    h.createStatus = 403;
    h.createBody = { error: "Referral links unlock above a standing of 65.", finalScore: 60 };
    render(<ReferralLinksCard />);
    await screen.findByTestId("reflinks-create-form");
    fireEvent.click(screen.getByTestId("reflink-create"));
    await waitFor(() =>
      expect(screen.getByTestId("reflinks-status")).toHaveTextContent(/unlock above a standing/i),
    );
  });

  it("COPY LINK writes the full URL to the clipboard", async () => {
    h.links = [liveLink()];
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    render(<ReferralLinksCard />);
    fireEvent.click(await screen.findByTestId("reflink-copy"));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/auth?ref=bcdfgh2345`),
    );
    expect(await screen.findByText(/copied/i)).toBeInTheDocument();
  });

  it("revoke is two-step: cancel posts nothing; confirm posts the linkId", async () => {
    h.links = [liveLink()];
    render(<ReferralLinksCard />);

    // Step 1 → confirm UI; cancel backs out without a request.
    fireEvent.click(await screen.findByTestId("reflink-revoke"));
    fireEvent.click(screen.getByTestId("reflink-revoke-cancel"));
    expect(h.calls.filter((c) => c.url.includes("/revoke"))).toHaveLength(0);
    expect(screen.queryByTestId("reflink-revoke-confirm")).toBeNull();

    // Step 2 → confirm fires the revoke with the link id.
    fireEvent.click(screen.getByTestId("reflink-revoke"));
    fireEvent.click(screen.getByTestId("reflink-revoke-confirm"));
    await waitFor(() =>
      expect(screen.getByTestId("reflinks-status")).toHaveTextContent(/revoked/i),
    );
    const revokes = h.calls.filter((c) => c.url.includes("/revoke"));
    expect(revokes).toHaveLength(1);
    expect(revokes[0]!.body).toEqual({ linkId: "l1" });
  });
});
