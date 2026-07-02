// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

/**
 * ChainActionsApp tests (Wave 9 C4). /api/admin/chain/{params,roles} are
 * mocked. Asserts:
 * - available:false → the ONE graceful in-voice card, NO composer forms
 * - params values render per contract; role topology renders CONFIRMED
 *   holders; treasury GOVERNANCE_ROLE annotated as contract-held
 * - the composer's client-side mirror rejects setQuorumBps(10001) inline
 *   WITHOUT producing a card; 2500 produces a card with matching decoded args
 * - the epoch form surfaces the 2-tx nature and produces the 2-tx batch card
 * - the composer sources addresses from /api/admin/chain/params (never the
 *   throwing client-side registry accessors)
 */

const A = {
  token: "0x00000000000000000000000000000000000000B2",
  passport: "0x00000000000000000000000000000000000000A9",
  governance: "0x00000000000000000000000000000000000000D4",
  treasury: "0x00000000000000000000000000000000000000E5",
  distributor: "0x00000000000000000000000000000000000000C3",
  staking: "0x00000000000000000000000000000000000000A1",
} as const;
const ADMIN_HOLDER = "0x0000000000000000000000000000000000000AB1";

const h = vi.hoisted(() => ({ available: true }));

const originalFetch = globalThis.fetch;

import { ChainActionsApp } from "./ChainActionsApp";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const PARAMS = {
  chainId: 31337,
  available: true,
  addresses: A,
  token: { paused: false, maxSupply: "1000000000", totalSupply: "500000" },
  passport: { requiredWitnesses: 2, burnEnabled: false },
  governance: {
    votingPeriod: "604800",
    quorumBps: 2000,
    executionDelay: "172800",
    minCitizensForProposal: "3",
  },
  treasury: {
    totalAllocationBps: 6400,
    allocations: [
      { bucket: "embassy_ops", onchainBps: 3800 },
      { bucket: "reserve", onchainBps: 2600 },
    ],
  },
  distributor: { currentEpoch: "0" },
  staking: { aprBps: 1180, totalStaked: "0", rewardPoolRemaining: "0" },
};

const ROLES = {
  chainId: 31337,
  available: true,
  contracts: [
    {
      contract: "governance",
      address: A.governance,
      roles: [
        { role: "DEFAULT_ADMIN_ROLE", roleId: `0x${"0".repeat(64)}`, holders: [ADMIN_HOLDER] },
      ],
    },
    {
      contract: "treasury",
      address: A.treasury,
      roles: [
        { role: "DEFAULT_ADMIN_ROLE", roleId: `0x${"0".repeat(64)}`, holders: [ADMIN_HOLDER] },
        { role: "GOVERNANCE_ROLE", roleId: `0x${"1".repeat(64)}`, holders: [A.governance] },
      ],
    },
    {
      contract: "distributor",
      address: A.distributor,
      roles: [{ role: "FUNDER_ROLE", roleId: `0x${"2".repeat(64)}`, holders: [ADMIN_HOLDER] }],
    },
    {
      contract: "passport",
      address: A.passport,
      roles: [
        { role: "PASSPORT_ADMIN_ROLE", roleId: `0x${"3".repeat(64)}`, holders: [ADMIN_HOLDER] },
      ],
    },
  ],
};

// Wave 10 A4 — the acting admin's SERVER-resolved verified wallet (addendum #1).
const MY_VERIFIED = vi.hoisted(() => ({
  address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as string | null,
}));

beforeEach(() => {
  h.available = true;
  MY_VERIFIED.address = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/admin/chain/params")) {
      return jsonResponse(
        h.available ? PARAMS : { chainId: 84532, available: false, addresses: {} },
      );
    }
    if (url.includes("/api/admin/chain/roles")) {
      return jsonResponse(
        h.available ? ROLES : { chainId: 84532, available: false, contracts: [] },
      );
    }
    if (url.includes("/api/admin/me")) {
      return jsonResponse({ userId: "admin1", verifiedAddress: MY_VERIFIED.address });
    }
    return jsonResponse({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("ChainActionsApp", () => {
  it("renders the ONE graceful card and NO composer on the unregistered chain", async () => {
    h.available = false;
    render(<ChainActionsApp />);
    await waitFor(() => expect(screen.getByTestId("chain-unavailable")).toBeInTheDocument());
    expect(screen.getByTestId("chain-unavailable")).toHaveTextContent(
      "No admin contracts are registered on this chain.",
    );
    expect(screen.queryByLabelText(/^action$/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("prepared-action-card")).not.toBeInTheDocument();
  });

  it("renders params per contract and the CONFIRMED role topology", async () => {
    render(<ChainActionsApp />);
    await waitFor(() => expect(screen.getByTestId("params-governance")).toBeInTheDocument());
    expect(screen.getByTestId("params-governance")).toHaveTextContent("2000");
    expect(screen.getByTestId("params-staking")).toHaveTextContent("1180");
    expect(screen.getByTestId("params-passport")).toHaveTextContent("2");
    expect(screen.getByTestId("params-treasury")).toHaveTextContent("6400");
    // topology: confirmed holders + the contract-held GOVERNANCE_ROLE annotation
    const topology = screen.getByTestId("role-topology");
    expect(topology).toHaveTextContent(new RegExp(ADMIN_HOLDER));
    expect(topology).toHaveTextContent(/held by the Governance contract/i);
    expect(topology).toHaveTextContent(/hasRole/);
  });

  it("mirrors setQuorumBps bounds inline — 10001 never produces a card", async () => {
    render(<ChainActionsApp />);
    await waitFor(() => expect(screen.getByLabelText(/^action$/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/^action$/i), { target: { value: "set_quorum_bps" } });
    fireEvent.change(screen.getByLabelText(/quorum/i), { target: { value: "10001" } });
    fireEvent.click(screen.getByRole("button", { name: /prepare/i }));
    await waitFor(() => expect(screen.getByTestId("composer-error")).toBeInTheDocument());
    expect(screen.getByTestId("composer-error")).toHaveTextContent(/quorum/i);
    expect(screen.queryByTestId("prepared-action-card")).not.toBeInTheDocument();
  });

  it("prepares setQuorumBps(2500) with matching decoded args + required role", async () => {
    render(<ChainActionsApp />);
    await waitFor(() => expect(screen.getByLabelText(/^action$/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/^action$/i), { target: { value: "set_quorum_bps" } });
    fireEvent.change(screen.getByLabelText(/quorum/i), { target: { value: "2500" } });
    fireEvent.click(screen.getByRole("button", { name: /prepare/i }));
    await waitFor(() => expect(screen.getByTestId("prepared-action-card")).toBeInTheDocument());
    const card = screen.getByTestId("prepared-action-card");
    expect(card).toHaveTextContent(/setQuorumBps\(2500\)/);
    expect(card).toHaveTextContent(new RegExp(A.governance));
    expect(screen.getByTestId("never-signs-label")).toBeInTheDocument();
    // addendum #3: required role + the confirmed holder from the topology
    expect(screen.getByTestId("required-role")).toHaveTextContent(/DEFAULT_ADMIN_ROLE/);
    expect(screen.getByTestId("required-role")).toHaveTextContent(new RegExp(ADMIN_HOLDER));
  });

  it("surfaces the 2-tx nature of the epoch batch and prepares it", async () => {
    render(<ChainActionsApp />);
    await waitFor(() => expect(screen.getByLabelText(/^action$/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/^action$/i), { target: { value: "open_epoch" } });
    // the form itself explains the ordered pair
    expect(screen.getByText(/1\. approve — 2\. openEpoch \(pulls the funds\)/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: /prepare/i }));
    await waitFor(() => expect(screen.getByTestId("prepared-action-card")).toBeInTheDocument());
    const txs = screen.getAllByTestId("prepared-tx");
    expect(txs).toHaveLength(2);
    expect(txs[0]).toHaveTextContent(/approve\(/);
    expect(txs[1]).toHaveTextContent(/openEpoch\(1000\)/);
    // FUNDER_ROLE is the required role for openEpoch
    expect(screen.getByTestId("required-role")).toHaveTextContent(/FUNDER_ROLE/);
  });
});

describe("ChainActionsApp — generic Admin mint (Wave 10 A4)", () => {
  const CHECKSUMMED = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const BAD_CHECKSUM = "0x70997970C51812dc3A010C7d01b50e0d17dc79c8"; // last char case flipped
  const LOWERCASE = CHECKSUMMED.toLowerCase();

  async function selectAdminMint() {
    render(<ChainActionsApp />);
    await waitFor(() => expect(screen.getByLabelText(/^action$/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/^action$/i), { target: { value: "admin_mint" } });
  }

  function fillIdentity() {
    fireEvent.change(screen.getByLabelText(/declared name/i), { target: { value: "Ada Test" } });
    fireEvent.change(screen.getByLabelText(/motto/i), { target: { value: "code is law" } });
    fireEvent.change(screen.getByLabelText(/domicile city/i), { target: { value: "Neo Berlin" } });
  }

  it("lists the action and shows the PROMINENT verify-off-chain warning", async () => {
    await selectAdminMint();
    expect(screen.getByTestId("admin-mint-verify-warning")).toHaveTextContent(
      /verify this address off-chain/i,
    );
    expect(screen.getByTestId("admin-mint-verify-warning")).toHaveTextContent(/cannot revoke/i);
  });

  it("rejects a malformed address inline (no card)", async () => {
    await selectAdminMint();
    fireEvent.change(screen.getByLabelText(/destination address/i), { target: { value: "0x12" } });
    fillIdentity();
    fireEvent.click(screen.getByRole("button", { name: /prepare/i }));
    await waitFor(() => expect(screen.getByTestId("composer-error")).toBeInTheDocument());
    expect(screen.queryByTestId("prepared-action-card")).not.toBeInTheDocument();
  });

  it("rejects a BAD-CHECKSUM mixed-case address (getAddress throws) — no card", async () => {
    await selectAdminMint();
    fireEvent.change(screen.getByLabelText(/destination address/i), {
      target: { value: BAD_CHECKSUM },
    });
    fillIdentity();
    fireEvent.click(screen.getByRole("button", { name: /prepare/i }));
    await waitFor(() => expect(screen.getByTestId("composer-error")).toBeInTheDocument());
    expect(screen.getByTestId("composer-error")).toHaveTextContent(/checksum/i);
    expect(screen.queryByTestId("prepared-action-card")).not.toBeInTheDocument();
  });

  it("accepts a VALID all-lowercase address (addendum #4) and encodes the CHECKSUMMED form", async () => {
    await selectAdminMint();
    fireEvent.change(screen.getByLabelText(/destination address/i), {
      target: { value: LOWERCASE },
    });
    fillIdentity();
    fireEvent.click(screen.getByRole("button", { name: /prepare/i }));
    await waitFor(() => expect(screen.getByTestId("prepared-action-card")).toBeInTheDocument());
    const card = screen.getByTestId("prepared-action-card");
    expect(card).toHaveTextContent(/adminMint/);
    expect(card).toHaveTextContent(new RegExp(CHECKSUMMED)); // normalized, not the raw input
  });

  it("prepares adminMint with the PASSPORT_ADMIN required role", async () => {
    await selectAdminMint();
    fireEvent.change(screen.getByLabelText(/destination address/i), {
      target: { value: CHECKSUMMED },
    });
    fillIdentity();
    fireEvent.click(screen.getByRole("button", { name: /prepare/i }));
    await waitFor(() => expect(screen.getByTestId("prepared-action-card")).toBeInTheDocument());
    expect(screen.getByTestId("prepared-action-card")).toHaveTextContent(/adminMint/);
    expect(screen.getByTestId("never-signs-label")).toBeInTheDocument();
    expect(screen.getByTestId("required-role")).toHaveTextContent(/PASSPORT_ADMIN_ROLE/);
  });

  it("SELF-MINT (addendum #1): 'use MY verified address' fills the SERVER-resolved wallet and prepares adminMint to it", async () => {
    await selectAdminMint();
    fireEvent.click(screen.getByTestId("admin-mint-self-fill"));
    await waitFor(() =>
      expect(screen.getByLabelText(/destination address/i)).toHaveValue(CHECKSUMMED),
    );
    fillIdentity();
    fireEvent.click(screen.getByRole("button", { name: /prepare/i }));
    await waitFor(() => expect(screen.getByTestId("prepared-action-card")).toBeInTheDocument());
    // The composer never re-checks WHOSE address it is — admin-to-self is the
    // same code path; this is the concrete self-mint proof (plan step 1).
    const card = screen.getByTestId("prepared-action-card");
    expect(card).toHaveTextContent(/adminMint/);
    expect(card).toHaveTextContent(new RegExp(CHECKSUMMED));
  });

  it("SELF-MINT with NO verified wallet: shows the reason instead of filling", async () => {
    MY_VERIFIED.address = null;
    await selectAdminMint();
    fireEvent.click(screen.getByTestId("admin-mint-self-fill"));
    await waitFor(() =>
      expect(screen.getByTestId("admin-mint-self-fill-error")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("admin-mint-self-fill-error")).toHaveTextContent(
      /no verified wallet/i,
    );
    expect(screen.getByLabelText(/destination address/i)).toHaveValue("");
  });
});
