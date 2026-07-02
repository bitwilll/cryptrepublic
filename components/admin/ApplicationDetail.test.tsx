// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

/**
 * ApplicationDetail tests (Wave 9 C2). /api/admin/applications/[id] + the
 * review POST are mocked. Asserts (constraint #6 — off-chain-honest):
 * - witness signatures render (PUBLIC data)
 * - the chain-cache fields carry the CHAIN-DERIVED (not authoritative) tag
 * - SAVE REVIEW posts ONLY { kycStatus?, reviewNote? }
 * - there is NO status-editing affordance: the only select is the KYC one and
 *   no application-status value is offered as an option
 */

const h = vi.hoisted(() => ({
  posts: [] as Array<{ url: string; body: Record<string, unknown> }>,
}));

const originalFetch = globalThis.fetch;

import { ApplicationDetail } from "./ApplicationDetail";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const DETAIL = {
  application: {
    id: "app1",
    userId: "u2",
    status: "WITNESSED",
    kycStatus: "PENDING",
    reviewNote: null,
    name: "Citizen One",
    domicileCity: "Lisbon",
    hostCountry: "Portugal",
    motto: "Onward",
    oathAcceptedAt: "2026-06-30T00:00:00.000Z",
    applicantAddress: "0x00000000000000000000000000000000000000A1",
    witnessNonce: "1",
    witnessDeadline: "2026-07-30T00:00:00.000Z",
    createdAt: "2026-06-29T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    user: { email: "citizen@ex.org", name: "Citizen One" },
    witnessSignatures: [
      {
        id: "w1",
        witnessAddress: "0x00000000000000000000000000000000000000B2",
        signature: "0xsig",
        nonce: "1",
        deadline: "2026-07-30T00:00:00.000Z",
        createdAt: "2026-06-30T12:00:00.000Z",
      },
    ],
    chainCache: {
      chainDerived: true,
      sealTxHash: "0xsealhash",
      citizenTokenId: "7",
      sealedAt: null,
    },
  },
};

beforeEach(() => {
  h.posts = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST") {
      h.posts.push({ url, body: init.body ? JSON.parse(String(init.body)) : {} });
      return jsonResponse({ ok: true, application: DETAIL.application });
    }
    if (url.includes("/api/admin/applications/app1")) {
      return jsonResponse(DETAIL);
    }
    return jsonResponse({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("ApplicationDetail", () => {
  it("renders the declared fields and witness signatures", async () => {
    render(<ApplicationDetail applicationId="app1" />);
    await waitFor(() => expect(screen.getByText("citizen@ex.org")).toBeInTheDocument());
    expect(screen.getByText(/Lisbon/)).toBeInTheDocument();
    expect(screen.getByText("0x00000000000000000000000000000000000000B2")).toBeInTheDocument();
  });

  it("labels the chain-cache fields CHAIN-DERIVED (not authoritative)", async () => {
    render(<ApplicationDetail applicationId="app1" />);
    await waitFor(() => expect(screen.getByText(/0xsealhash/)).toBeInTheDocument());
    const tags = screen.getAllByTestId("chain-derived-tag");
    expect(tags.length).toBeGreaterThan(0);
    expect(tags[0]).toHaveTextContent(/chain-derived/i);
    expect(tags[0]).toHaveTextContent(/not authoritative/i);
  });

  it("SAVE REVIEW posts ONLY kycStatus + reviewNote", async () => {
    render(<ApplicationDetail applicationId="app1" />);
    await waitFor(() => expect(screen.getByText("citizen@ex.org")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/kyc status/i), { target: { value: "APPROVED" } });
    fireEvent.change(screen.getByLabelText(/review note/i), {
      target: { value: "Docs verified." },
    });
    fireEvent.click(screen.getByRole("button", { name: /save review/i }));
    await waitFor(() => expect(h.posts.length).toBe(1));
    expect(h.posts[0].url).toContain("/api/admin/applications/app1/review");
    expect(h.posts[0].body).toEqual({ kycStatus: "APPROVED", reviewNote: "Docs verified." });
    expect(Object.keys(h.posts[0].body).sort()).toEqual(["kycStatus", "reviewNote"]);
  });

  it("offers NO status-editing affordance (off-chain-honest)", async () => {
    render(<ApplicationDetail applicationId="app1" />);
    await waitFor(() => expect(screen.getByText("citizen@ex.org")).toBeInTheDocument());
    // the ONLY select is the KYC one …
    const selects = screen.getAllByRole("combobox");
    expect(selects).toHaveLength(1);
    expect(selects[0]).toHaveAccessibleName(/kyc status/i);
    // … and it never offers an application-status value
    for (const s of ["DRAFT", "ATTESTED", "OATH_ACCEPTED", "WITNESSED", "SEALED"]) {
      expect(within(selects[0]).queryByRole("option", { name: s })).not.toBeInTheDocument();
    }
    // no editable field for the status or the chain cache
    expect(screen.queryByLabelText(/^status$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/seal|token/i)).not.toBeInTheDocument();
  });

  it("shows error + RETRY when the detail fetch fails", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ error: "boom" }, 500),
    ) as unknown as typeof fetch;
    render(<ApplicationDetail applicationId="app1" />);
    await waitFor(() => expect(screen.getByTestId("application-detail-error")).toBeInTheDocument());
  });
});
