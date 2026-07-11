// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";

/**
 * /api/referral-links (Wave 17). Trust computation + chain reads are mocked
 * (h.finalScore drives the gate); links + referrals are real prisma. Asserts:
 * GET (401 / gate state locked+unlocked / MY links only with per-link uses),
 * POST (origin 403 / auth 401 / zod 400 / GATED 403 carrying { finalScore,
 * threshold: 65 } / the 3-active cap / happy path shape).
 */

const h = vi.hoisted(() => ({ finalScore: 0 }));

vi.mock("@/lib/trust/score", () => ({
  computeTrustScore: async () => ({
    computed: h.finalScore,
    adminAdjustment: 0,
    finalScore: h.finalScore,
    signals: {},
  }),
}));
vi.mock("@/lib/applications/applicant", () => ({
  resolveApplicantAddress: async () => null,
}));
vi.mock("@/lib/passport/serverReads", () => ({
  readPassportStatusServer: async () => ({ isCitizen: false, tokenId: null }),
}));

import { GET, POST } from "./route";

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const ownerEmail = `reflinks-o-${suffix}@w17links.example`;
const otherEmail = `reflinks-x-${suffix}@w17links.example`;
const referredEmail = `reflinks-r-${suffix}@w17links.example`;

let ownerId: string;
let otherId: string;
let referredId: string;
let ownerToken: string;

function getReq(opts: { token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}/api/referral-links`, { headers });
}
function postReq(body: unknown, opts: { token?: string; origin?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  headers.origin = opts.origin ?? APP;
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}/api/referral-links`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  const owner = await prisma.user.create({ data: { email: ownerEmail } });
  const other = await prisma.user.create({ data: { email: otherEmail } });
  const referred = await prisma.user.create({ data: { email: referredEmail } });
  ownerId = owner.id;
  otherId = other.id;
  referredId = referred.id;
  ({ token: ownerToken } = await createSession(ownerId));
});

beforeEach(async () => {
  h.finalScore = 80; // unlocked unless a test lowers it
  await prisma.referral.deleteMany({ where: { referrerUserId: { in: [ownerId, otherId] } } });
  await prisma.referralLink.deleteMany({ where: { ownerUserId: { in: [ownerId, otherId] } } });
});

afterAll(async () => {
  await prisma.referral.deleteMany({ where: { referrerUserId: { in: [ownerId, otherId] } } });
  await prisma.referralLink.deleteMany({ where: { ownerUserId: { in: [ownerId, otherId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId, referredId] } } });
  await prisma.$disconnect();
});

describe("GET /api/referral-links", () => {
  it("401 without a session", async () => {
    expect((await GET(getReq())).status).toBe(401);
  });

  it("locked gate state when the score sits at the threshold (65 is NOT enough)", async () => {
    h.finalScore = 65;
    const res = await GET(getReq({ token: ownerToken }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { gate: Record<string, unknown>; links: unknown[] };
    expect(data.gate).toEqual({ unlocked: false, finalScore: 65, threshold: 65 });
    expect(data.links).toEqual([]);
  });

  it("returns ONLY my links, with per-link uses counted from viaLinkId", async () => {
    const mine = await prisma.referralLink.create({
      data: { code: `mycode${suffix.slice(0, 4)}a`, ownerUserId: ownerId, label: "Mine" },
    });
    await prisma.referralLink.create({
      data: { code: `theirs${suffix.slice(0, 4)}b`, ownerUserId: otherId },
    });
    await prisma.referral.create({
      data: {
        referrerUserId: ownerId,
        referredUserId: referredId,
        whenTokenConsumed: false,
        viaLinkId: mine.id,
      },
    });

    const res = await GET(getReq({ token: ownerToken }));
    const data = (await res.json()) as {
      gate: { unlocked: boolean };
      links: Array<{ id: string; code: string; label: string | null; uses: number }>;
    };
    expect(data.gate.unlocked).toBe(true);
    expect(data.links).toHaveLength(1);
    expect(data.links[0]!.id).toBe(mine.id);
    expect(data.links[0]!.label).toBe("Mine");
    expect(data.links[0]!.uses).toBe(1);
  });

  it("PRIVACY: the payload never carries an email, userId, or address", async () => {
    await prisma.referralLink.create({
      data: { code: `priv${suffix.slice(0, 4)}cc`, ownerUserId: ownerId },
    });
    const res = await GET(getReq({ token: ownerToken }));
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toContain(ownerEmail);
    expect(raw).not.toContain(ownerId);
    expect(raw).not.toContain("0x");
  });
});

describe("POST /api/referral-links", () => {
  it("403 on a foreign origin", async () => {
    const res = await POST(postReq({}, { token: ownerToken, origin: "https://evil.example" }));
    expect(res.status).toBe(403);
  });

  it("401 without a session", async () => {
    expect((await POST(postReq({}))).status).toBe(401);
  });

  it("400 on a bad body (unknown key / label bounds)", async () => {
    expect((await POST(postReq({ zz: 1 }, { token: ownerToken }))).status).toBe(400);
    expect((await POST(postReq({ label: "" }, { token: ownerToken }))).status).toBe(400);
    expect((await POST(postReq({ label: "x".repeat(61) }, { token: ownerToken }))).status).toBe(
      400,
    );
  });

  it("403 with { finalScore, threshold: 65 } when the gate holds", async () => {
    h.finalScore = 65;
    const res = await POST(postReq({}, { token: ownerToken }));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { finalScore: number; threshold: number; error: string };
    expect(body.finalScore).toBe(65);
    expect(body.threshold).toBe(65);
    expect(await prisma.referralLink.count({ where: { ownerUserId: ownerId } })).toBe(0);
  });

  it("happy path: creates an unrevoked link with a slug code and echoes it", async () => {
    const res = await POST(postReq({ label: "Poster QR" }, { token: ownerToken }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      ok: boolean;
      link: { id: string; code: string; label: string | null; revokedAt: null; uses: number };
    };
    expect(data.ok).toBe(true);
    expect(data.link.code).toMatch(/^[23456789bcdfghjkmnpqrstvwxyz]{8,10}$/);
    expect(data.link.label).toBe("Poster QR");
    expect(data.link.uses).toBe(0);
    const row = await prisma.referralLink.findUnique({ where: { id: data.link.id } });
    expect(row?.ownerUserId).toBe(ownerId);
    expect(row?.revokedAt).toBeNull();
  });

  it("caps at 3 ACTIVE links — a REVOKED link frees its slot", async () => {
    for (let i = 0; i < 3; i++) {
      expect((await POST(postReq({}, { token: ownerToken }))).status).toBe(200);
    }
    const over = await POST(postReq({}, { token: ownerToken }));
    expect(over.status).toBe(400);
    expect(((await over.json()) as { error: string }).error).toMatch(/3 active/i);

    const one = await prisma.referralLink.findFirst({ where: { ownerUserId: ownerId } });
    await prisma.referralLink.update({
      where: { id: one!.id },
      data: { revokedAt: new Date() },
    });
    expect((await POST(postReq({}, { token: ownerToken }))).status).toBe(200);
  });
});
