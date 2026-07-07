// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { COMMISSARY } from "@/lib/content/commissary";

import { GET, POST, DELETE } from "./route";

/**
 * /api/commissary/interest (Wave 15). Real prisma against the local sqlite db.
 * Asserts the route contract: GET is public (counts + mine-with-session);
 * POST/DELETE demand origin + session, validate { itemId } against the
 * catalogue, upsert idempotently, and only ever touch the caller's own rows.
 * Count assertions are BASELINE-RELATIVE so pre-existing rows from other runs
 * never flake the suite.
 */

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const emailA = `comm-a-${suffix}@w15comm.example`;
const emailB = `comm-b-${suffix}@w15comm.example`;

const ITEM = COMMISSARY[0].id; // a real catalogue id
const ITEM2 = COMMISSARY[1].id;

let userAId: string;
let userBId: string;
let tokenA: string;
let tokenB: string;

function reqOf(
  method: "POST" | "DELETE",
  body: unknown,
  opts: { token?: string; origin?: string | null } = {},
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.origin !== null) headers.origin = opts.origin ?? APP;
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(APP + "/api/commissary/interest", {
    method,
    headers,
    body: JSON.stringify(body),
  });
}

function getReq(opts: { token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(APP + "/api/commissary/interest", { method: "GET", headers });
}

async function countsOf(): Promise<Record<string, number>> {
  const res = await GET(getReq());
  expect(res.status).toBe(200);
  return (await res.json()).counts as Record<string, number>;
}

beforeAll(async () => {
  const a = await prisma.user.create({ data: { email: emailA } });
  const b = await prisma.user.create({ data: { email: emailB } });
  userAId = a.id;
  userBId = b.id;
  ({ token: tokenA } = await createSession(userAId));
  ({ token: tokenB } = await createSession(userBId));
});

beforeEach(async () => {
  await prisma.commissaryInterest.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
});

afterAll(async () => {
  await prisma.commissaryInterest.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  await prisma.$disconnect();
});

describe("POST /api/commissary/interest", () => {
  it("403 on a foreign origin", async () => {
    const res = await POST(
      reqOf("POST", { itemId: ITEM }, { token: tokenA, origin: "https://evil.example" }),
    );
    expect(res.status).toBe(403);
  });

  it("401 without a session", async () => {
    expect((await POST(reqOf("POST", { itemId: ITEM }))).status).toBe(401);
  });

  it("400 on a malformed body (non-JSON / unknown key / wrong type)", async () => {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      origin: APP,
      cookie: `cr_session=${tokenA}`,
    };
    const nonJson = new Request(APP + "/api/commissary/interest", {
      method: "POST",
      headers,
      body: "not json",
    });
    expect((await POST(nonJson)).status).toBe(400);
    expect((await POST(reqOf("POST", { zz: 1 }, { token: tokenA }))).status).toBe(400);
    expect((await POST(reqOf("POST", { itemId: 7 }, { token: tokenA }))).status).toBe(400);
    expect(
      (await POST(reqOf("POST", { itemId: ITEM, extra: true }, { token: tokenA }))).status,
    ).toBe(400);
  });

  it("400 for an itemId not in the catalogue", async () => {
    const res = await POST(reqOf("POST", { itemId: "not-a-real-item" }, { token: tokenA }));
    expect(res.status).toBe(400);
  });

  it("200 happy path → a row exists for the session user", async () => {
    const res = await POST(reqOf("POST", { itemId: ITEM }, { token: tokenA }));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    const row = await prisma.commissaryInterest.findUnique({
      where: { userId_itemId: { userId: userAId, itemId: ITEM } },
    });
    expect(row).not.toBeNull();
  });

  it("registering twice is idempotent (upsert) — still exactly one row", async () => {
    expect((await POST(reqOf("POST", { itemId: ITEM }, { token: tokenA }))).status).toBe(200);
    expect((await POST(reqOf("POST", { itemId: ITEM }, { token: tokenA }))).status).toBe(200);
    const n = await prisma.commissaryInterest.count({
      where: { userId: userAId, itemId: ITEM },
    });
    expect(n).toBe(1);
  });
});

describe("GET /api/commissary/interest", () => {
  it("is public: 200 without a session, mine empty", async () => {
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mine).toEqual([]);
    expect(typeof body.counts).toBe("object");
  });

  it("counts aggregate across users (baseline-relative)", async () => {
    const before = await countsOf();
    await POST(reqOf("POST", { itemId: ITEM }, { token: tokenA }));
    await POST(reqOf("POST", { itemId: ITEM }, { token: tokenB }));
    await POST(reqOf("POST", { itemId: ITEM2 }, { token: tokenB }));
    const after = await countsOf();
    expect((after[ITEM] ?? 0) - (before[ITEM] ?? 0)).toBe(2);
    expect((after[ITEM2] ?? 0) - (before[ITEM2] ?? 0)).toBe(1);
  });

  it("mine lists only the session user's itemIds", async () => {
    await POST(reqOf("POST", { itemId: ITEM }, { token: tokenA }));
    await POST(reqOf("POST", { itemId: ITEM2 }, { token: tokenB }));
    const res = await GET(getReq({ token: tokenA }));
    const body = await res.json();
    expect(body.mine).toEqual([ITEM]);
  });
});

describe("DELETE /api/commissary/interest", () => {
  it("403 on a foreign origin", async () => {
    const res = await DELETE(
      reqOf("DELETE", { itemId: ITEM }, { token: tokenA, origin: "https://evil.example" }),
    );
    expect(res.status).toBe(403);
  });

  it("401 without a session", async () => {
    expect((await DELETE(reqOf("DELETE", { itemId: ITEM }))).status).toBe(401);
  });

  it("400 for an itemId not in the catalogue", async () => {
    const res = await DELETE(reqOf("DELETE", { itemId: "not-a-real-item" }, { token: tokenA }));
    expect(res.status).toBe(400);
  });

  it("withdraws ONLY the caller's row — another citizen's interest survives", async () => {
    await POST(reqOf("POST", { itemId: ITEM }, { token: tokenA }));
    await POST(reqOf("POST", { itemId: ITEM }, { token: tokenB }));
    const res = await DELETE(reqOf("DELETE", { itemId: ITEM }, { token: tokenA }));
    expect(res.status).toBe(200);
    const mineA = await prisma.commissaryInterest.count({
      where: { userId: userAId, itemId: ITEM },
    });
    const mineB = await prisma.commissaryInterest.count({
      where: { userId: userBId, itemId: ITEM },
    });
    expect(mineA).toBe(0);
    expect(mineB).toBe(1);
  });

  it("deleting a never-registered interest is a no-op 200 (idempotent withdraw)", async () => {
    const res = await DELETE(reqOf("DELETE", { itemId: ITEM2 }, { token: tokenA }));
    expect(res.status).toBe(200);
  });
});
