// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { canonicalBitwillPayload, directiveHashOf } from "@/lib/bitwill/canonical";
import { POST } from "./route";

/**
 * POST /api/bitwill/revoke (Wave 15 A). Real prisma. The body is EMPTY and the
 * target is the SESSION user's ACTIVE directive — never a client-supplied id.
 * Asserts guards, the no-active 400, the ACTIVE → REVOKED transition (with
 * revokedAt), and that another citizen's directive is untouchable.
 */

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let userAId: string;
let userBId: string;
let token: string;

function post(body: unknown, opts: { token?: string; origin?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  headers.origin = opts.origin ?? APP;
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(APP + "/api/bitwill/revoke", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/** Seed a directive row directly (route-level signing is covered in ../route.test.ts). */
async function seedDirective(ownerUserId: string, status: string) {
  const account = privateKeyToAccount(generatePrivateKey());
  const assetsMemo = "All holdings to the named beneficiary.";
  const payload = canonicalBitwillPayload({
    owner: account.address,
    beneficiaryName: "Ada Lovelace",
    beneficiaryContact: "ada@example.com",
    assetsMemo,
  });
  return prisma.bitwillDirective.create({
    data: {
      ownerUserId,
      beneficiaryName: "Ada Lovelace",
      beneficiaryContact: "ada@example.com",
      assetsMemo,
      directiveHash: directiveHashOf(payload),
      signerAddress: account.address,
      signature: await account.signMessage({ message: payload }),
      status,
    },
  });
}

beforeAll(async () => {
  const userA = await prisma.user.create({ data: { email: `bwr-a-${suffix}@w15bw.example` } });
  const userB = await prisma.user.create({ data: { email: `bwr-b-${suffix}@w15bw.example` } });
  userAId = userA.id;
  userBId = userB.id;
  ({ token } = await createSession(userAId));
});

beforeEach(async () => {
  await prisma.bitwillDirective.deleteMany({ where: { ownerUserId: { in: [userAId, userBId] } } });
});

afterAll(async () => {
  await prisma.bitwillDirective.deleteMany({ where: { ownerUserId: { in: [userAId, userBId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  await prisma.$disconnect();
});

describe("POST /api/bitwill/revoke", () => {
  it("403 on a foreign origin; 401 without a session", async () => {
    expect((await POST(post({}, { token, origin: "https://evil.example" }))).status).toBe(403);
    expect((await POST(post({}))).status).toBe(401);
  });

  it("400 on a non-empty body (strict — no id smuggling)", async () => {
    await seedDirective(userAId, "ACTIVE");
    const res = await POST(post({ id: "someone-elses" }, { token }));
    expect(res.status).toBe(400);
  });

  it("400 when no ACTIVE directive is on file", async () => {
    const res = await POST(post({}, { token }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no active directive/i);
  });

  it("400 when the only directives are already REVOKED/SUPERSEDED", async () => {
    await seedDirective(userAId, "REVOKED");
    await seedDirective(userAId, "SUPERSEDED");
    expect((await POST(post({}, { token }))).status).toBe(400);
  });

  it("revokes the caller's ACTIVE directive (status + revokedAt) and ONLY theirs", async () => {
    const mine = await seedDirective(userAId, "ACTIVE");
    const theirs = await seedDirective(userBId, "ACTIVE");

    const res = await POST(post({}, { token }));
    expect(res.status).toBe(200);

    const mineAfter = await prisma.bitwillDirective.findUniqueOrThrow({ where: { id: mine.id } });
    expect(mineAfter.status).toBe("REVOKED");
    expect(mineAfter.revokedAt).not.toBeNull();

    const theirsAfter = await prisma.bitwillDirective.findUniqueOrThrow({
      where: { id: theirs.id },
    });
    expect(theirsAfter.status).toBe("ACTIVE");
    expect(theirsAfter.revokedAt).toBeNull();

    // a second revoke finds nothing ACTIVE
    expect((await POST(post({}, { token }))).status).toBe(400);
  });
});
