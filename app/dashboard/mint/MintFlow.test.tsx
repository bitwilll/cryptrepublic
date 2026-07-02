// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * MintFlow RESUME tests (live report: an applicant waiting on witnesses who
 * revisited /dashboard/mint was shown the Attest form again — re-submitting from
 * OATH_ACCEPTED 400s as "Could not save your attestation", and a blind
 * `witnesses/request` on re-entry would rotate the nonce and WIPE collected
 * signatures). Asserts:
 *  - no application → starts at Attest, never calls witnesses/request
 *  - ATTESTED → resumes at Oath with the saved fields prefilled
 *  - OATH_ACCEPTED + live outstanding request → resumes at Witness with the
 *    collected count, does NOT rotate (witnesses/request never called), BACK is
 *    locked, and the waiting note renders
 *  - OATH_ACCEPTED with NO outstanding request → rotates exactly once to create it
 *  - SEALED (DB record) → sealed state, no re-mint UI
 */

const h = vi.hoisted(() => ({
  application: null as Record<string, unknown> | null,
  witnesses: {
    applicant: null as string | null,
    nameHash: null as string | null,
    nonce: null as string | null,
    deadline: null as string | null,
    signatures: [] as {
      witnessAddress: string;
      signature: string;
      nonce: string;
      deadline: string;
    }[],
  },
  requestCalls: 0,
  accounts: null as { evm: string } | null,
  hasPassport: false,
  hasPassportThrows: true, // default: unregistered chain (the standing posture)
}));

vi.mock("@/lib/config/chain", () => ({
  activeChain: () => ({ primaryChainId: 84532 }),
}));
vi.mock("@/lib/wallet/embedded/session", () => ({
  getAccounts: () => h.accounts,
  isUnlocked: () => false,
}));
vi.mock("@/lib/passport/client", () => ({
  readHasPassport: async () => {
    if (h.hasPassportThrows) throw new Error("unregistered chain");
    return h.hasPassport;
  },
  readRequiredWitnesses: async () => {
    throw new Error("unregistered chain");
  },
}));
vi.mock("@/lib/passport/mint", () => ({
  submitMintEmbedded: vi.fn(),
  StaleAttestationsError: class StaleAttestationsError extends Error {},
}));

import MintFlow from "./MintFlow";

const FUTURE = String(Math.floor(Date.now() / 1000) + 3000);

function sig(i: number) {
  return {
    witnessAddress: `0x${String(i).padStart(40, "0")}`,
    signature: `0x${"ab".repeat(65)}`,
    nonce: "5",
    deadline: FUTURE,
  };
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  h.application = null;
  h.witnesses = { applicant: null, nameHash: null, nonce: null, deadline: null, signatures: [] };
  h.requestCalls = 0;
  h.accounts = null;
  h.hasPassport = false;
  h.hasPassportThrows = true;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/applications/witnesses/request")) {
      h.requestCalls += 1;
      return new Response(
        JSON.stringify({
          domain: {},
          types: {},
          primaryType: "Attestation",
          message: { applicant: "0x0", nameHash: "0x0", nonce: "6", deadline: FUTURE },
          requiredWitnesses: 7,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("/api/applications/witnesses")) {
      return new Response(JSON.stringify(h.witnesses), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/api/applications")) {
      return new Response(JSON.stringify({ application: h.application }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("MintFlow resume", () => {
  it("no application → starts at Attest and never touches witnesses/request", async () => {
    render(<MintFlow />);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /attest who you are/i })).toBeInTheDocument(),
    );
    expect(h.requestCalls).toBe(0);
  });

  it("ATTESTED → resumes at Oath with saved fields prefilled", async () => {
    h.application = {
      status: "ATTESTED",
      name: "Resume Probe",
      domicileCity: "Tallinn",
      hostCountry: "Estonia",
      motto: null,
      citizenTokenId: null,
    };
    render(<MintFlow />);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /oath of entry/i })).toBeInTheDocument(),
    );
    // Prefill proof: the passport preview renders the saved name.
    expect(screen.getByText(/RESUME PROBE/)).toBeInTheDocument();
    expect(h.requestCalls).toBe(0);
  });

  it("OATH_ACCEPTED + live request → Witness step, NO rotation, BACK locked, waiting note", async () => {
    h.application = {
      status: "OATH_ACCEPTED",
      name: "Resume Probe",
      domicileCity: "Tallinn",
      hostCountry: "Estonia",
      motto: "Recognized in time",
      citizenTokenId: null,
    };
    h.witnesses = {
      applicant: "0x00000000000000000000000000000000000000a1",
      nameHash: "0xbeef",
      nonce: "5",
      deadline: FUTURE,
      signatures: [sig(1), sig(2), sig(3)],
    };
    render(<MintFlow />);
    await waitFor(() => expect(screen.getByTestId("witness-waiting-note")).toBeInTheDocument());
    // The collected count is shown; the nonce was NOT rotated (sigs preserved).
    expect(screen.getByTestId("witness-waiting-note")).toHaveTextContent(/3 of 7/);
    expect(h.requestCalls).toBe(0);
    // Steps 0-1 are committed server-side — BACK must not offer re-editing them.
    expect(screen.getByRole("button", { name: /back/i })).toBeDisabled();
  });

  it("OATH_ACCEPTED with NO outstanding request → rotates exactly once to create it", async () => {
    h.application = {
      status: "OATH_ACCEPTED",
      name: "Resume Probe",
      domicileCity: "Tallinn",
      hostCountry: "Estonia",
      motto: "Recognized in time",
      citizenTokenId: null,
    };
    h.witnesses = {
      applicant: null,
      nameHash: null,
      nonce: null,
      deadline: null,
      signatures: [],
    };
    render(<MintFlow />);
    await waitFor(() => expect(h.requestCalls).toBe(1));
    expect(screen.getByTestId("witness-waiting-note")).toBeInTheDocument();
  });

  it("adminApprovedAt + NOT a citizen → 'approved by an administrator' state INSTEAD of witness waiting (Wave 10 A5)", async () => {
    h.application = {
      status: "OATH_ACCEPTED",
      name: "Resume Probe",
      domicileCity: "Tallinn",
      hostCountry: "Estonia",
      motto: "Recognized in time",
      citizenTokenId: null,
      adminApprovedAt: "2026-07-03T00:00:00.000Z",
    };
    // A live witness request exists — the approved state must still win.
    h.witnesses = {
      applicant: "0x00000000000000000000000000000000000000a1",
      nameHash: "0xbeef",
      nonce: "5",
      deadline: FUTURE,
      signatures: [sig(1), sig(2), sig(3)],
    };
    render(<MintFlow />);
    await waitFor(() => expect(screen.getByTestId("admin-approved-state")).toBeInTheDocument());
    expect(screen.getByTestId("admin-approved-state")).toHaveTextContent(
      /approved by an administrator/i,
    );
    expect(screen.getByTestId("admin-approved-state")).toHaveTextContent(
      /being issued by the republic/i,
    );
    // Chain-truth honesty: no fake tokenId/SEALED — and no witness-waiting UI.
    expect(screen.queryByTestId("witness-waiting-note")).not.toBeInTheDocument();
    expect(screen.queryByText(/already sealed/i)).not.toBeInTheDocument();
    // The approved path never touches witnesses/request (no nonce rotation).
    expect(h.requestCalls).toBe(0);
  });

  it("adminApprovedAt + the chain says CITIZEN → the sealed/citizen state WINS (chain truth)", async () => {
    h.application = {
      status: "OATH_ACCEPTED",
      name: "Resume Probe",
      domicileCity: "Tallinn",
      hostCountry: "Estonia",
      motto: "Recognized in time",
      citizenTokenId: null,
      adminApprovedAt: "2026-07-03T00:00:00.000Z",
    };
    h.accounts = { evm: "0x00000000000000000000000000000000000000a1" };
    h.hasPassportThrows = false;
    h.hasPassport = true; // the chain confirms citizenship
    render(<MintFlow />);
    await waitFor(() => expect(screen.getByText(/already a citizen/i)).toBeInTheDocument());
    expect(screen.queryByTestId("admin-approved-state")).not.toBeInTheDocument();
  });

  it("SEALED (DB record) → sealed state with no re-mint UI", async () => {
    h.application = {
      status: "SEALED",
      name: "Resume Probe",
      domicileCity: "Tallinn",
      hostCountry: "Estonia",
      motto: "Recognized in time",
      citizenTokenId: "42",
    };
    render(<MintFlow />);
    await waitFor(() =>
      expect(screen.getByText(/already a citizen|passport is sealed/i)).toBeInTheDocument(),
    );
    expect(screen.queryByRole("heading", { name: /attest who you are/i })).not.toBeInTheDocument();
    expect(h.requestCalls).toBe(0);
  });
});
