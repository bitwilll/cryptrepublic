// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { getAddress, keccak256, stringToHex } from "viem";

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

// The server-resolved mint destination DIFFERS from the stale applicantAddress
// column on purpose: the UI must gate/display on resolvedMintTo / mintParams.to.
const RESOLVED_MINT_TO = getAddress("0x70997970c51812dc3a010c7d01b50e0d17dc79c8");
const PASSPORT_ADDR = "0x00000000000000000000000000000000000000A9";
const PASSPORT_ADMIN_HOLDER = "0x0000000000000000000000000000000000000AB1";

const MINT_PARAMS = {
  to: RESOLVED_MINT_TO,
  nameHash: keccak256(stringToHex("Citizen One")),
  motto: stringToHex("Onward", { size: 32 }),
  domicile: stringToHex("Lisbon", { size: 32 }),
};

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
    resolvedMintTo: RESOLVED_MINT_TO as string | null,
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

const mock = vi.hoisted(() => ({
  detail: null as unknown,
  approve: null as unknown,
  me: { userId: "admin1", verifiedAddress: null as string | null },
  chainAvailable: true,
}));

beforeEach(() => {
  h.posts = [];
  mock.detail = DETAIL;
  mock.approve = { ok: true, alreadyCitizen: false, chainId: 31337, mintParams: MINT_PARAMS };
  mock.me = { userId: "admin1", verifiedAddress: null };
  mock.chainAvailable = true;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST") {
      h.posts.push({ url, body: init.body ? JSON.parse(String(init.body)) : {} });
      if (url.includes("/approve-mint")) return jsonResponse(mock.approve);
      return jsonResponse({ ok: true, application: DETAIL.application });
    }
    if (url.includes("/api/admin/me")) return jsonResponse(mock.me);
    if (url.includes("/api/admin/chain/params")) {
      return jsonResponse(
        mock.chainAvailable
          ? { chainId: 31337, available: true, addresses: { passport: PASSPORT_ADDR } }
          : { chainId: 84532, available: false, addresses: {} },
      );
    }
    if (url.includes("/api/admin/chain/roles")) {
      return jsonResponse(
        mock.chainAvailable
          ? {
              chainId: 31337,
              available: true,
              contracts: [
                {
                  contract: "passport",
                  address: PASSPORT_ADDR,
                  roles: [
                    {
                      role: "PASSPORT_ADMIN_ROLE",
                      roleId: `0x${"3".repeat(64)}`,
                      holders: [PASSPORT_ADMIN_HOLDER],
                    },
                  ],
                },
              ],
            }
          : { chainId: 84532, available: false, contracts: [] },
      );
    }
    if (url.includes("/api/admin/applications/app1")) {
      return jsonResponse(mock.detail);
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

describe("ApplicationDetail — Admin mint override (Wave 10 A4)", () => {
  it("approve → POSTs approve-mint and renders the PREPARED card from the SERVER's mintParams (never signs)", async () => {
    render(<ApplicationDetail applicationId="app1" />);
    await waitFor(() => expect(screen.getByText("citizen@ex.org")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /approve & prepare admin mint/i }));
    await waitFor(() => expect(screen.getByTestId("prepared-action-card")).toBeInTheDocument());

    // The POST hit the approve-mint route with an EMPTY body.
    const approvePosts = h.posts.filter((p) => p.url.includes("/approve-mint"));
    expect(approvePosts).toHaveLength(1);
    expect(approvePosts[0].body).toEqual({});

    // Non-custodial banner + PASSPORT_ADMIN required role from the topology.
    expect(screen.getByTestId("never-signs-label")).toBeInTheDocument();
    expect(screen.getByTestId("required-role")).toHaveTextContent(/PASSPORT_ADMIN_ROLE/);
    expect(screen.getByTestId("required-role")).toHaveTextContent(
      new RegExp(PASSPORT_ADMIN_HOLDER),
    );

    // The destination displayed/encoded is the SERVER's mintParams.to — the
    // stale applicantAddress column value must NOT be the mint destination.
    const card = screen.getByTestId("prepared-action-card");
    expect(card).toHaveTextContent(new RegExp(RESOLVED_MINT_TO));
    expect(card).toHaveTextContent(/adminMint/);
    expect(card).not.toHaveTextContent(/0x00000000000000000000000000000000000000A1/);
  });

  it("resolvedMintTo:null (even with a stale applicantAddress) → DISABLED with the reason, NO card", async () => {
    mock.detail = {
      application: { ...DETAIL.application, resolvedMintTo: null },
    };
    render(<ApplicationDetail applicationId="app1" />);
    await waitFor(() => expect(screen.getByText("citizen@ex.org")).toBeInTheDocument());

    expect(screen.getByTestId("approve-mint-disabled")).toHaveTextContent(
      /no verified wallet — adminMint needs a destination/i,
    );
    expect(
      screen.queryByRole("button", { name: /approve & prepare admin mint/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("prepared-action-card")).not.toBeInTheDocument();
  });

  it("alreadyCitizen:true → the AlreadyCitizen note, NO prepared card export", async () => {
    mock.approve = { ok: true, alreadyCitizen: true, chainId: 31337, mintParams: MINT_PARAMS };
    render(<ApplicationDetail applicationId="app1" />);
    await waitFor(() => expect(screen.getByText("citizen@ex.org")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /approve & prepare admin mint/i }));
    await waitFor(() => expect(screen.getByTestId("already-citizen")).toBeInTheDocument());
    expect(screen.getByTestId("already-citizen")).toHaveTextContent(/AlreadyCitizen/);
    expect(screen.queryByTestId("prepared-action-card")).not.toBeInTheDocument();
  });

  it("chain unregistered → graceful note + the resolved params still shown for manual composition", async () => {
    mock.chainAvailable = false;
    render(<ApplicationDetail applicationId="app1" />);
    await waitFor(() => expect(screen.getByText("citizen@ex.org")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /approve & prepare admin mint/i }));
    await waitFor(() => expect(screen.getByTestId("approve-mint-params")).toBeInTheDocument());
    expect(screen.getByTestId("approve-mint-params")).toHaveTextContent(
      new RegExp(RESOLVED_MINT_TO),
    );
    expect(screen.queryByTestId("prepared-action-card")).not.toBeInTheDocument();
  });

  it("states the off-chain-intent honesty line (approval is not citizenship)", async () => {
    render(<ApplicationDetail applicationId="app1" />);
    await waitFor(() => expect(screen.getByText("citizen@ex.org")).toBeInTheDocument());
    expect(screen.getByText(/approval is off-chain intent/i)).toBeInTheDocument();
    expect(screen.getByText(/this panel never signs/i)).toBeInTheDocument();
  });

  it("shows the SELF-MINT note when the application belongs to the acting admin", async () => {
    mock.me = { userId: "u2", verifiedAddress: RESOLVED_MINT_TO }; // == app.userId
    render(<ApplicationDetail applicationId="app1" />);
    await waitFor(() => expect(screen.getByText("citizen@ex.org")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("self-mint-note")).toBeInTheDocument());
    expect(screen.getByTestId("self-mint-note")).toHaveTextContent(/your own/i);
  });
});
