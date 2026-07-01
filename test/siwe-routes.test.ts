// @vitest-environment node
import { describe, it, expect, afterAll } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { getAddress } from "viem";
import { SiweMessage } from "siwe";
import { prisma } from "@/lib/db";
import { GET as nonceRoute } from "@/app/api/auth/siwe/nonce/route";
import { POST as verifyRoute } from "@/app/api/auth/siwe/verify/route";
import { hashToken } from "@/lib/auth/tokens";

// Anvil account #1 (public test key) — distinct from the lib test's account #0 to avoid
// cross-test interference on the unique wallet address.
const account = privateKeyToAccount(
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
);
const APP = "http://localhost:3000";
const DOMAIN = "localhost:3000";
const URI = "http://localhost:3000";
const CHAIN_ID = 84532;

function cookieToken(res: Response): string | undefined {
  const sc = res.headers.get("set-cookie") ?? "";
  return sc.match(/cr_session=([^;]+)/)?.[1];
}

async function signed(nonce: string) {
  const msg = new SiweMessage({
    domain: DOMAIN,
    address: account.address,
    statement: "Sign in to CryptRepublic.",
    uri: URI,
    version: "1",
    chainId: CHAIN_ID,
    nonce,
    issuedAt: new Date().toISOString(),
  });
  const message = msg.prepareMessage();
  const signature = await account.signMessage({ message });
  return { message, signature };
}

function verifyReq(body: unknown, origin = APP) {
  return new Request(APP + "/api/auth/siwe/verify", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("siwe routes", () => {
  it("nonce → sign → verify seals a session; replay is rejected; foreign origin is 403", async () => {
    const nonceRes = await nonceRoute();
    const { nonce } = (await nonceRes.json()) as { nonce: string };
    expect(nonce).toBeTruthy();

    const { message, signature } = await signed(nonce);

    // foreign origin → 403 (does not consume the nonce)
    const foreign = await verifyRoute(verifyReq({ message, signature }, "https://evil.example"));
    expect(foreign.status).toBe(403);

    // valid → 200 + cr_session cookie + a Session row
    const ok = await verifyRoute(verifyReq({ message, signature }));
    expect(ok.status).toBe(200);
    const token = cookieToken(ok);
    expect(token).toBeTruthy();
    const session = await prisma.session.findUnique({
      where: { tokenHash: hashToken(token!) },
    });
    expect(session).not.toBeNull();

    // replay of the same message → 401 (nonce already consumed)
    const replay = await verifyRoute(verifyReq({ message, signature }));
    expect(replay.status).toBe(401);
  });

  afterAll(async () => {
    // Delete ONLY records created by this test (by our test wallet address).
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
