// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createChallenge } from "@/lib/auth/qrLogin/challenge";
import { __resetRateLimit } from "@/lib/auth/ratelimit";
import { GET as statusGet } from "./route";

/**
 * GET /api/auth/qr/status — device A poll. Opaque status; on the winning
 * `approved` poll it consumes the challenge (single-use), re-checks suspended,
 * and sets the session cookie on THIS response.
 */

const APP = "http://localhost:3000";
let activeUserId: string;
let suspendedUserId: string;
const createdUsers: string[] = [];
const createdChallenges: string[] = [];

function statusReq(challengeId: string): Request {
  return new Request(`${APP}/api/auth/qr/status?challengeId=${encodeURIComponent(challengeId)}`, {
    method: "GET",
  });
}

async function approvedChallengeFor(userId: string): Promise<string> {
  const c = await createChallenge();
  createdChallenges.push(c.challengeId);
  await prisma.walletLoginChallenge.update({
    where: { id: c.challengeId },
    data: { status: "approved", userId },
  });
  return c.challengeId;
}

describe("GET /api/auth/qr/status", () => {
  beforeAll(async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const u = await prisma.user.create({ data: { email: `qr-status-${suffix}@w13.example` } });
    const s = await prisma.user.create({
      data: { email: `qr-status-susp-${suffix}@w13.example`, suspendedAt: new Date() },
    });
    activeUserId = u.id;
    suspendedUserId = s.id;
    createdUsers.push(u.id, s.id);
  });

  beforeEach(() => __resetRateLimit());

  afterAll(async () => {
    await prisma.walletLoginChallenge.deleteMany({ where: { id: { in: createdChallenges } } });
    await prisma.session.deleteMany({ where: { userId: { in: createdUsers } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    await prisma.$disconnect();
  });

  it("unknown/empty challengeId → expired", async () => {
    expect(await (await statusGet(statusReq("does-not-exist"))).json()).toEqual({
      status: "expired",
    });
    expect(await (await statusGet(statusReq(""))).json()).toEqual({ status: "expired" });
  });

  it("a pending challenge → pending (no cookie)", async () => {
    const c = await createChallenge();
    createdChallenges.push(c.challengeId);
    const res = await statusGet(statusReq(c.challengeId));
    expect(await res.json()).toEqual({ status: "pending" });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("an approved challenge → approved + a session cookie, and it becomes consumed", async () => {
    const id = await approvedChallengeFor(activeUserId);
    const res = await statusGet(statusReq(id));
    const body = await res.json();
    expect(body.status).toBe("approved");
    expect(body.next).toBe("/dashboard");
    expect(res.headers.get("set-cookie")).toMatch(/cr_session=/);
    const row = await prisma.walletLoginChallenge.findUnique({ where: { id } });
    expect(row?.status).toBe("consumed");
    expect(row?.consumedAt).not.toBeNull();
  });

  it("a second poll of the same challenge → expired + NO cookie (single-use)", async () => {
    const id = await approvedChallengeFor(activeUserId);
    expect((await statusGet(statusReq(id))).status).toBe(200); // first consumes
    const res2 = await statusGet(statusReq(id));
    expect(await res2.json()).toEqual({ status: "expired" });
    expect(res2.headers.get("set-cookie")).toBeNull();
  });

  it("an approved challenge for a suspended user → expired + no cookie (still consumed)", async () => {
    const id = await approvedChallengeFor(suspendedUserId);
    const res = await statusGet(statusReq(id));
    expect(await res.json()).toEqual({ status: "expired" });
    expect(res.headers.get("set-cookie")).toBeNull();
    const row = await prisma.walletLoginChallenge.findUnique({ where: { id } });
    expect(row?.status).toBe("consumed");
  });
});
