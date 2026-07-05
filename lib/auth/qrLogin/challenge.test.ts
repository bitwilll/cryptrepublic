// @vitest-environment node
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createChallenge, loadPendingChallenge, makeMatchCode, CHALLENGE_TTL_MS } from "./challenge";

const created: string[] = [];

afterAll(async () => {
  await prisma.walletLoginChallenge.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

describe("wallet-login challenge helpers", () => {
  it("makeMatchCode is 6 chars from the unambiguous alphabet", () => {
    for (let i = 0; i < 20; i++) {
      expect(makeMatchCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });

  it("createChallenge inserts a pending, unexpired row whose nonce is also a SiweNonce", async () => {
    const { challengeId, nonce, matchCode } = await createChallenge();
    created.push(challengeId);
    const row = await prisma.walletLoginChallenge.findUnique({ where: { id: challengeId } });
    expect(row?.status).toBe("pending");
    expect(row?.nonce).toBe(nonce);
    expect(row?.matchCode).toBe(matchCode);
    expect(row!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(row!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + CHALLENGE_TTL_MS + 2000);
    // The nonce is a real single-use SiweNonce (verifySiweSignature will consume it).
    expect(await prisma.siweNonce.findUnique({ where: { nonce } })).not.toBeNull();
  });

  it("loadPendingChallenge returns null for an expired row and for an unknown id", async () => {
    const { challengeId } = await createChallenge();
    created.push(challengeId);
    await prisma.walletLoginChallenge.update({
      where: { id: challengeId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await loadPendingChallenge(challengeId)).toBeNull();
    expect(await loadPendingChallenge("does-not-exist")).toBeNull();
    expect(await loadPendingChallenge("")).toBeNull();
  });

  it("loadPendingChallenge returns null once the row is no longer pending", async () => {
    const { challengeId } = await createChallenge();
    created.push(challengeId);
    await prisma.walletLoginChallenge.update({
      where: { id: challengeId },
      data: { status: "approved", userId: "u-x" },
    });
    expect(await loadPendingChallenge(challengeId)).toBeNull();
  });

  it("the sweeper deletes an expired challenge on the next createChallenge", async () => {
    const { challengeId } = await createChallenge();
    await prisma.walletLoginChallenge.update({
      where: { id: challengeId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const next = await createChallenge();
    created.push(next.challengeId);
    expect(await prisma.walletLoginChallenge.findUnique({ where: { id: challengeId } })).toBeNull();
  });
});
