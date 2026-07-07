// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { KEY_MATERIAL_ERROR } from "@/lib/validation/estate";
import { canonicalBitwillPayload, directiveHashOf } from "@/lib/bitwill/canonical";
import { GET, POST } from "./route";

/**
 * /api/bitwill (Wave 15 A). Real prisma + REAL viem signatures (fresh random
 * test keys — never real funds). Asserts the filing contract: origin/session
 * guards; zod bounds; the NON-CUSTODIAL key-material guard verbatim;
 * signature recovery against the canonical payload; the signer must be one of
 * the CALLER'S VERIFIED LinkedWallets; filing supersedes the previous ACTIVE
 * directive atomically; GET returns the caller's history newest-first.
 */

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let owner: PrivateKeyAccount; // linked + verified for user A
let unverified: PrivateKeyAccount; // linked to user A but NOT verified
let stranger: PrivateKeyAccount; // linked + verified for user B
let userAId: string;
let userBId: string;
let token: string;

const FIELDS = {
  beneficiaryName: "Ada Lovelace",
  beneficiaryContact: "ada@example.com",
  assetsMemo: "All CRPT holdings and the library of engines.",
};

interface DirectiveFields {
  beneficiaryName: string;
  beneficiaryContact: string;
  beneficiaryAddress?: string;
  assetsMemo: string;
}

async function signedBody(account: PrivateKeyAccount, overrides: Partial<DirectiveFields> = {}) {
  const fields: DirectiveFields = { ...FIELDS, ...overrides };
  const payload = canonicalBitwillPayload({
    owner: account.address,
    beneficiaryName: fields.beneficiaryName,
    beneficiaryContact: fields.beneficiaryContact,
    ...(fields.beneficiaryAddress ? { beneficiaryAddress: fields.beneficiaryAddress } : {}),
    assetsMemo: fields.assetsMemo,
  });
  const signature = await account.signMessage({ message: payload });
  return { body: { ...fields, signerAddress: account.address, signature }, payload };
}

/** createdAt has millisecond resolution — space sequential filings apart. */
const tick = () => new Promise((r) => setTimeout(r, 10));

function post(body: unknown, opts: { token?: string; origin?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  headers.origin = opts.origin ?? APP;
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(APP + "/api/bitwill", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}
function get(opts: { token?: string } = {}) {
  return new Request(APP + "/api/bitwill", {
    method: "GET",
    headers: opts.token ? { cookie: `cr_session=${opts.token}` } : {},
  });
}

beforeAll(async () => {
  owner = privateKeyToAccount(generatePrivateKey());
  unverified = privateKeyToAccount(generatePrivateKey());
  stranger = privateKeyToAccount(generatePrivateKey());

  const userA = await prisma.user.create({ data: { email: `bw-a-${suffix}@w15bw.example` } });
  const userB = await prisma.user.create({ data: { email: `bw-b-${suffix}@w15bw.example` } });
  userAId = userA.id;
  userBId = userB.id;
  await prisma.linkedWallet.createMany({
    data: [
      { userId: userAId, address: owner.address, verifiedAt: new Date() },
      { userId: userAId, address: unverified.address, verifiedAt: null },
      { userId: userBId, address: stranger.address, verifiedAt: new Date() },
    ],
  });
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

describe("POST /api/bitwill", () => {
  it("403 on a foreign origin; 401 without a session", async () => {
    const { body } = await signedBody(owner);
    expect((await POST(post(body, { token, origin: "https://evil.example" }))).status).toBe(403);
    expect((await POST(post(body))).status).toBe(401);
  });

  it("400 on a bad body (unknown key / bounds)", async () => {
    const { body } = await signedBody(owner);
    expect((await POST(post({ ...body, zz: 1 }, { token }))).status).toBe(400);
    expect((await POST(post({ ...body, beneficiaryName: "A" }, { token }))).status).toBe(400);
  });

  it("400 with the exact non-custodial message when the memo reads like key material", async () => {
    const mnemonic =
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    for (const assetsMemo of [mnemonic, "The seed phrase is taped under the desk."]) {
      const { body } = await signedBody(owner, { assetsMemo });
      const res = await POST(post(body, { token }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe(KEY_MATERIAL_ERROR);
      expect(await prisma.bitwillDirective.count({ where: { ownerUserId: userAId } })).toBe(0);
    }
  });

  it("400 when the signature does not recover to the claimed signer", async () => {
    const { body } = await signedBody(owner);
    // signature from a DIFFERENT key over the same fields
    const forged = await signedBody(stranger);
    const res = await POST(post({ ...body, signature: forged.body.signature }, { token }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/signature does not match/i);
  });

  it("400 when the fields were tampered after signing", async () => {
    const { body } = await signedBody(owner);
    const res = await POST(post({ ...body, beneficiaryName: "Eve Mallory" }, { token }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/signature does not match/i);
  });

  it("400 when the signer is not one of the CALLER'S wallets (even if valid elsewhere)", async () => {
    // stranger's wallet is verified — but for user B, not the caller (user A)
    const { body } = await signedBody(stranger);
    const res = await POST(post(body, { token }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/verified for your account/i);
  });

  it("400 when the caller's wallet is linked but NOT verified", async () => {
    const { body } = await signedBody(unverified);
    const res = await POST(post(body, { token }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/verified for your account/i);
  });

  it("happy path: files an ACTIVE directive with the canonical hash + public record", async () => {
    const { body, payload } = await signedBody(owner, {
      beneficiaryAddress: stranger.address,
    });
    const res = await POST(post(body, { token }));
    expect(res.status).toBe(200);
    const row = await prisma.bitwillDirective.findFirstOrThrow({
      where: { ownerUserId: userAId },
    });
    expect(row.status).toBe("ACTIVE");
    expect(row.directiveHash).toBe(directiveHashOf(payload));
    expect(row.signerAddress).toBe(owner.address);
    expect(row.beneficiaryAddress).toBe(stranger.address);
    expect(row.beneficiaryName).toBe(FIELDS.beneficiaryName);
    expect(row.revokedAt).toBeNull();
  });

  it("filing again SUPERSEDES the previous ACTIVE directive in one transaction", async () => {
    const first = await signedBody(owner);
    expect((await POST(post(first.body, { token }))).status).toBe(200);
    await tick();
    const second = await signedBody(owner, { beneficiaryName: "Grace Hopper" });
    expect((await POST(post(second.body, { token }))).status).toBe(200);

    const rows = await prisma.bitwillDirective.findMany({
      where: { ownerUserId: userAId },
      orderBy: { createdAt: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.status).toBe("SUPERSEDED");
    expect(rows[1]!.status).toBe("ACTIVE");
    expect(rows[1]!.beneficiaryName).toBe("Grace Hopper");
    expect(rows.filter((r) => r.status === "ACTIVE")).toHaveLength(1);
  });
});

describe("GET /api/bitwill", () => {
  it("401 without a session", async () => {
    expect((await GET(get())).status).toBe(401);
  });

  it("returns ONLY the caller's directives, newest first", async () => {
    const mineA = await signedBody(owner);
    await POST(post(mineA.body, { token }));
    await tick();
    const mineB = await signedBody(owner, { beneficiaryName: "Grace Hopper" });
    await POST(post(mineB.body, { token }));
    // another citizen's directive must not leak into the caller's history
    const { token: tokenB } = await createSession(userBId);
    const theirs = await signedBody(stranger, { beneficiaryName: "Not Yours" });
    expect((await POST(post(theirs.body, { token: tokenB }))).status).toBe(200);

    const res = await GET(get({ token }));
    expect(res.status).toBe(200);
    const { directives } = (await res.json()) as {
      directives: Array<{ beneficiaryName: string; status: string }>;
    };
    expect(directives).toHaveLength(2);
    expect(directives[0]!.beneficiaryName).toBe("Grace Hopper");
    expect(directives[0]!.status).toBe("ACTIVE");
    expect(directives[1]!.status).toBe("SUPERSEDED");
    expect(directives.some((d) => d.beneficiaryName === "Not Yours")).toBe(false);
  });
});
