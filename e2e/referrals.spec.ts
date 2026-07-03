import { test, expect, type BrowserContext, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";
import path from "node:path";

/**
 * REFERRALS & TRUST e2e (Wave 12 D5) — over-the-wire proof of the admin
 * allocate-tokens + set-trust panel and the citizen referrals surface.
 *
 * REGISTER BUDGET (Global Constraint #9): ZERO registrations — users are
 * bootstrapped via DIRECT prisma (same dev.db the prod webServer serves) and
 * log in via POST /api/auth/login. The full-run ledger stays at 9.
 *
 * Chain reads are stubbed via page.route so the pages render deterministically
 * without a live chain (the referral/trust routes degrade gracefully anyway).
 */

const BASE = "http://localhost:3000";
const ADMIN_EMAIL = "referrals-admin-e2e@cryptrepublic.local";
const CITIZEN_EMAIL = "referrals-citizen-e2e@cryptrepublic.local";
const PASS = randomBytes(24).toString("base64url");
const ARGON2_OPTIONS = { memoryCost: 65536, timeCost: 3, parallelism: 1, outputLen: 32 } as const;

const db = new PrismaClient({
  datasources: { db: { url: "file:" + path.resolve(__dirname, "../prisma/dev.db") } },
});

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
  expect(blocking.map((v) => v.id), `${name}: zero critical/serious axe`).toEqual([]);
}

let adminId = "";
let citizenId = "";

test.describe.serial("referrals & trust (Wave 12 D5 — zero registrations)", () => {
  let adminCtx: BrowserContext;
  let adminPage: Page;
  let citizenCtx: BrowserContext;
  let citizenPage: Page;

  test.beforeAll(async ({ browser }) => {
    await db.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, CITIZEN_EMAIL] } } });
    const passwordHash = await hash(PASS, ARGON2_OPTIONS);
    const admin = await db.user.create({
      data: { email: ADMIN_EMAIL, passwordHash, name: "E2E Referrals Admin", role: "ADMIN" },
    });
    const citizen = await db.user.create({
      data: { email: CITIZEN_EMAIL, passwordHash, name: "E2E Referrals Citizen" },
    });
    adminId = admin.id;
    citizenId = citizen.id;

    adminCtx = await browser.newContext({ baseURL: BASE });
    citizenCtx = await browser.newContext({ baseURL: BASE });
    for (const [ctx, email] of [
      [adminCtx, ADMIN_EMAIL],
      [citizenCtx, CITIZEN_EMAIL],
    ] as const) {
      const res = await ctx.request.post("/api/auth/login", {
        data: { email, passphrase: PASS },
        headers: { origin: BASE },
      });
      expect(res.status(), `login ${email}`).toBe(200);
    }
    adminPage = await adminCtx.newPage();
    citizenPage = await citizenCtx.newPage();
    await stubRpc(adminPage);
    await stubRpc(citizenPage);
  });

  test.afterAll(async () => {
    try {
      await db.referral.deleteMany({ where: { referrerUserId: citizenId } });
      await db.auditLog.deleteMany({ where: { actorUserId: adminId } });
      await db.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, CITIZEN_EMAIL] } } });
    } finally {
      await db.$disconnect();
      await adminCtx?.close();
      await citizenCtx?.close();
    }
  });

  test("admin allocates referral tokens + sets trust on a user (audited, over the wire)", async () => {
    test.setTimeout(90_000);
    await adminPage.goto(`/admin/users/${citizenId}`);
    await expect(adminPage.getByTestId("admin-referral-panel")).toBeVisible();
    await expect(adminPage.getByTestId("admin-token-balance")).toHaveText("0");

    await adminPage.getByTestId("alloc-delta").fill("6");
    await adminPage.getByTestId("alloc-submit").click();
    await expect(adminPage.getByTestId("admin-token-balance")).toHaveText("6");

    await adminPage.getByTestId("trust-adjust").fill("40");
    await adminPage.getByTestId("trust-submit").click();
    await expect(adminPage.getByTestId("admin-trust-adjustment")).toHaveText("40");

    // The DB reflects the audited mutations.
    const u = await db.user.findUnique({ where: { id: citizenId } });
    expect(u?.referralTokenBalance).toBe(6);
    expect(u?.trustAdjustment).toBe(40);
    const audits = await db.auditLog.count({
      where: { actorUserId: adminId, action: { in: ["referral.token.allocate", "trust.adjust"] } },
    });
    expect(audits).toBeGreaterThanOrEqual(2);
  });

  test("citizen sees their read-only trust + token balance on /dashboard/referrals (+ axe)", async () => {
    test.setTimeout(90_000);
    await citizenPage.goto("/dashboard/referrals");
    await expect(citizenPage.getByTestId("referral-trust-card")).toBeVisible();
    await expect(citizenPage.getByTestId("referral-token-balance")).toHaveText("6");
    await citizenPage.waitForLoadState("networkidle");
    await expectNoCriticalOrSerious("/dashboard/referrals", citizenPage);
  });
});
