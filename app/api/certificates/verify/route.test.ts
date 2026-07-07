// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { prisma } from "@/lib/db";
import { canonicalPayload, sha256HexOfText } from "@/lib/certificates/canonical";
import { certificateSerial } from "@/lib/certificates/serial";
import { GET } from "./route";

/**
 * GET /api/certificates/verify (Wave 15 — Identity). PUBLIC: no session, no
 * origin gate. Real prisma + real viem recovery (an anvil dev key — public
 * test material). Asserts: 400 malformed serial; 404 unknown; a valid
 * certificate returns signatureValid true; a TAMPERED row returns
 * signatureValid false; revoked surfaces `revoked: true`;
 * signerHeldPassportRecord reflects the CACHED citizenTokenId (no chain).
 */

// anvil dev key #2 (public test material) — key #0 is used by the sibling
// create-route suite, and LinkedWallet.address is GLOBALLY unique: parallel
// test files must not link the same address.
const ANVIL_KEY_2 = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as const;
const signer = privateKeyToAccount(ANVIL_KEY_2);

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let authorId: string;
let serial: string;

function get(query: string) {
  return GET(new Request(`${APP}/api/certificates/verify${query}`, { method: "GET" }));
}

async function seedCertificate(overrides: { title?: string } = {}) {
  const id = crypto.randomUUID();
  const title = overrides.title ?? "Public statement";
  const subject = "The Republic verifies in the open.";
  const contentHash = await sha256HexOfText(subject);
  const signature = await signer.signMessage({
    message: canonicalPayload({ kind: "MESSAGE", title, subject, contentHash }),
  });
  const theSerial = certificateSerial(id, new Date());
  await prisma.signedCertificate.create({
    data: {
      id,
      serial: theSerial,
      authorUserId: authorId,
      kind: "MESSAGE",
      title,
      subject,
      contentHash,
      signerAddress: signer.address,
      signature,
    },
  });
  return theSerial;
}

beforeAll(async () => {
  const author = await prisma.user.create({
    data: { email: `verify-a-${suffix}@w15cert.example` },
  });
  authorId = author.id;
});

beforeEach(async () => {
  await prisma.signedCertificate.deleteMany({ where: { authorUserId: authorId } });
  await prisma.linkedWallet.deleteMany({ where: { userId: authorId } });
  await prisma.citizenshipApplication.deleteMany({ where: { userId: authorId } });
  serial = await seedCertificate();
});

afterAll(async () => {
  await prisma.signedCertificate.deleteMany({ where: { authorUserId: authorId } });
  await prisma.linkedWallet.deleteMany({ where: { userId: authorId } });
  await prisma.citizenshipApplication.deleteMany({ where: { userId: authorId } });
  await prisma.user.deleteMany({ where: { id: authorId } });
  await prisma.$disconnect();
});

describe("GET /api/certificates/verify", () => {
  it("400 without a serial or on a malformed one", async () => {
    expect((await get("")).status).toBe(400);
    expect((await get("?serial=not-a-serial")).status).toBe(400);
  });

  it("404 for an unknown (but well-formed) serial", async () => {
    expect((await get("?serial=CR-2026-ZZZZZZ")).status).toBe(404);
  });

  it("a valid certificate verifies without any session", async () => {
    const res = await get(`?serial=${serial}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      serial: string;
      signatureValid: boolean;
      revoked: boolean;
      signerAddress: string;
      signerHeldPassportRecord: boolean;
    };
    expect(body.serial).toBe(serial);
    expect(body.signatureValid).toBe(true);
    expect(body.revoked).toBe(false);
    expect(body.signerAddress).toBe(signer.address);
    expect(body.signerHeldPassportRecord).toBe(false);
  });

  it("accepts a lowercased serial (normalizes before lookup)", async () => {
    const res = await get(`?serial=${serial.toLowerCase()}`);
    expect(res.status).toBe(200);
  });

  it("a TAMPERED record fails recovery: signatureValid false", async () => {
    await prisma.signedCertificate.update({
      where: { serial },
      data: { title: "Tampered after signing" },
    });
    const body = (await (await get(`?serial=${serial}`)).json()) as {
      signatureValid: boolean;
    };
    expect(body.signatureValid).toBe(false);
  });

  it("a revoked certificate stays verifiable and reports revoked", async () => {
    await prisma.signedCertificate.update({
      where: { serial },
      data: { revokedAt: new Date() },
    });
    const body = (await (await get(`?serial=${serial}`)).json()) as {
      revoked: boolean;
      revokedAt: string | null;
      signatureValid: boolean;
    };
    expect(body.revoked).toBe(true);
    expect(body.revokedAt).not.toBeNull();
    expect(body.signatureValid).toBe(true);
  });

  it("signerHeldPassportRecord reflects the cached citizenTokenId", async () => {
    await prisma.linkedWallet.create({
      data: { userId: authorId, address: signer.address, chain: "EVM", verifiedAt: new Date() },
    });
    await prisma.citizenshipApplication.create({
      data: { userId: authorId, status: "WITNESSED", citizenTokenId: "42" },
    });
    const body = (await (await get(`?serial=${serial}`)).json()) as {
      signerHeldPassportRecord: boolean;
    };
    expect(body.signerHeldPassportRecord).toBe(true);
  });
});
