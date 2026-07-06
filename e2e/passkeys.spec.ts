import { test, expect, type Page, type Route, type CDPSession } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";
import path from "node:path";

/**
 * PASSKEYS (WebAuthn) e2e (Wave 14 D1) — the REAL cryptographic proof, via
 * Chrome's CDP virtual authenticator (WebAuthn.enable + addVirtualAuthenticator).
 * A single browser context + page keeps the discoverable credential available
 * across enroll → sign-out → passwordless sign-in → require-passkey step-up.
 *
 * REGISTER BUDGET: ZERO registrations — the user + password are bootstrapped
 * via DIRECT prisma; the full-run ledger stays at 9.
 */

const BASE = "http://localhost:3000";
const EMAIL = "passkeys-e2e@cryptrepublic.local";
const PASS = randomBytes(24).toString("base64url");
const ARGON2_OPTIONS = { memoryCost: 65536, timeCost: 3, parallelism: 1, outputLen: 32 } as const;

const db = new PrismaClient({
  datasources: { db: { url: "file:" + path.resolve(__dirname, "../prisma/dev.db") } },
});
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

test.describe
  .serial("passkeys (Wave 14 D1 — CDP virtual authenticator, zero registrations)", () => {
  let page: Page;
  let cdp: CDPSession;

  test.beforeAll(async ({ browser }) => {
    await db.user.deleteMany({ where: { email: EMAIL } });
    const passwordHash = await hash(PASS, ARGON2_OPTIONS);
    const user = await db.user.create({
      data: { email: EMAIL, passwordHash, name: "E2E Passkeys" },
    });
    userId = user.id;

    const context = await browser.newContext({ baseURL: BASE });
    // Sign in with the password so the enrollment page is reachable.
    const login = await context.request.post("/api/auth/login", {
      data: { email: EMAIL, passphrase: PASS },
      headers: { origin: BASE },
    });
    expect(login.status(), "password login").toBe(200);

    page = await context.newPage();
    await stubRpc(page);

    // Attach a virtual authenticator to this page for the whole flow.
    cdp = await page.context().newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });
  });

  test.afterAll(async () => {
    try {
      await db.webAuthnCredential.deleteMany({ where: { userId } });
      await db.webAuthnChallenge.deleteMany({ where: { userId } });
      await db.session.deleteMany({ where: { userId } });
      await db.user.deleteMany({ where: { email: EMAIL } });
    } finally {
      await db.$disconnect();
    }
  });

  test("enroll a passkey on the security page → it persists (public key) + axe", async () => {
    test.setTimeout(90_000);
    await page.goto("/dashboard/wallet/security");
    await expect(page.getByTestId("passkey-empty")).toBeVisible();

    await page.getByTestId("passkey-label").fill("E2E Virtual Key");
    await page.getByTestId("passkey-enroll").click();

    await expect(page.getByTestId("passkey-row")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("passkey-list")).toContainText("E2E Virtual Key");

    const cred = await db.webAuthnCredential.findFirst({ where: { userId } });
    expect(cred, "credential persisted").not.toBeNull();
    expect(cred!.publicKey.length).toBeGreaterThan(0); // a PUBLIC key was stored
    expect(cred!.deviceType.length).toBeGreaterThan(0);

    await expectNoCriticalOrSerious("/dashboard/wallet/security", page);
  });

  test("passwordless: sign out, then sign in with the passkey → /dashboard", async () => {
    test.setTimeout(90_000);
    // Drop the session cookie — now unauthenticated, but the discoverable
    // credential still lives in the virtual authenticator.
    await page.context().clearCookies();
    await page.goto("/dashboard/wallet/security");
    await expect(page).toHaveURL(/\/auth(?:$|[/?#])/); // guard bounced us out

    await page.getByTestId("passkey-login-open").click();
    await expect(page).toHaveURL(/\/dashboard(?:$|[/?#])/, { timeout: 30_000 });
    const cookies = await page.context().cookies();
    expect(cookies.some((c) => c.name === "cr_session")).toBe(true);
  });

  test("require-passkey: password login returns the step-up, completed by the passkey", async () => {
    test.setTimeout(90_000);
    // We're signed in (previous test). Turn on require-passkey.
    await page.goto("/dashboard/wallet/security");
    await expect(page.getByTestId("passkey-row")).toBeVisible();
    // A controlled-async checkbox (checked flips only after the /2fa fetch
    // resolves), so click + wait rather than .check() (which asserts an
    // immediate state change).
    await page.getByTestId("passkey-2fa-toggle").click();
    await expect(page.getByTestId("passkey-2fa-toggle")).toBeChecked();
    expect((await db.user.findUnique({ where: { id: userId } }))!.passkey2faEnabled).toBe(true);

    // Sign out and do a PASSWORD login on /auth.
    await page.context().clearCookies();
    await page.goto("/auth");
    await page.getByLabel(/E-MAIL OF RECORD/i).fill(EMAIL);
    await page.getByLabel(/PASSPHRASE/i).fill(PASS);
    await page.getByRole("button", { name: /AUTHENTICATE/i }).click();

    // Password alone does NOT sign in — the step-up prompt appears...
    await expect(page.getByTestId("passkey-2fa-complete")).toBeVisible({ timeout: 15_000 });
    expect(page.url()).toContain("/auth");
    await expectNoCriticalOrSerious("/auth (passkey step-up)", page); // still on /auth

    // ...completing with the passkey issues the session.
    await page.getByTestId("passkey-2fa-complete").click();
    await expect(page).toHaveURL(/\/dashboard(?:$|[/?#])/, { timeout: 30_000 });
    expect((await page.context().cookies()).some((c) => c.name === "cr_session")).toBe(true);
  });
});
