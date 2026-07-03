// @vitest-environment node
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { issueNonce } from "@/lib/auth/siwe";

/**
 * issueNonce hygiene (audit finding): issuing a nonce opportunistically drops
 * EXPIRED and already-USED nonces so the SiweNonce table stays bounded. Only
 * dead nonces are removed — a fresh, unused, unexpired nonce (in-flight for a
 * concurrent login) is never touched, so parallel suites are unaffected.
 */
describe("issueNonce hygiene", () => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const expiredNonce = `expired-${suffix}`;
  const usedNonce = `used-${suffix}`;
  let fresh = "";

  it("drops expired + used nonces on the next issuance; the fresh one survives", async () => {
    await prisma.siweNonce.create({
      data: { nonce: expiredNonce, expiresAt: new Date(Date.now() - 1000) },
    });
    await prisma.siweNonce.create({
      data: { nonce: usedNonce, usedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) },
    });

    fresh = await issueNonce();

    expect(await prisma.siweNonce.findUnique({ where: { nonce: expiredNonce } })).toBeNull();
    expect(await prisma.siweNonce.findUnique({ where: { nonce: usedNonce } })).toBeNull();
    // A brand-new nonce (unused, unexpired) is NOT swept away.
    expect(await prisma.siweNonce.findUnique({ where: { nonce: fresh } })).not.toBeNull();
  });

  afterAll(async () => {
    await prisma.siweNonce.deleteMany({
      where: { nonce: { in: [expiredNonce, usedNonce, fresh] } },
    });
    await prisma.$disconnect();
  });
});
