// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Governance read client tests. `publicClientFor` is mocked so no live chain is
 * needed. Asserts readProposal maps getVotes + state + proposals() into an
 * OnchainProposal with the correct PROPOSAL_STATE label (Queued between Defeated
 * and Succeeded), and readProposalCount returns the bigint.
 */

const GOV = "0x1111111111111111111111111111111111111111" as `0x${string}`;

const h = vi.hoisted(() => ({
  proposalCount: 0n,
  stateOrdinal: 1, // Active
  votes: [0n, 0n, 0n, 0n] as [bigint, bigint, bigint, bigint],
  struct: [
    "0x00000000000000000000000000000000000000aa",
    100n, // start
    200n, // end
    5n, // snapshotCitizens
    0n,
    0n,
    0n,
    false,
    false,
    "0xdead000000000000000000000000000000000000000000000000000000000001",
    "0x0000000000000000000000000000000000000000",
    0n,
    "0x",
  ] as const,
  myVote: 0,
}));

vi.mock("@/config/contracts", () => ({
  governanceAddress: () => GOV,
}));

vi.mock("@/lib/wallet/services/evmClients", () => ({
  publicClientFor: () => ({
    async readContract({ functionName }: { functionName: string }) {
      switch (functionName) {
        case "proposalCount":
          return h.proposalCount;
        case "getVotes":
          return h.votes;
        case "state":
          return h.stateOrdinal;
        case "proposals":
          return h.struct;
        case "voteByPassport":
          return h.myVote;
        case "quorumBps":
          return 2000;
        case "votingPeriod":
          return 259200n;
        case "minCitizensForProposal":
          return 3n;
        default:
          throw new Error(`unexpected read ${functionName}`);
      }
    },
  }),
}));

import { readProposal, readProposalCount, readMyVote, readGovernanceParams } from "./client";

beforeEach(() => {
  h.proposalCount = 0n;
  h.stateOrdinal = 1;
  h.votes = [0n, 0n, 0n, 0n];
  h.myVote = 0;
});

describe("readProposalCount", () => {
  it("returns the on-chain count as a bigint", async () => {
    h.proposalCount = 7n;
    expect(await readProposalCount(31337)).toBe(7n);
  });
});

describe("readProposal", () => {
  it("maps getVotes + state + proposals() into an OnchainProposal", async () => {
    h.stateOrdinal = 3; // Queued
    h.votes = [4n, 1n, 2n, 5n];
    const p = await readProposal(31337, 1n);
    expect(p.proposalId).toBe(1n);
    expect(p.state).toBe("Queued"); // Queued between Defeated and Succeeded
    expect(p.tally).toEqual({
      forVotes: 4n,
      againstVotes: 1n,
      abstainVotes: 2n,
      snapshotCitizens: 5n,
    });
    expect(p.start).toBe(100n);
    expect(p.end).toBe(200n);
    expect(p.descriptionHash).toBe(
      "0xdead000000000000000000000000000000000000000000000000000000000001",
    );
  });

  it("labels the Active state (ordinal 1)", async () => {
    h.stateOrdinal = 1;
    const p = await readProposal(31337, 1n);
    expect(p.state).toBe("Active");
  });
});

describe("readMyVote", () => {
  it("returns the Vote enum ordinal", async () => {
    h.myVote = 1; // For
    expect(await readMyVote(31337, 1n, 9n)).toBe(1);
  });
});

describe("readGovernanceParams", () => {
  it("reads quorum/votingPeriod/minCitizens", async () => {
    const params = await readGovernanceParams(31337);
    expect(params.quorumBps).toBe(2000);
    expect(params.votingPeriod).toBe(259200n);
    expect(params.minCitizensForProposal).toBe(3n);
  });
});
