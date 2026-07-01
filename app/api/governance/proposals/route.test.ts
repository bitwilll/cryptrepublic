// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

/**
 * GET /api/governance/proposals — representative contract-backed GET. A fresh
 * chain (proposalCount 0) returns [] (honest empty); DB content merges when
 * proposals exist.
 */

const APP = "http://localhost:3000";

const h = vi.hoisted(() => ({
  proposalCount: 0n,
  state: "Active" as string,
}));

vi.mock("@/lib/config/chain", () => ({
  activeChain: () => ({ primaryChainId: 31337 }),
}));

vi.mock("@/config/contracts", () => ({
  governanceAvailable: () => true,
}));

vi.mock("@/lib/governance/serverReads", () => ({
  readProposalCountServer: async () => h.proposalCount,
  readProposalServer: async (_c: number, id: bigint) => ({
    proposalId: id,
    state: h.state,
    tally: { forVotes: 4n, againstVotes: 1n, abstainVotes: 0n, snapshotCitizens: 5n },
    start: 0n,
    end: 0n,
    proposer: "0x0000000000000000000000000000000000000000",
    descriptionHash: "0xdead000000000000000000000000000000000000000000000000000000000001",
  }),
}));

import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { GET } from "./route";

let userId: string;
let token: string;

function get(query = "", cookieToken?: string) {
  const headers: Record<string, string> = {};
  if (cookieToken) headers.cookie = `cr_session=${cookieToken}`;
  return new Request(APP + "/api/governance/proposals" + query, { headers });
}

describe("GET /api/governance/proposals", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `prop${Date.now()}@ex.org` } });
    userId = user.id;
    ({ token } = await createSession(userId));
  });
  afterAll(async () => {
    await prisma.governanceProposalContent.deleteMany({
      where: { proposalId: "1", chainId: 31337 },
    });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });
  beforeEach(() => {
    h.proposalCount = 0n;
    h.state = "Active";
  });

  it("401 without a session", async () => {
    const res = await GET(get());
    expect(res.status).toBe(401);
  });

  it("returns [] on a fresh chain (honest empty)", async () => {
    h.proposalCount = 0n;
    const res = await GET(get("?status=all", token));
    const body = (await res.json()) as { proposals: unknown[] };
    expect(body.proposals).toEqual([]);
  });

  it("merges on-chain tally with DB content when proposals exist", async () => {
    h.proposalCount = 1n;
    await prisma.governanceProposalContent.upsert({
      where: { chainId_proposalId: { chainId: 31337, proposalId: "1" } },
      update: { title: "Test Amendment", tag: "PROCEDURAL", body: "body" },
      create: {
        chainId: 31337,
        proposalId: "1",
        title: "Test Amendment",
        tag: "PROCEDURAL",
        body: "body",
      },
    });
    const res = await GET(get("?status=all", token));
    const body = (await res.json()) as {
      proposals: { proposalId: string; title: string; tally: { forVotes: string } }[];
    };
    expect(body.proposals).toHaveLength(1);
    expect(body.proposals[0].proposalId).toBe("1");
    expect(body.proposals[0].title).toBe("Test Amendment");
    expect(body.proposals[0].tally.forVotes).toBe("4");
  });
});
