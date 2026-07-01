// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

/**
 * GovernanceApp tests. The governance read client, the castVote writers,
 * `useCitizen`, the embedded session, and the `/api/governance/*` fetches are
 * mocked so the screen renders without a live chain. Asserts (§7.8, constraints
 * #3/#5/#9):
 * - a fresh chain (no proposals) → the honest "no open amendments" empty state
 * - a citizen sees ENABLED vote buttons; casting calls castVoteEmbedded with the
 *   correct (proposalId, tokenId, support)
 * - a non-citizen sees DISABLED vote buttons + a mint nudge
 * - after a successful vote the panel reflects success
 * - the tally bar reflects the on-chain getVotes numbers (not hardcoded)
 */

const h = vi.hoisted(() => ({
  isCitizen: true,
  tokenId: 7n as bigint | null,
  proposals: [] as Array<Record<string, unknown>>,
  myVote: 0,
  castArgs: null as null | [number, bigint, bigint, number],
  castThrows: null as string | null,
}));

vi.mock("@/components/shell/SessionCitizenProvider", () => ({
  useCitizen: () => ({
    address: "0x00000000000000000000000000000000000000A1",
    isCitizen: h.isCitizen,
    tokenId: h.tokenId,
    loading: false,
    refresh: () => {},
  }),
}));

vi.mock("@/lib/hooks/useChainInfo", () => ({
  useChainInfo: () => ({
    chainId: 31337,
    chainName: "Anvil",
    blockNumber: 100n,
    gasMaxFeePerGasWei: null,
    explorerBase: null,
    online: true,
  }),
}));

vi.mock("@/lib/config/chain", () => ({
  activeChain: () => ({ primaryChainId: 31337 }),
}));

vi.mock("@/lib/wallet/embedded/session", () => ({
  isUnlocked: () => true,
  unlock: async () => ({ evm: "0x00000000000000000000000000000000000000A1" }),
}));

vi.mock("@/lib/governance/client", () => ({
  readMyVote: async () => h.myVote,
}));

vi.mock("@/lib/governance/write", () => ({
  castVoteEmbedded: async (
    chainId: number,
    proposalId: bigint,
    tokenId: bigint,
    support: number,
  ) => {
    if (h.castThrows) throw new Error(h.castThrows);
    h.castArgs = [chainId, proposalId, tokenId, support];
    return "0xvotehash" as `0x${string}`;
  },
}));

vi.mock("@/lib/governance/abi", () => ({
  VOTE: { None: 0, For: 1, Against: 2, Abstain: 3 },
  PROPOSAL_STATE: ["Pending", "Active", "Defeated", "Queued", "Succeeded", "Executed", "Cancelled"],
}));

const originalFetch = globalThis.fetch;

import { GovernanceApp } from "./GovernanceApp";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  h.isCitizen = true;
  h.tokenId = 7n;
  h.proposals = [];
  h.myVote = 0;
  h.castArgs = null;
  h.castThrows = null;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/governance/proposals/") && url.includes("/comments")) {
      return jsonResponse({ comments: [] });
    }
    if (url.includes("/api/governance/proposals")) {
      return jsonResponse({ available: true, proposals: h.proposals });
    }
    return jsonResponse({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const ACTIVE_PROPOSAL = {
  proposalId: "1",
  state: "Active",
  tally: {
    forVotes: "12",
    againstVotes: "3",
    abstainVotes: "1",
    snapshotCitizens: "20",
  },
  start: "0",
  end: "999999999",
  proposer: "0x00000000000000000000000000000000000000B2",
  descriptionHash: "0xabc",
  title: "Embassy Quorum Threshold",
  tag: "PROCEDURAL",
  body: "Reduce the minimum attestation.",
};

describe("GovernanceApp", () => {
  it("shows the honest 'no open amendments' empty state on a fresh chain", async () => {
    h.proposals = [];
    render(<GovernanceApp />);
    await waitFor(() => expect(screen.getByTestId("amendments-empty")).toBeInTheDocument());
    expect(screen.queryByText(/Embassy Quorum Threshold/)).not.toBeInTheDocument();
  });

  it("renders the tally from on-chain getVotes numbers (not hardcoded)", async () => {
    h.proposals = [ACTIVE_PROPOSAL];
    render(<GovernanceApp />);
    await waitFor(() =>
      expect(screen.getAllByText(/Embassy Quorum Threshold/).length).toBeGreaterThan(0),
    );
    const tally = screen.getByTestId("vote-tally");
    expect(tally).toHaveTextContent(/12/);
    expect(tally).toHaveTextContent(/3/);
    expect(tally).toHaveTextContent(/1/);
    // no fabricated mockup numbers
    expect(tally).not.toHaveTextContent(/13 421/);
  });

  it("a citizen can cast a vote; castVoteEmbedded is called with (proposalId, tokenId, support)", async () => {
    h.proposals = [ACTIVE_PROPOSAL];
    render(<GovernanceApp />);
    await waitFor(() => expect(screen.getByTestId("cast-vote-panel")).toBeInTheDocument());
    const yea = screen.getByRole("button", { name: /vote yea/i });
    expect(yea).not.toBeDisabled();
    fireEvent.click(yea);
    await waitFor(() => expect(h.castArgs).not.toBeNull());
    // (chainId, proposalId=1n, tokenId=7n, support=For=1)
    expect(h.castArgs).toEqual([31337, 1n, 7n, 1]);
  });

  it("a non-citizen sees DISABLED vote buttons + a mint nudge", async () => {
    h.isCitizen = false;
    h.tokenId = null;
    h.proposals = [ACTIVE_PROPOSAL];
    render(<GovernanceApp />);
    await waitFor(() => expect(screen.getByTestId("cast-vote-panel")).toBeInTheDocument());
    const panel = screen.getByTestId("cast-vote-panel");
    expect(within(panel).getAllByText(/mint your passport/i).length).toBeGreaterThan(0);
    const yea = within(panel).getByRole("button", { name: /vote yea/i });
    expect(yea).toBeDisabled();
  });

  it("surfaces a castVote revert (already voted) in the error state", async () => {
    h.proposals = [ACTIVE_PROPOSAL];
    h.castThrows = "already voted";
    render(<GovernanceApp />);
    await waitFor(() => expect(screen.getByTestId("cast-vote-panel")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /vote yea/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/already voted/i));
  });
});
