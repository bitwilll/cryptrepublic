// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { certificateSerial } from "@/lib/certificates/serial";
import { POST } from "./route";

/**
 * POST /api/certificates/[serial]/revoke (Wave 15 — Identity). Real prisma, no
 * chain. Asserts: origin 403; auth 401; unknown serial 404; NON-author 403;
 * author revoke sets revokedAt (never deletes); double revoke 400.
 */

const ANVIL_KEY_0 = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const signer = privateKeyToAccount(ANVIL_KEY_0);

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let authorId: string;
let strangerId: string;
let authorToken: string;
let strangerToken: string;
let serial: string;

function post(theSerial: string, opts: { token?: string; origin?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  headers.origin = opts.origin ?? APP;
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return POST(
    new Request(`${APP}/api/certificates/${theSerial}/revoke`, { method: "POST", headers }),
    { params: Promise.resolve({ serial: theSerial }) },
  );
}

beforeAll(async () => {
  const author = await prisma.user.create({ data: { email: `rev-a-${suffix}@w15cert.example` } });
  const other = await prisma.user.create({ data: { email: `rev-s-${suffix}@w15cert.example` } });
  authorId = author.id;
  strangerId = other.id;
  ({ token: authorToken } = await createSession(authorId));
  ({ token: strangerToken } = await createSession(strangerId));
});

beforeEach(async () => {
  await prisma.signedCertificate.deleteMany({ where: { authorUserId: authorId } });
  const id = crypto.randomUUID();
  serial = certificateSerial(id, new Date());
  await prisma.signedCertificate.create({
    data: {
      id,
      serial,
      authorUserId: authorId,
      kind: "MESSAGE",
      title: "Revocable statement",
      subject: "A statement.",
      contentHash: "0x" + "ab".repeat(32),
      signerAddress: signer.address,
      signature: "0x" + "11".repeat(65),
    },
  });
});

afterAll(async () => {
  await prisma.signedCertificate.deleteMany({ where: { authorUserId: authorId } });
  await prisma.user.deleteMany({ where: { id: { in: [authorId, strangerId] } } });
  await prisma.$disconnect();
});

describe("POST /api/certificates/[serial]/revoke", () => {
  it("403 on a foreign origin", async () => {
    expect(
      (await post(serial, { token: authorToken, origin: "https://evil.example" })).status,
    ).toBe(403);
  });

  it("401 without a session", async () => {
    expect((await post(serial)).status).toBe(401);
  });

  it("404 for an unknown serial", async () => {
    expect((await post("CR-2026-ZZZZZZ", { token: authorToken })).status).toBe(404);
  });

  it("403 when the caller is not the author", async () => {
    expect((await post(serial, { token: strangerToken })).status).toBe(403);
    const row = await prisma.signedCertificate.findUnique({ where: { serial } });
    expect(row?.revokedAt).toBeNull();
  });

  it("the author revokes: revokedAt is set, the row survives", async () => {
    const res = await post(serial, { token: authorToken });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; revokedAt: string };
    expect(body.ok).toBe(true);
    const row = await prisma.signedCertificate.findUnique({ where: { serial } });
    expect(row).not.toBeNull();
    expect(row?.revokedAt).not.toBeNull();
  });

  it("revoking twice is a 400", async () => {
    expect((await post(serial, { token: authorToken })).status).toBe(200);
    const again = await post(serial, { token: authorToken });
    expect(again.status).toBe(400);
    expect((await again.json()).error).toMatch(/already revoked/i);
  });
});
