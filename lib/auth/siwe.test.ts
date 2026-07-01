// @vitest-environment node
import { describe, it, expect, afterAll } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { getAddress } from "viem";
import { SiweMessage } from "siwe";
import { prisma } from "@/lib/db";
import { issueNonce, verifySiwe, SiweError } from "./siwe";

// Anvil's well-known account #0 private key — a PUBLIC test key, never a real secret.
const account = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);
const DOMAIN = "localhost:3000";
const URI = "http://localhost:3000";
const CHAIN_ID = 84532;

async function signed(nonce: string, overrides: Partial<{ domain: string; uri: string }> = {}) {
  const msg = new SiweMessage({
    domain: overrides.domain ?? DOMAIN,
    address: account.address,
    statement: "Sign in to CryptRepublic.",
    uri: overrides.uri ?? URI,
    version: "1",
    chainId: CHAIN_ID,
    nonce,
    issuedAt: new Date().toISOString(),
  });
  const prepared = msg.prepareMessage();
  const signature = await account.signMessage({ message: prepared });
  return { message: prepared, signature };
}

describe("verifySiwe", () => {
  it("verifies a valid message and links the wallet", async () => {
    const nonce = await issueNonce();
    const { message, signature } = await signed(nonce);
    const res = await verifySiwe(message, signature);
    expect(res.address.toLowerCase()).toBe(account.address.toLowerCase());
    const lw = await prisma.linkedWallet.findUnique({ where: { address: res.address } });
    expect(lw?.verifiedAt).not.toBeNull();
  });

  it("rejects nonce reuse (single-use)", async () => {
    const nonce = await issueNonce();
    const a = await signed(nonce);
    await verifySiwe(a.message, a.signature);
    const b = await signed(nonce);
    await expect(verifySiwe(b.message, b.signature)).rejects.toBeInstanceOf(SiweError);
  });

  it("rejects a wrong domain", async () => {
    const nonce = await issueNonce();
    const { message, signature } = await signed(nonce, { domain: "evil.example" });
    await expect(verifySiwe(message, signature)).rejects.toBeInstanceOf(SiweError);
  });

  it("rejects a wrong uri (uri binding)", async () => {
    const nonce = await issueNonce();
    const { message, signature } = await signed(nonce, { uri: "http://evil.example" });
    await expect(verifySiwe(message, signature)).rejects.toBeInstanceOf(SiweError);
  });

  it("rejects an expired / unknown nonce", async () => {
    const { message, signature } = await signed("neverissuednonce000000");
    await expect(verifySiwe(message, signature)).rejects.toBeInstanceOf(SiweError);
  });

  afterAll(async () => {
    // Delete ONLY the records this test created — never a blanket where:{email:null}.
    const address = getAddress(account.address);
    const wallets = await prisma.linkedWallet.findMany({
      where: { address },
      select: { userId: true },
    });
    const userIds = [...new Set(wallets.map((w) => w.userId))];
    if (userIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await prisma.linkedWallet.deleteMany({ where: { address } });
    await prisma.$disconnect();
  });
});
