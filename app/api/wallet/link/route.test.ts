// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { SiweMessage } from "siwe";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { issueNonce } from "@/lib/auth/siwe";
import { __resetRateLimit } from "@/lib/auth/ratelimit";
import { POST as linkPost } from "./route";

/**
 * POST /api/wallet/link (the email-account wallet-verification gap fix).
 * Contract: SIWE-proven key possession binds the wallet to the LOGGED-IN
 * account (verifiedAt set → resolveApplicantAddress and the Wave-10 admin-mint
 * override can resolve it); a wallet linked to another account is a 409; a
 * replayed/invalid signature is a 400; the guards are the standard stack.
 */

const APP = "http://localhost:3000";
const DOMAIN = "localhost:3000";
const CHAIN_ID = 84532;

let userId: string;
let otherUserId: string;
let token: string;
const cleanupAddresses: string[] = [];

// Fresh throwaway key per run — unique addresses, no cross-suite collisions.
const account = privateKeyToAccount(generatePrivateKey());

async function signedLink(addressAccount = account) {
  const nonce = await issueNonce();
  const msg = new SiweMessage({
    domain: DOMAIN,
    address: addressAccount.address,
    statement: "Verify this wallet for my CryptRepublic account.",
    uri: APP,
    version: "1",
    chainId: CHAIN_ID,
    nonce,
    issuedAt: new Date().toISOString(),
  });
  const message = msg.prepareMessage();
  const signature = await addressAccount.signMessage({ message });
  return { message, signature };
}

function linkReq(body: unknown, opts: { token?: string; origin?: string | null } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const origin = opts.origin === undefined ? APP : opts.origin;
  if (origin) headers.origin = origin;
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}/api/wallet/link`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/wallet/link", () => {
  beforeAll(async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const passwordHash = await hashPassword("correct horse battery staple");
    const user = await prisma.user.create({
      data: { email: `wallet-link-${suffix}@w11link.example`, passwordHash },
    });
    const other = await prisma.user.create({
      data: { email: `wallet-link-other-${suffix}@w11link.example`, passwordHash },
    });
    userId = user.id;
    otherUserId = other.id;
    ({ token } = await createSession(userId));
  });

  beforeEach(() => __resetRateLimit());

  it("401 without a session; 403 with a foreign origin; 400 on a bad body", async () => {
    const { message, signature } = await signedLink();
    expect((await linkPost(linkReq({ message, signature }))).status).toBe(401);
    expect(
      (await linkPost(linkReq({ message, signature }, { token, origin: "https://evil.example" })))
        .status,
    ).toBe(403);
    expect((await linkPost(linkReq({ nope: 1 }, { token }))).status).toBe(400);
  });

  it("links a SIWE-proven wallet to the LOGGED-IN account, verified", async () => {
    const { message, signature } = await signedLink();
    const res = await linkPost(linkReq({ message, signature }, { token }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.address.toLowerCase()).toBe(account.address.toLowerCase());
    cleanupAddresses.push(body.address);
    const lw = await prisma.linkedWallet.findUnique({ where: { address: body.address } });
    expect(lw?.userId).toBe(userId);
    expect(lw?.verifiedAt).not.toBeNull();
  });

  it("re-verifying the SAME account's wallet is idempotent (verifiedAt refreshed)", async () => {
    const { message, signature } = await signedLink();
    const res = await linkPost(linkReq({ message, signature }, { token }));
    expect(res.status).toBe(200);
  });

  it("409 when the wallet is already linked to ANOTHER account", async () => {
    const foreign = privateKeyToAccount(generatePrivateKey());
    await prisma.linkedWallet.create({
      data: {
        userId: otherUserId,
        address: foreign.address,
        chain: "EVM",
        verifiedAt: new Date(),
      },
    });
    cleanupAddresses.push(foreign.address);
    const { message, signature } = await signedLink(foreign);
    const res = await linkPost(linkReq({ message, signature }, { token }));
    expect(res.status).toBe(409);
    // Still the other account's wallet — no silent re-parenting.
    const lw = await prisma.linkedWallet.findUnique({ where: { address: foreign.address } });
    expect(lw?.userId).toBe(otherUserId);
  });

  it("400 on an invalid signature (never links)", async () => {
    const { message } = await signedLink();
    const res = await linkPost(linkReq({ message, signature: `0x${"11".repeat(65)}` }, { token }));
    expect(res.status).toBe(400);
  });

  it("400 on nonce replay (single-use)", async () => {
    const { message, signature } = await signedLink();
    expect((await linkPost(linkReq({ message, signature }, { token }))).status).toBe(200);
    expect((await linkPost(linkReq({ message, signature }, { token }))).status).toBe(400);
  });

  afterAll(async () => {
    await prisma.linkedWallet.deleteMany({ where: { address: { in: cleanupAddresses } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await prisma.$disconnect();
  });
});
