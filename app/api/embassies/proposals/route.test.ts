// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { getAddress, keccak256, stringToHex } from "viem";
import { canonicalEmbassyContent } from "@/lib/validation/dashboard";

/**
 * POST /api/embassies/proposals — citizen-gated + authorship/hash-bound.
 * Asserts 403 origin / 401 no session / 400 bad body, 403 resolve->null,
 * 403 not-a-citizen, 403 proposer!==caller (authorship spoof), 400 content/hash
 * mismatch, 400 when proposalId/txHash absent (now required), and happy path.
 */

const APP = "http://localhost:3000";
const CALLER = getAddress("0x00000000000000000000000000000000000000a1");
const OTHER = getAddress("0x00000000000000000000000000000000000000b2");

const CONTENT = {
  code: "PAR",
  name: "Paris",
  neighborhood: "Le Marais",
  city: "Paris",
  country: "France",
};
const GOOD_HASH = keccak256(stringToHex(canonicalEmbassyContent(CONTENT)));

const h = vi.hoisted(() => ({
  resolvedAddress: null as `0x${string}` | null,
  isCitizen: false,
  onchainProposer: "0x00000000000000000000000000000000000000a1" as `0x${string}`,
  onchainDescriptionHash: "0x00" as `0x${string}`,
}));

vi.mock("@/lib/config/chain", () => ({
  activeChain: () => ({ primaryChainId: 31337 }),
}));

vi.mock("@/lib/applications/applicant", () => ({
  resolveApplicantAddress: async () => h.resolvedAddress,
}));

vi.mock("@/lib/passport/serverReads", () => ({
  readHasPassportServer: async () => h.isCitizen,
}));

vi.mock("@/lib/governance/serverReads", () => ({
  readGovernanceParamServer: async () => ({
    proposer: h.onchainProposer,
    descriptionHash: h.onchainDescriptionHash,
  }),
}));

import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { __resetRateLimit } from "@/lib/auth/ratelimit";
import { POST } from "./route";

let userId: string;
let token: string;
let otherUserId: string;
let otherToken: string;

function post(body: unknown, opts: { origin?: string; cookieToken?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.origin) headers.origin = opts.origin;
  if (opts.cookieToken) headers.cookie = `cr_session=${opts.cookieToken}`;
  return new Request(APP + "/api/embassies/proposals", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const GOOD = { ...CONTENT, proposalId: "5", txHash: "0xabc123" };

describe("POST /api/embassies/proposals", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `emb${Date.now()}@ex.org` } });
    userId = user.id;
    ({ token } = await createSession(userId));
    const other = await prisma.user.create({ data: { email: `emb2-${Date.now()}@ex.org` } });
    otherUserId = other.id;
    ({ token: otherToken } = await createSession(otherUserId));
  });
  afterAll(async () => {
    await prisma.governanceProposalContent.deleteMany({
      where: { proposalId: "5", chainId: 31337 },
    });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await prisma.$disconnect();
  });
  beforeEach(() => {
    // Reset the in-memory rate limiter between tests: this suite fires six
    // authenticated POSTs as the SAME user (five rejection cases + the happy
    // path) — without the reset the per-user 5/15min budget would 429 the
    // pre-existing happy path (mirrors lib/auth/ratelimit.test.ts).
    __resetRateLimit();
    h.resolvedAddress = CALLER;
    h.isCitizen = true;
    h.onchainProposer = CALLER;
    h.onchainDescriptionHash = GOOD_HASH;
  });

  it("403 on a foreign origin", async () => {
    const res = await POST(post(GOOD, { origin: "https://evil.example", cookieToken: token }));
    expect(res.status).toBe(403);
  });

  it("401 without a session", async () => {
    const res = await POST(post(GOOD, { origin: APP }));
    expect(res.status).toBe(401);
  });

  it("400 when proposalId/txHash are absent (now required)", async () => {
    const { proposalId: _p, txHash: _t, ...noIds } = GOOD;
    const res = await POST(post(noIds, { origin: APP, cookieToken: token }));
    expect(res.status).toBe(400);
  });

  it("403 when resolveApplicantAddress returns null", async () => {
    h.resolvedAddress = null;
    const res = await POST(post(GOOD, { origin: APP, cookieToken: token }));
    expect(res.status).toBe(403);
  });

  it("403 when the resolved address is NOT an on-chain citizen", async () => {
    h.isCitizen = false;
    const res = await POST(post(GOOD, { origin: APP, cookieToken: token }));
    expect(res.status).toBe(403);
  });

  it("403 when proposer !== caller (authorship spoof)", async () => {
    h.onchainProposer = OTHER;
    const res = await POST(post(GOOD, { origin: APP, cookieToken: token }));
    expect(res.status).toBe(403);
  });

  it("400 when keccak256(content) !== on-chain descriptionHash", async () => {
    h.onchainDescriptionHash = keccak256(stringToHex("different content"));
    const res = await POST(post(GOOD, { origin: APP, cookieToken: token }));
    expect(res.status).toBe(400);
  });

  it("happy path binds content to the on-chain proposal and persists", async () => {
    const res = await POST(post(GOOD, { origin: APP, cookieToken: token }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; proposalContentId: string; txHash: string };
    expect(body.ok).toBe(true);
    expect(body.txHash).toBe("0xabc123");

    const row = await prisma.governanceProposalContent.findUnique({
      where: { chainId_proposalId: { chainId: 31337, proposalId: "5" } },
    });
    expect(row?.descriptionHash?.toLowerCase()).toBe(GOOD_HASH.toLowerCase());
  });

  it("rate limit: 5 proposals succeed, the 6th within the window draws 429 + Retry-After", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await POST(post(GOOD, { origin: APP, cookieToken: token }));
      expect(res.status).toBe(200); // normal use unaffected
    }
    const blocked = await POST(post(GOOD, { origin: APP, cookieToken: token }));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("rate limit is per-user: a different user is NOT limited by the first user's hits", async () => {
    for (let i = 0; i < 5; i++) {
      await POST(post(GOOD, { origin: APP, cookieToken: token }));
    }
    const blocked = await POST(post(GOOD, { origin: APP, cookieToken: token }));
    expect(blocked.status).toBe(429);
    const other = await POST(post(GOOD, { origin: APP, cookieToken: otherToken }));
    expect(other.status).toBe(200);
  });
});
