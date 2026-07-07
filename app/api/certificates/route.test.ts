// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { canonicalPayload, sha256HexOfText } from "@/lib/certificates/canonical";
import { SERIAL_PATTERN } from "@/lib/certificates/serial";
import { POST, GET } from "./route";

/**
 * POST/GET /api/certificates (Wave 15 — Identity). NO mocks: the route is pure
 * cryptography (viem recovery) + real prisma. Signatures are produced with the
 * standard, PUBLICLY-DOCUMENTED anvil dev keys (test material, not secrets).
 * Asserts: origin 403; auth 401; body validation 400s; signature must recover
 * to a VERIFIED LinkedWallet of the SESSION user (else 400); MESSAGE content
 * hash is server-checked; happy path issues a CR-YYYY-XXXXXX serial and stores
 * only public fields; GET lists mine newest-first and never others'.
 */

// anvil dev key #0 / #1 — standard public test keys (never real funds).
const LINKED_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const STRANGER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const linked = privateKeyToAccount(LINKED_KEY);
const stranger = privateKeyToAccount(STRANGER_KEY);

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const authorEmail = `cert-a-${suffix}@w15cert.example`;
const otherEmail = `cert-o-${suffix}@w15cert.example`;

let authorId: string;
let otherId: string;
let token: string;

function post(body: unknown, opts: { token?: string; origin?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  headers.origin = opts.origin ?? APP;
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(APP + "/api/certificates", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}
function get(opts: { token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(APP + "/api/certificates", { method: "GET", headers });
}

/** Build a fully-signed MESSAGE body with the given signer. */
async function signedBody(
  signer: typeof linked,
  overrides: Partial<Record<"kind" | "title" | "subject", string>> = {},
) {
  const kind = (overrides.kind ?? "MESSAGE") as "MESSAGE" | "DOCUMENT";
  const title = overrides.title ?? "Statement of record";
  const subject = overrides.subject ?? "I attest this statement before the Republic.";
  const contentHash = kind === "MESSAGE" ? await sha256HexOfText(subject) : "0x" + "cd".repeat(32);
  const signature = await signer.signMessage({
    message: canonicalPayload({ kind, title, subject, contentHash }),
  });
  return { kind, title, subject, contentHash, signature };
}

beforeAll(async () => {
  const author = await prisma.user.create({ data: { email: authorEmail } });
  const other = await prisma.user.create({ data: { email: otherEmail } });
  authorId = author.id;
  otherId = other.id;
  ({ token } = await createSession(authorId));
});

beforeEach(async () => {
  await prisma.signedCertificate.deleteMany({
    where: { authorUserId: { in: [authorId, otherId] } },
  });
  await prisma.linkedWallet.deleteMany({ where: { userId: { in: [authorId, otherId] } } });
  await prisma.linkedWallet.create({
    data: { userId: authorId, address: linked.address, chain: "EVM", verifiedAt: new Date() },
  });
});

afterAll(async () => {
  await prisma.signedCertificate.deleteMany({
    where: { authorUserId: { in: [authorId, otherId] } },
  });
  await prisma.linkedWallet.deleteMany({ where: { userId: { in: [authorId, otherId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [authorId, otherId] } } });
  await prisma.$disconnect();
});

describe("POST /api/certificates", () => {
  it("403 on a foreign origin", async () => {
    const body = await signedBody(linked);
    const res = await POST(post(body, { token, origin: "https://evil.example" }));
    expect(res.status).toBe(403);
  });

  it("401 without a session", async () => {
    expect((await POST(post(await signedBody(linked)))).status).toBe(401);
  });

  it("400 on validation failures (bad kind / short title / bad hash / extra key)", async () => {
    const ok = await signedBody(linked);
    expect((await POST(post({ ...ok, kind: "SCROLL" }, { token }))).status).toBe(400);
    expect((await POST(post({ ...ok, title: "ab" }, { token }))).status).toBe(400);
    expect((await POST(post({ ...ok, contentHash: "0x1234" }, { token }))).status).toBe(400);
    expect((await POST(post({ ...ok, extra: 1 }, { token }))).status).toBe(400);
  });

  it("400 when the MESSAGE content hash does not match the message text", async () => {
    const body = await signedBody(linked);
    const res = await POST(post({ ...body, contentHash: "0x" + "00".repeat(32) }, { token }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/content hash/i);
  });

  it("400 when the signature was made by a key that is NOT a linked wallet", async () => {
    const body = await signedBody(stranger); // internally-consistent, wrong signer
    const res = await POST(post(body, { token }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/does not match a linked wallet/i);
  });

  it("400 when the wallet is linked to ANOTHER account", async () => {
    await prisma.linkedWallet.create({
      data: { userId: otherId, address: stranger.address, chain: "EVM", verifiedAt: new Date() },
    });
    const res = await POST(post(await signedBody(stranger), { token }));
    expect(res.status).toBe(400);
  });

  it("400 when the linked wallet is UNVERIFIED", async () => {
    await prisma.linkedWallet.update({
      where: { address: linked.address },
      data: { verifiedAt: null },
    });
    const res = await POST(post(await signedBody(linked), { token }));
    expect(res.status).toBe(400);
  });

  it("400 when the signature covers DIFFERENT fields than submitted (recovers a stranger)", async () => {
    const body = await signedBody(linked);
    const res = await POST(post({ ...body, title: "Tampered title" }, { token }));
    expect(res.status).toBe(400);
  });

  it("happy path: issues a CR-YYYY-XXXXXX serial and stores only public fields", async () => {
    const body = await signedBody(linked);
    const res = await POST(post(body, { token }));
    expect(res.status).toBe(200);
    const { certificate } = (await res.json()) as {
      certificate: { serial: string; signerAddress: string; revokedAt: string | null };
    };
    expect(certificate.serial).toMatch(SERIAL_PATTERN);
    expect(certificate.serial.startsWith(`CR-${new Date().getUTCFullYear()}-`)).toBe(true);
    expect(certificate.signerAddress).toBe(linked.address);
    expect(certificate.revokedAt).toBeNull();

    const row = await prisma.signedCertificate.findUnique({
      where: { serial: certificate.serial },
    });
    expect(row?.authorUserId).toBe(authorId);
    expect(row?.kind).toBe("MESSAGE");
    expect(row?.contentHash).toBe(body.contentHash.toLowerCase());
  });

  it("DOCUMENT mode accepts an arbitrary content hash (file stays client-side)", async () => {
    const body = await signedBody(linked, { kind: "DOCUMENT", subject: "deed-of-title.pdf" });
    const res = await POST(post(body, { token }));
    expect(res.status).toBe(200);
  });
});

describe("GET /api/certificates", () => {
  it("401 without a session", async () => {
    expect((await GET(get())).status).toBe(401);
  });

  it("lists ONLY my certificates, newest first", async () => {
    const first = await signedBody(linked, { title: "First certificate" });
    const second = await signedBody(linked, { title: "Second certificate", subject: "Later." });
    expect((await POST(post(first, { token }))).status).toBe(200);
    // createdAt has second precision on some drivers — force distinct ordering.
    await prisma.signedCertificate.updateMany({
      where: { title: "First certificate" },
      data: { createdAt: new Date(Date.now() - 60_000) },
    });
    expect((await POST(post(second, { token }))).status).toBe(200);

    // another author's certificate must not appear
    const { token: otherToken } = await createSession(otherId);
    await prisma.linkedWallet.create({
      data: { userId: otherId, address: stranger.address, chain: "EVM", verifiedAt: new Date() },
    });
    expect((await POST(post(await signedBody(stranger), { token: otherToken }))).status).toBe(200);

    const res = await GET(get({ token }));
    expect(res.status).toBe(200);
    const { certificates } = (await res.json()) as {
      certificates: Array<{ title: string }>;
    };
    expect(certificates.map((c) => c.title)).toEqual(["Second certificate", "First certificate"]);
  });
});
