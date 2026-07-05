// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { SiweMessage } from "siwe";
import { prisma } from "@/lib/db";
import { createChallenge } from "@/lib/auth/qrLogin/challenge";
import { issueNonce } from "@/lib/auth/siwe";
import { __resetRateLimit } from "@/lib/auth/ratelimit";
import { POST as approvePost } from "./route";

/**
 * POST /api/auth/qr/approve — device B proves wallet possession to approve a
 * scanned login. It NEVER creates an account (existing verified wallet only),
 * binds the SIWE nonce to the challenge, rejects suspended users opaquely, and
 * is single-use.
 */

const APP = "http://localhost:3000";
const DOMAIN = "localhost:3000";
const CHAIN_ID = 84532;

const walletUser = privateKeyToAccount(generatePrivateKey()); // verified wallet → active user
const suspendedWallet = privateKeyToAccount(generatePrivateKey()); // verified wallet → suspended user
const unknownWallet = privateKeyToAccount(generatePrivateKey()); // no linked wallet

let activeUserId: string;
const createdUsers: string[] = [];
const createdChallenges: string[] = [];

async function siweFor(
  nonce: string,
  account = walletUser,
): Promise<{ message: string; signature: string }> {
  const msg = new SiweMessage({
    domain: DOMAIN,
    address: account.address,
    statement: "Approve a CryptRepublic wallet-QR login.",
    uri: APP,
    version: "1",
    chainId: CHAIN_ID,
    nonce,
    issuedAt: new Date().toISOString(),
  });
  const message = msg.prepareMessage();
  const signature = await account.signMessage({ message });
  return { message, signature };
}

function approveReq(body: unknown, opts: { origin?: string | null } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const origin = opts.origin === undefined ? APP : opts.origin;
  if (origin) headers.origin = origin;
  return new Request(`${APP}/api/auth/qr/approve`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function freshChallenge(): Promise<{ challengeId: string; nonce: string }> {
  const c = await createChallenge();
  createdChallenges.push(c.challengeId);
  return { challengeId: c.challengeId, nonce: c.nonce };
}

describe("POST /api/auth/qr/approve", () => {
  beforeAll(async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const u = await prisma.user.create({
      data: {
        email: `qr-approve-${suffix}@w13.example`,
        linkedWallets: {
          create: { address: walletUser.address, chain: "EVM", verifiedAt: new Date() },
        },
      },
    });
    const s = await prisma.user.create({
      data: {
        email: `qr-approve-susp-${suffix}@w13.example`,
        suspendedAt: new Date(),
        linkedWallets: {
          create: { address: suspendedWallet.address, chain: "EVM", verifiedAt: new Date() },
        },
      },
    });
    activeUserId = u.id;
    createdUsers.push(u.id, s.id);
  });

  beforeEach(() => __resetRateLimit());

  afterAll(async () => {
    await prisma.walletLoginChallenge.deleteMany({ where: { id: { in: createdChallenges } } });
    await prisma.linkedWallet.deleteMany({
      where: { address: { in: [walletUser.address, suspendedWallet.address] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    await prisma.$disconnect();
  });

  it("403 foreign origin; 400 bad body", async () => {
    const { challengeId, nonce } = await freshChallenge();
    const { message, signature } = await siweFor(nonce);
    expect(
      (
        await approvePost(
          approveReq({ challengeId, message, signature }, { origin: "https://evil.example" }),
        )
      ).status,
    ).toBe(403);
    expect((await approvePost(approveReq({ nope: 1 }))).status).toBe(400);
  });

  it("400 for an unknown challenge (rejected before the SIWE nonce is burned)", async () => {
    const { message, signature } = await siweFor(await issueNonce());
    const res = await approvePost(approveReq({ challengeId: "does-not-exist", message, signature }));
    expect(res.status).toBe(400);
  });

  it("approves a valid SIWE from a verified-wallet user → challenge approved + bound", async () => {
    const { challengeId, nonce } = await freshChallenge();
    const { message, signature } = await siweFor(nonce);
    const res = await approvePost(approveReq({ challengeId, message, signature }));
    expect(res.status).toBe(200);
    const row = await prisma.walletLoginChallenge.findUnique({ where: { id: challengeId } });
    expect(row?.status).toBe("approved");
    expect(row?.userId).toBe(activeUserId);
  });

  it("400 when the SIWE nonce is for a DIFFERENT challenge", async () => {
    const { challengeId } = await freshChallenge();
    const otherNonce = await issueNonce(); // valid, but not this challenge's nonce
    const { message, signature } = await siweFor(otherNonce);
    const res = await approvePost(approveReq({ challengeId, message, signature }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/different login request/i);
  });

  it("400 for a wallet with no verified account — and never creates one", async () => {
    const { challengeId, nonce } = await freshChallenge();
    const { message, signature } = await siweFor(nonce, unknownWallet);
    const res = await approvePost(approveReq({ challengeId, message, signature }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no cryptrepublic account/i);
    expect(
      await prisma.linkedWallet.findUnique({ where: { address: unknownWallet.address } }),
    ).toBeNull();
  });

  it("400 (opaque) for a suspended user", async () => {
    const { challengeId, nonce } = await freshChallenge();
    const { message, signature } = await siweFor(nonce, suspendedWallet);
    expect((await approvePost(approveReq({ challengeId, message, signature }))).status).toBe(400);
  });

  it("400 on replay of the same approve (single-use)", async () => {
    const { challengeId, nonce } = await freshChallenge();
    const { message, signature } = await siweFor(nonce);
    expect((await approvePost(approveReq({ challengeId, message, signature }))).status).toBe(200);
    expect((await approvePost(approveReq({ challengeId, message, signature }))).status).toBe(400);
  });

  it("400 on an invalid signature", async () => {
    const { challengeId, nonce } = await freshChallenge();
    const { message } = await siweFor(nonce);
    const res = await approvePost(
      approveReq({ challengeId, message, signature: `0x${"11".repeat(65)}` }),
    );
    expect(res.status).toBe(400);
  });
});
