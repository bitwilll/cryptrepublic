// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { POST } from "./route";

/**
 * POST /api/referral-links/revoke (Wave 17). Real prisma. Asserts: origin 403 /
 * auth 401 / zod 400; OWNER-ONLY (another citizen's link id → generic 400 and
 * the link stays live — no enumeration); a revoke stamps revokedAt; a repeat
 * revoke is idempotent ok and does NOT move the original revokedAt.
 */

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const ownerEmail = `revoke-o-${suffix}@w17links.example`;
const otherEmail = `revoke-x-${suffix}@w17links.example`;

let ownerId: string;
let otherId: string;
let ownerToken: string;
let otherToken: string;
let linkId: string;

function post(body: unknown, opts: { token?: string; origin?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  headers.origin = opts.origin ?? APP;
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}/api/referral-links/revoke`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  const owner = await prisma.user.create({ data: { email: ownerEmail } });
  const other = await prisma.user.create({ data: { email: otherEmail } });
  ownerId = owner.id;
  otherId = other.id;
  ({ token: ownerToken } = await createSession(ownerId));
  ({ token: otherToken } = await createSession(otherId));
});

beforeEach(async () => {
  await prisma.referralLink.deleteMany({ where: { ownerUserId: { in: [ownerId, otherId] } } });
  const link = await prisma.referralLink.create({
    data: { code: `rvk${Math.random().toString(36).slice(2, 9)}`, ownerUserId: ownerId },
  });
  linkId = link.id;
});

afterAll(async () => {
  await prisma.referralLink.deleteMany({ where: { ownerUserId: { in: [ownerId, otherId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } });
  await prisma.$disconnect();
});

describe("POST /api/referral-links/revoke", () => {
  it("403 on a foreign origin", async () => {
    const res = await POST(post({ linkId }, { token: ownerToken, origin: "https://evil.example" }));
    expect(res.status).toBe(403);
  });

  it("401 without a session", async () => {
    expect((await POST(post({ linkId }))).status).toBe(401);
  });

  it("400 on a bad body (missing linkId / unknown key)", async () => {
    expect((await POST(post({}, { token: ownerToken }))).status).toBe(400);
    expect((await POST(post({ linkId, zz: 1 }, { token: ownerToken }))).status).toBe(400);
  });

  it("owner-only: another citizen's revoke is a generic 400 and the link stays live", async () => {
    const res = await POST(post({ linkId }, { token: otherToken }));
    expect(res.status).toBe(400);
    const row = await prisma.referralLink.findUnique({ where: { id: linkId } });
    expect(row?.revokedAt).toBeNull();
  });

  it("unknown link id → generic 400 (indistinguishable from not-mine)", async () => {
    const res = await POST(post({ linkId: "nonexistent-link-id" }, { token: ownerToken }));
    expect(res.status).toBe(400);
  });

  it("the owner's revoke stamps revokedAt; a repeat revoke is idempotent ok", async () => {
    const res = await POST(post({ linkId }, { token: ownerToken }));
    expect(res.status).toBe(200);
    const row = await prisma.referralLink.findUnique({ where: { id: linkId } });
    expect(row?.revokedAt).not.toBeNull();

    const again = await POST(post({ linkId }, { token: ownerToken }));
    expect(again.status).toBe(200);
    expect(((await again.json()) as { alreadyRevoked?: boolean }).alreadyRevoked).toBe(true);
    const after = await prisma.referralLink.findUnique({ where: { id: linkId } });
    expect(after?.revokedAt?.getTime()).toBe(row?.revokedAt?.getTime()); // did not move
  });
});
