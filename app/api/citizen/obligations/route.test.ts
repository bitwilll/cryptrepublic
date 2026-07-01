// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

/**
 * GET /api/citizen/obligations. A session whose resolveApplicantAddress -> null
 * (or readPassportStatusServer -> not a citizen) returns an empty obligations set
 * WITHOUT hitting voteByPassport/claimable. A citizen resolves obligations via
 * readMyVoteServer / readClaimableServer keyed by their tokenId.
 */

const APP = "http://localhost:3000";

const h = vi.hoisted(() => ({
  resolvedAddress: null as `0x${string}` | null,
  isCitizen: false,
  tokenId: null as bigint | null,
  proposalCount: 0n,
  myVote: 0,
  currentEpoch: 0n,
  claimable: 0n,
  voteCalled: false,
  claimableCalled: false,
}));

vi.mock("@/lib/config/chain", () => ({
  activeChain: () => ({ primaryChainId: 31337 }),
}));

vi.mock("@/config/contracts", () => ({
  governanceAvailable: () => true,
  distributorAvailable: () => true,
}));

vi.mock("@/lib/applications/applicant", () => ({
  resolveApplicantAddress: async () => h.resolvedAddress,
}));

vi.mock("@/lib/passport/serverReads", () => ({
  readPassportStatusServer: async () => ({ isCitizen: h.isCitizen, tokenId: h.tokenId }),
}));

vi.mock("@/lib/governance/serverReads", () => ({
  readProposalCountServer: async () => h.proposalCount,
  readProposalServer: async (_c: number, id: bigint) => ({
    proposalId: id,
    state: "Active",
    tally: { forVotes: 0n, againstVotes: 0n, abstainVotes: 0n, snapshotCitizens: 0n },
    start: 0n,
    end: 0n,
    proposer: "0x0000000000000000000000000000000000000000",
    descriptionHash: "0x00",
  }),
  readMyVoteServer: async () => {
    h.voteCalled = true;
    return h.myVote;
  },
}));

vi.mock("@/lib/dividends/serverReads", () => ({
  readCurrentEpochServer: async () => h.currentEpoch,
  readClaimableServer: async () => {
    h.claimableCalled = true;
    return h.claimable;
  },
}));

import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { GET } from "./route";

let userId: string;
let token: string;

function get(cookieToken?: string) {
  const headers: Record<string, string> = {};
  if (cookieToken) headers.cookie = `cr_session=${cookieToken}`;
  return new Request(APP + "/api/citizen/obligations", { headers });
}

describe("GET /api/citizen/obligations", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `obl${Date.now()}@ex.org` } });
    userId = user.id;
    ({ token } = await createSession(userId));
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });
  beforeEach(() => {
    h.resolvedAddress = null;
    h.isCitizen = false;
    h.tokenId = null;
    h.proposalCount = 0n;
    h.myVote = 0;
    h.currentEpoch = 0n;
    h.claimable = 0n;
    h.voteCalled = false;
    h.claimableCalled = false;
  });

  it("401 without a session", async () => {
    const res = await GET(get());
    expect(res.status).toBe(401);
  });

  it("empty obligations WITHOUT chain reads when address is null", async () => {
    h.resolvedAddress = null;
    const res = await GET(get(token));
    const body = (await res.json()) as { isCitizen: boolean; obligations: unknown[] };
    expect(body.isCitizen).toBe(false);
    expect(body.obligations).toEqual([]);
    expect(h.voteCalled).toBe(false);
    expect(h.claimableCalled).toBe(false);
  });

  it("empty obligations WITHOUT chain reads when not a citizen", async () => {
    h.resolvedAddress = "0x00000000000000000000000000000000000000a1";
    h.isCitizen = false;
    const res = await GET(get(token));
    const body = (await res.json()) as { isCitizen: boolean; obligations: unknown[] };
    expect(body.isCitizen).toBe(false);
    expect(h.voteCalled).toBe(false);
    expect(h.claimableCalled).toBe(false);
  });

  it("resolves vote + dividend obligations for a citizen keyed by tokenId", async () => {
    h.resolvedAddress = "0x00000000000000000000000000000000000000a1";
    h.isCitizen = true;
    h.tokenId = 7n;
    h.proposalCount = 1n;
    h.myVote = 0; // not voted -> obligation
    h.currentEpoch = 1n;
    h.claimable = 500n; // unclaimed -> obligation
    const res = await GET(get(token));
    const body = (await res.json()) as {
      isCitizen: boolean;
      tokenId: string;
      obligations: { kind: string }[];
    };
    expect(body.isCitizen).toBe(true);
    expect(body.tokenId).toBe("7");
    expect(h.voteCalled).toBe(true);
    expect(h.claimableCalled).toBe(true);
    expect(body.obligations.some((o) => o.kind === "vote")).toBe(true);
    expect(body.obligations.some((o) => o.kind === "dividend")).toBe(true);
  });
});
