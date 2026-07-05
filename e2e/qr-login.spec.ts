import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { getAddress } from "viem";
import { SiweMessage } from "siwe";
import path from "node:path";

/**
 * WALLET-QR LOGIN e2e (Wave 13 D1) — over-the-wire proof of the cross-device
 * flow: device A starts, device B signs a SIWE bound to the challenge and
 * approves, device A's poll is issued a real session (single-use).
 *
 * REGISTER BUDGET (Global Constraint #8): ZERO registrations — the user + its
 * verified wallet are bootstrapped via DIRECT prisma (the same dev.db the prod
 * webServer serves). The full-run ledger stays at 9. Device B "signs" with a
 * viem account whose address IS the seeded verified wallet (mirrors the
 * admin-panel/referrals request-level bootstrap).
 */

const BASE = "http://localhost:3000";
const EMAIL = "qr-login-e2e@cryptrepublic.local";

const db = new PrismaClient({
  datasources: { db: { url: "file:" + path.resolve(__dirname, "../prisma/dev.db") } },
});
const account = privateKeyToAccount(generatePrivateKey());
let userId = "";

async function stubRpc(page: Page) {
  await page.route("**/api/rpc/**", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x0" }),
    }),
  );
}

async function expectNoCriticalOrSerious(name: string, page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  expect(
    blocking.map((v) => v.id),
    `${name}: zero critical/serious axe`,
  ).toEqual([]);
}

test.describe.serial("wallet-QR login (Wave 13 D1 — zero registrations)", () => {
  test.beforeAll(async () => {
    await db.user.deleteMany({ where: { email: EMAIL } });
    const user = await db.user.create({
      data: {
        email: EMAIL,
        name: "E2E QR Login",
        linkedWallets: {
          create: { address: getAddress(account.address), chain: "EVM", verifiedAt: new Date() },
        },
      },
    });
    userId = user.id;
  });

  test.afterAll(async () => {
    try {
      await db.walletLoginChallenge.deleteMany({ where: { userId } });
      await db.session.deleteMany({ where: { userId } });
      await db.linkedWallet.deleteMany({ where: { address: getAddress(account.address) } });
      await db.user.deleteMany({ where: { email: EMAIL } });
    } finally {
      await db.$disconnect();
    }
  });

  test("device A starts, device B signs+approves, device A's poll issues a single-use session", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const ctx = await browser.newContext({ baseURL: BASE });

    // Device A: start a login (unauthenticated) → public challenge fields.
    const startRes = await ctx.request.post("/api/auth/qr/start", {
      headers: { origin: BASE },
      data: {},
    });
    expect(startRes.status()).toBe(200);
    const start = (await startRes.json()) as {
      challengeId: string;
      nonce: string;
      matchCode: string;
      domain: string;
      uri: string;
      chainId: number;
    };
    expect(start.matchCode).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);

    // Device B: sign a SIWE BOUND to the challenge (same domain/uri/chain/nonce
    // the server issued) with the verified wallet, and approve.
    const message = new SiweMessage({
      domain: start.domain,
      address: getAddress(account.address),
      statement: "Approve a CryptRepublic wallet-QR login.",
      uri: start.uri,
      version: "1",
      chainId: start.chainId,
      nonce: start.nonce,
      issuedAt: new Date().toISOString(),
    }).prepareMessage();
    const signature = await account.signMessage({ message });
    const approveRes = await ctx.request.post("/api/auth/qr/approve", {
      headers: { origin: BASE },
      data: { challengeId: start.challengeId, message, signature },
    });
    expect(approveRes.status(), await approveRes.text()).toBe(200);

    // Device A: poll → approved + a session cookie on THIS context.
    const statusRes = await ctx.request.get(
      `/api/auth/qr/status?challengeId=${start.challengeId}`,
      { headers: { origin: BASE } },
    );
    expect(statusRes.status()).toBe(200);
    expect((await statusRes.json()).status).toBe("approved");
    const cookies = await ctx.cookies();
    expect(cookies.some((c) => c.name === "cr_session")).toBe(true);

    // The session is real: /dashboard renders (no redirect to /auth).
    const page = await ctx.newPage();
    await stubRpc(page);
    await page.goto("/dashboard");
    expect(page.url()).toContain("/dashboard");

    // Single-use: a second poll of the same challenge → expired (no new session).
    const status2 = await ctx.request.get(`/api/auth/qr/status?challengeId=${start.challengeId}`, {
      headers: { origin: BASE },
    });
    expect((await status2.json()).status).toBe("expired");

    await ctx.close();
  });

  test("the /auth Wallet-QR entry renders a QR + matchCode (+ axe)", async ({ page }) => {
    test.setTimeout(90_000);
    await stubRpc(page);
    await page.goto("/auth");
    await page.getByTestId("qr-login-open").click();
    await expect(page.getByTestId("qr-login-image")).toBeVisible();
    await expect(page.getByTestId("qr-login-matchcode")).toHaveText(
      /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/,
    );
    await expectNoCriticalOrSerious("/auth (QR sign-in)", page);
  });
});
