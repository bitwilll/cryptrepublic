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
  ],
};

beforeEach(() => {
  h.available = true;
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
