// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

/**
 * POST /api/governance/proposals/[id]/comments — citizen-gated off-chain write.
 * Mirrors attest/route.test.ts (403 origin / 401 no session / 400 bad body) plus
 * the citizen gate: 403 when resolveApplicantAddress -> null, 403 when
 * readHasPassportServer -> false, happy path when both pass.
 */

const APP = "http://localhost:3000";

const h = vi.hoisted(() => ({
  resolvedAddress: null as `0x${string}` | null,
  isCitizen: false,
}));

vi.mock("@/lib/config/chain", () => ({
  activeChain: () => ({ primaryChainId: 31337 }),
}));

vi.mock("@/lib/applications/applicant", () => ({
  resolveApplicantAddress: async () => h.resolvedAddress,
}));

vi.mock("@/lib/passport/serverReads", () => ({
  readHasPassportServer: async () => h.isCitizen,
  readPassportStatusServer: async () => ({
    isCitizen: h.isCitizen,
    tokenId: h.isCitizen ? 7n : null,
  }),
}));

import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { __resetRateLimit } from "@/lib/auth/ratelimit";
import { POST, GET } from "./route";

let userId: string;
let token: string;
let otherUserId: string;
let otherToken: string;

function post(body: unknown, opts: { origin?: string; cookieToken?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.origin) headers.origin = opts.origin;
  if (opts.cookieToken) headers.cookie = `cr_session=${opts.cookieToken}`;
  return new Request(APP + "/api/governance/proposals/3/comments", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: "3" }) };
const GOOD = { proposalId: "3", body: "I dissent, respectfully." };

describe("POST /api/governance/proposals/[id]/comments", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `cmt${Date.now()}@ex.org` } });
    userId = user.id;
    ({ token } = await createSession(userId));
    const other = await prisma.user.create({ data: { email: `cmt2-${Date.now()}@ex.org` } });
    otherUserId = other.id;
    ({ token: otherToken } = await createSession(otherUserId));
  });
  afterAll(async () => {
    await prisma.governanceProposalContent.deleteMany({
      where: { proposalId: "3", chainId: 31337 },
    });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await prisma.$disconnect();
  });
  beforeEach(() => {
    // Reset the in-memory rate limiter between tests: the suite fires many
    // authenticated POSTs as the SAME user, which would otherwise consume the
    // per-user comment budget across tests (mirrors lib/auth/ratelimit.test.ts).
    __resetRateLimit();
    h.resolvedAddress = null;
    h.isCitizen = false;
  });

  it("403 on a foreign origin", async () => {
    const res = await POST(
      post(GOOD, { origin: "https://evil.example", cookieToken: token }),
      params,
    );
    expect(res.status).toBe(403);
  });

  it("401 without a session", async () => {
    const res = await POST(post(GOOD, { origin: APP }), params);
    expect(res.status).toBe(401);
  });

  it("400 on invalid body (unknown key rejected)", async () => {
    const res = await POST(
      post({ proposalId: "3", body: "x", isCitizen: true }, { origin: APP, cookieToken: token }),
      params,
    );
    expect(res.status).toBe(400);
  });

  it("403 when resolveApplicantAddress returns null", async () => {
    h.resolvedAddress = null;
    h.isCitizen = true;
    const res = await POST(post(GOOD, { origin: APP, cookieToken: token }), params);
    expect(res.status).toBe(403);
  });

  it("403 when the resolved address is NOT an on-chain citizen", async () => {
    h.resolvedAddress = "0x00000000000000000000000000000000000000a1";
    h.isCitizen = false;
    const res = await POST(post(GOOD, { origin: APP, cookieToken: token }), params);
    expect(res.status).toBe(403);
  });

  it("happy path persists a comment when the caller is a verified citizen", async () => {
    h.resolvedAddress = "0x00000000000000000000000000000000000000a1";
    h.isCitizen = true;
    const res = await POST(post(GOOD, { origin: APP, cookieToken: token }), params);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      comment: { body: string; citizenTokenId: string };
    };
    expect(body.ok).toBe(true);
    expect(body.comment.body).toBe(GOOD.body);
    expect(body.comment.citizenTokenId).toBe("7");

    // GET returns the persisted comment.
    const getRes = await GET(
      new Request(APP + "/api/governance/proposals/3/comments", {
        headers: { cookie: `cr_session=${token}` },
      }),
      params,
    );
    const getBody = (await getRes.json()) as { comments: { body: string }[] };
    expect(getBody.comments.some((c) => c.body === GOOD.body)).toBe(true);
  });

  it("rate limit: 10 comments succeed, the 11th within the window draws 429 + Retry-After", async () => {
    h.resolvedAddress = "0x00000000000000000000000000000000000000a1";
    h.isCitizen = true;
    for (let i = 0; i < 10; i++) {
      const res = await POST(post(GOOD, { origin: APP, cookieToken: token }), params);
      expect(res.status).toBe(200); // normal use unaffected
    }
    const blocked = await POST(post(GOOD, { origin: APP, cookieToken: token }), params);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("rate limit is per-user: a different user is NOT limited by the first user's hits", async () => {
    h.resolvedAddress = "0x00000000000000000000000000000000000000a1";
    h.isCitizen = true;
    for (let i = 0; i < 10; i++) {
      await POST(post(GOOD, { origin: APP, cookieToken: token }), params);
    }
    const blocked = await POST(post(GOOD, { origin: APP, cookieToken: token }), params);
    expect(blocked.status).toBe(429);
    const other = await POST(post(GOOD, { origin: APP, cookieToken: otherToken }), params);
    expect(other.status).toBe(200);
  });
});
