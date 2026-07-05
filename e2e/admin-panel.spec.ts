import { test, expect, type BrowserContext, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * ADMIN PANEL e2e (Wave 9 D2) — the over-the-wire proof of the admin back
 * office: layout guard, suspend-kills-the-live-session, content edit + audit,
 * the ONE flag consumer flipping, chain actions (stubbed registered fixture +
 * the live graceful default), axe, the Wave-10 A4 approve-mint override
 * station (witness-free adminMint prepared card — zero extra registrations,
 * zero extra logins; fixtures via DIRECT prisma, cascaded away in afterAll),
 * and the Wave-10 C1 responsive station (390px no-horizontal-overflow, stat
 * tiles navigate as REAL links, axe at mobile width).
 *
 * REGISTER BUDGET (Global Constraint #5/#9): a full `pnpm e2e` run performs 9
 * registrations — auth.spec 1 + mint.spec 2 + wallet-screen.spec 2 +
 * dashboard-screens.spec 3 + critical-path.spec 1. THIS SPEC ADDS ZERO: users
 * are bootstrapped via DIRECT prisma (the webServer `pnpm build && pnpm start`
 * serves the same prisma/dev.db) and log in via POST /api/auth/login (limit
 * 20/15min per IP — grep-verified used by NO other spec; ~2 logins here). Any
 * future spec must update this ledger and keep registrations UNDER 10.
 *
 * NO COMMITTED CREDENTIALS (post-review addendum #2): the password is a
 * PER-RUN random string (crypto.randomBytes) hashed AT RUNTIME with
 * @node-rs/argon2 using lib/auth/password.ts's exact Argon2id params — no
 * plaintext/KNOWN_HASH pair ever lands in the repo or persists in dev.db
 * beyond the run (afterAll deletes the fixtures).
 *
 * PRISMA DIRECT: `@prisma/client` with an ABSOLUTE file: URL — SQLite relative
 * URLs resolve against prisma/schema.prisma, not CWD; `@/lib/db` is
 * "server-only" and unimportable in the Playwright node process (note #1).
 *
 * FLAG DETERMINISM (note #8): station 5 flips `population_world_map` LIVE and
 * re-visits /dashboard/population in the same context — deterministic ONLY
 * because /api/flags serves `Cache-Control: no-store` (B2, test-pinned). The
 * parallel-running dashboard-screens.spec.ts is independently protected by its
 * own `/api/flags → { flags: {} }` stub (C3). If this station flakes, check
 * that header FIRST.
 *
 * A11Y THRESHOLD (same as e2e/a11y.spec.ts): ZERO critical + ZERO serious on
 * /admin, /admin/users, /admin/chain; moderate/minor logged, not failed.
 * Specs are standalone — the axe helper is COPIED, not imported cross-spec.
 */

const BASE = "http://localhost:3000";
const ADMIN_EMAIL = "admin-e2e@cryptrepublic.local";
const CITIZEN_EMAIL = "citizen-e2e@cryptrepublic.local";
// Per-run random password — never committed, never reused across runs.
const PASS = randomBytes(24).toString("base64url");
// lib/auth/password.ts OPTIONS, mirrored exactly (Argon2id; memoryCost in KiB).
const ARGON2_OPTIONS = { memoryCost: 65536, timeCost: 3, parallelism: 1, outputLen: 32 } as const;

const db = new PrismaClient({
  datasources: { db: { url: "file:" + path.resolve(__dirname, "../prisma/dev.db") } },
});

let adminContext: BrowserContext;
let citizenContext: BrowserContext;
let adminPage: Page;
let citizenPage: Page;
let adminId = "";
let citizenId = "";
let originalHours = "";
const HOURS_MARKER = `E2E HOURS ${Date.now()}`;

// ─────────────────────────────────────────────────────────────────────────────
// Station-6 chain fixtures — a deterministic REGISTERED-chain payload for the
// composer. Addresses are LOWERCASE hex on purpose: mixed-case strings that are
// not valid EIP-55 checksums make viem's encodeFunctionData throw.
// ─────────────────────────────────────────────────────────────────────────────
const ANVIL_ADMIN = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
const GRANT_ACCOUNT = "0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc";
// Station 8 (Wave-10 A4) — the citizen fixture's verified wallet: the CHECKSUMMED
// anvil #4 address (a throwaway; no key ever touches this spec). resolvedMintTo
// must render exactly this checksummed form (getAddress-normalized by the server).
const MINT_TO = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";
const ADDRS = {
  token: "0x5fbdb2315678afecb367f032d93f642f64180aa3",
  passport: "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512",
  governance: "0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0",
  treasury: "0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9",
  distributor: "0xdc64a140aa3e981100a9beca4e685f962f0cf6c9",
  staking: "0x5fc8d32690cc91d4c39d9d3abcbd16989f875707",
} as const;
const ZERO32 = "0".repeat(64);
// grantRole(bytes32,address) selector + DEFAULT_ADMIN_ROLE (zero hash) + padded account —
// the byte-exact calldata the composer must produce for the default grant_role form.
const EXPECTED_GRANT_DATA = `0x2f2ff15d${ZERO32}${"0".repeat(24)}${GRANT_ACCOUNT.slice(2)}`;

const PARAMS_FIXTURE = {
  chainId: 31337,
  available: true,
  addresses: ADDRS,
  token: {
    paused: false,
    maxSupply: "1000000000000000000000000000",
    totalSupply: "100000000000000000000000000",
  },
  passport: { requiredWitnesses: 7, burnEnabled: false },
  governance: {
    votingPeriod: "259200",
    quorumBps: 2000,
    executionDelay: "172800",
    minCitizensForProposal: "3",
  },
  treasury: { totalAllocationBps: 0, allocations: [{ bucket: "embassy_ops", onchainBps: 0 }] },
  distributor: { currentEpoch: "0" },
  staking: { aprBps: 1180, totalStaked: "0", rewardPoolRemaining: "0" },
};

const ROLES_FIXTURE = {
  chainId: 31337,
  available: true,
  contracts: [
    {
      contract: "token",
      address: ADDRS.token,
      roles: [
        { role: "DEFAULT_ADMIN_ROLE", roleId: `0x${ZERO32}`, holders: [ANVIL_ADMIN] },
        { role: "PAUSER_ROLE", roleId: `0x${"11".repeat(32)}`, holders: [ANVIL_ADMIN] },
      ],
    },
    {
      contract: "staking",
      address: ADDRS.staking,
      roles: [
        { role: "REWARDS_ADMIN_ROLE", roleId: `0x${"22".repeat(32)}`, holders: [ANVIL_ADMIN] },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Station-5 population stubs — deterministic census fixtures (copied from the
// dashboard-screens catalog; specs are standalone). /api/flags is deliberately
// NOT stubbed: the LIVE flag read is the thing under test.
// ─────────────────────────────────────────────────────────────────────────────
const POPULATION_FIXTURES: Record<string, unknown> = {
  "/api/citizen/obligations": { obligations: [] },
  "/api/stats/activity": { activity: [] },
  "/api/stats/summary": { totalCitizens: "3" },
  "/api/stats/census": { delta24h: 0 },
  "/api/stats/inductions": { inductions: [] },
  "/api/governance/proposals": { proposals: [] },
  "/api/population/census": {
    totalCitizens: "3",
    cities: [
      {
        code: "LIS",
        name: "Lisbon",
        lat: 38.72,
        long: -9.14,
        hasEmbassy: true,
        liveCount: 0,
        seededCount: 1200,
      },
      {
        code: "BER",
        name: "Berlin",
        lat: 52.52,
        long: 13.4,
        hasEmbassy: true,
        liveCount: 0,
        seededCount: 800,
      },
    ],
  },
};

/** Canned JSON-RPC results (dashboard-screens subset) so shell reads render. */
function rpcResult(method: string): unknown {
  switch (method) {
    case "eth_chainId":
      return "0x14a34"; // 84532
    case "eth_blockNumber":
      return "0x1e8480";
    case "eth_gasPrice":
    case "eth_maxPriorityFeePerGas":
      return "0x3b9aca00";
    case "eth_getBalance":
    case "eth_getTransactionCount":
      return "0x0";
    case "eth_estimateGas":
      return "0x5208";
    case "eth_call":
      return `0x${"0".repeat(64)}`;
    case "eth_feeHistory":
      return {
        oldestBlock: "0x1e8480",
        baseFeePerGas: ["0x3b9aca00", "0x3b9aca00"],
        gasUsedRatio: [0.5],
        reward: [["0x3b9aca00"]],
      };
    default:
      return "0x0";
  }
}

async function stubPopulationReads(page: Page): Promise<void> {
  await page.route("**/api/rpc/**", async (route: Route) => {
    let body: unknown = {};
    try {
      body = JSON.parse(route.request().postData() ?? "{}");
    } catch {
      /* ignore */
    }
    const one = (r: { id?: number; method?: string }) => ({
      jsonrpc: "2.0",
      id: r?.id ?? 1,
      result: rpcResult(r?.method ?? ""),
    });
    const payload = Array.isArray(body)
      ? body.map(one)
      : one(body as { id?: number; method?: string });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });
  await page.route("**/api/**", async (route: Route) => {
    const p = new URL(route.request().url()).pathname;
    if (p.startsWith("/api/rpc/")) return route.fallback();
    if (p.startsWith("/api/admin/")) return route.fallback(); // the panel stays LIVE
    if (p === "/api/flags") return route.fallback(); // the LIVE flag read is under test
    const fixture = POPULATION_FIXTURES[p];
    if (fixture !== undefined) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fixture),
      });
      return;
    }
    await route.fallback();
  });
}

async function unstubReads(page: Page): Promise<void> {
  await page.unroute("**/api/**");
  await page.unroute("**/api/rpc/**");
}

/** Axe helper — copied from e2e/a11y.spec.ts (standalone; same threshold). */
async function expectNoCriticalOrSerious(
  name: string,
  results: Awaited<ReturnType<AxeBuilder["analyze"]>>,
) {
  const blocking = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  const advisory = results.violations.filter(
    (v) => v.impact !== "critical" && v.impact !== "serious",
  );
  for (const v of advisory) {
    console.log(`[a11y ${name}] ${v.impact}: ${v.id} — ${v.help} (${v.nodes.length} node(s))`);
  }
  expect(
    blocking.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map((n) => n.target.join(" ")).slice(0, 5),
    })),
    `${name}: zero critical/serious axe violations required`,
  ).toEqual([]);
}

async function login(ctx: BrowserContext, email: string): Promise<void> {
  const res = await ctx.request.post("/api/auth/login", {
    data: { email, passphrase: PASS },
    headers: { origin: BASE },
  });
  expect(res.status(), `login as ${email}`).toBe(200);
}

test.describe.serial("admin panel (Wave 9 D2 — zero registrations)", () => {
  test.beforeAll(async ({ browser }) => {
    // Stale-fixture cleanup (idempotent re-runs): scoped emails, NEVER @ex.org.
    await db.auditLog.deleteMany({ where: { actorLabel: `admin:${ADMIN_EMAIL}` } });
    await db.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, CITIZEN_EMAIL] } } });
    // Station 5 must start from the DECLARED-DEFAULT state (no DB row).
    await db.featureFlag.deleteMany({ where: { key: "population_world_map" } });

    const passwordHash = await hash(PASS, ARGON2_OPTIONS);
    const admin = await db.user.create({
      data: { email: ADMIN_EMAIL, passwordHash, name: "E2E Admin", role: "ADMIN" },
    });
    const citizen = await db.user.create({
      data: { email: CITIZEN_EMAIL, passwordHash, name: "E2E Ordinary User", role: "USER" },
    });
    adminId = admin.id;
    citizenId = citizen.id;

    // Station 4 edits the LIS embassy row — make it exist (seed values) and
    // remember the original hours so the station can restore them.
    const lis = await db.embassyDirectory.upsert({
      where: { code: "LIS" },
      update: {},
      create: {
        code: "LIS",
        name: "Lisbon",
        neighborhood: "Avenida da Liberdade · Príncipe Real",
        hours: "Mon–Sun · 09–22 WET",
        foundedAt: "2024.11.04",
        brandColor: "#7cffa6",
        city: "Lisbon",
        country: "Portugal",
      },
    });
    originalHours = lis.hours;

    citizenContext = await browser.newContext({ baseURL: BASE });
    citizenPage = await citizenContext.newPage();
    adminContext = await browser.newContext({ baseURL: BASE, acceptDownloads: true });
    adminPage = await adminContext.newPage();
  });

  test.afterAll(async () => {
    // Delete the fixtures: audit rows first (plain columns — no FK cascade),
    // then the flag row, the LIS restore (belt-and-braces if a mid-station
    // failure left the marker), then the users (sessions cascade).
    try {
      await db.auditLog.deleteMany({
        where: {
          OR: [{ actorUserId: adminId }, { targetId: { in: [adminId, citizenId] } }],
        },
      });
      await db.featureFlag.deleteMany({ where: { key: "population_world_map" } });
      if (originalHours) {
        await db.embassyDirectory.updateMany({
          where: { code: "LIS" },
          data: { hours: originalHours },
        });
      }
      await db.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, CITIZEN_EMAIL] } } });
    } finally {
      await db.$disconnect();
      await citizenContext?.close();
      await adminContext?.close();
    }
  });

  test("station 1 — non-admin guard: /admin redirects to /dashboard; API 403/401", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    await login(citizenContext, CITIZEN_EMAIL);

    // UX guard: an ordinary USER never sees the admin surface.
    await citizenPage.goto("/admin");
    await expect(citizenPage).toHaveURL(/\/dashboard(?:$|[/?#])/);

    // API enforcement is independent of the layout: 403 for the USER role…
    const forbidden = await citizenContext.request.get("/api/admin/users");
    expect(forbidden.status()).toBe(403);

    // …and 401 with no session at all.
    const anon = await browser.newContext({ baseURL: BASE });
    const unauthorized = await anon.request.get("/api/admin/users");
    expect(unauthorized.status()).toBe(401);
    await anon.close();
  });

  test("station 2 — admin login: AdminShell, ADMIN badge, 7 nav items, overview tiles", async () => {
    test.setTimeout(90_000);
    await login(adminContext, ADMIN_EMAIL);

    await adminPage.goto("/admin");
    await expect(adminPage).toHaveURL(/\/admin(?:$|[?#])/);
    await expect(adminPage.getByTestId("admin-badge")).toBeVisible();
    for (const label of [
      "Overview",
      "Users",
      "Applications",
      "Content",
      "Flags",
      "Chain actions",
      "Audit",
    ]) {
      await expect(adminPage.getByRole("link", { name: label, exact: true }).first()).toBeVisible();
    }
    await expect(adminPage.getByRole("link", { name: /Back to dashboard/i })).toBeVisible();
    await expect(adminPage.getByTestId("overview-users")).toBeVisible();
    await expect(adminPage.getByTestId("overview-applications")).toBeVisible();
    await expect(adminPage.getByTestId("overview-content")).toBeVisible();
    await expect(adminPage.getByTestId("overview-flags")).toBeVisible();
  });

  test("station 3 — suspend kills the live session; audit shows user.suspend", async () => {
    test.setTimeout(90_000);
    // Search → detail.
    await adminPage.goto("/admin/users");
    await adminPage.locator("#users-search").fill(CITIZEN_EMAIL);
    await adminPage.getByRole("button", { name: "Search", exact: true }).click();
    // `exact: true` — under parallel `pnpm e2e`, referrals.spec's concurrent
    // user `referrals-citizen-e2e@…` is a SUPERSTRING of this email, so the
    // substring search returns both; the exact locator targets ONLY this user
    // (a non-exact name matches both link texts → strict-mode violation).
    await adminPage.getByRole("link", { name: CITIZEN_EMAIL, exact: true }).click();
    await expect(adminPage).toHaveURL(new RegExp(`/admin/users/${citizenId}`));

    // Suspend (modal confirm) → suspended tag.
    await adminPage.getByRole("button", { name: "Suspend", exact: true }).click();
    await adminPage.getByRole("button", { name: "Confirm suspension" }).click();
    await expect(adminPage.getByTestId("suspended-tag")).toBeVisible();

    // The citizen's LIVE session is dead over the wire (A1 choke point):
    // the cookie-carrying API read is 401 and the next navigation lands on /auth.
    const dead = await citizenContext.request.get("/api/applications");
    expect(dead.status()).toBe(401);
    await citizenPage.goto("/dashboard");
    await expect(citizenPage).toHaveURL(/\/auth(?:$|[/?#])/);
    // A fresh login is refused too — same generic 401, no suspension oracle.
    const relogin = await citizenContext.request.post("/api/auth/login", {
      data: { email: CITIZEN_EMAIL, passphrase: PASS },
      headers: { origin: BASE },
    });
    expect(relogin.status()).toBe(401);

    // The audit viewer shows the user.suspend row.
    await adminPage.goto("/admin/audit");
    await adminPage.locator("#audit-filter-action").fill("user.suspend");
    await adminPage.getByRole("button", { name: "Apply filters" }).click();
    await expect(adminPage.getByTestId("audit-row").first()).toContainText("user.suspend");
  });

  test("station 4 — content edit (embassy hours) lands + audit afterJson carries it; restore", async () => {
    test.setTimeout(90_000);
    await adminPage.goto("/admin/content");
    await adminPage.getByRole("button", { name: "EMBASSIES" }).click();

    // Edit LIS → marker hours → Save.
    const lisRow = adminPage.locator("tr", { hasText: "LIS" }).first();
    await lisRow.getByRole("button", { name: "Edit", exact: true }).click();
    await adminPage.locator("#content-field-hours").fill(HOURS_MARKER);
    await adminPage.getByRole("button", { name: "Save", exact: true }).click();
    await expect(adminPage.locator("tr", { hasText: "LIS" }).first()).toContainText(HOURS_MARKER);

    // The audit row's afterJson contains the marker.
    await adminPage.goto("/admin/audit");
    await adminPage.locator("#audit-filter-action").fill("content.embassy.update");
    await adminPage.getByRole("button", { name: "Apply filters" }).click();
    const row = adminPage.getByTestId("audit-row").first();
    await expect(row).toContainText("content.embassy.update");
    await row.getByRole("button").first().click(); // expand
    await expect(adminPage.getByTestId("audit-after")).toContainText(HOURS_MARKER);

    // Restore the original hours (hygiene — other specs stub /api/embassies,
    // so this is belt-and-braces, not the determinism guarantee).
    await adminPage.goto("/admin/content");
    await adminPage.getByRole("button", { name: "EMBASSIES" }).click();
    await adminPage
      .locator("tr", { hasText: "LIS" })
      .first()
      .getByRole("button", { name: "Edit", exact: true })
      .click();
    await adminPage.locator("#content-field-hours").fill(originalHours);
    await adminPage.getByRole("button", { name: "Save", exact: true }).click();
    await expect(adminPage.locator("tr", { hasText: "LIS" }).first()).toContainText(originalHours);
  });

  test("station 5 — flag flip: population world map off → disabled note; back on; delete row", async () => {
    test.setTimeout(120_000);
    // Declared default (no row): the flag reads ON.
    await adminPage.goto("/admin/flags");
    const flagRow = adminPage.getByTestId("flag-row-population_world_map");
    await expect(flagRow).toContainText("ON");

    // OFF: the upsert creates the row disabled.
    await adminPage.getByRole("button", { name: "Turn off population_world_map" }).click();
    await expect(flagRow).toContainText("OFF");

    // The consumer follows LIVE (stubbed census reads; /api/flags NOT stubbed —
    // deterministic because the route serves Cache-Control: no-store).
    await stubPopulationReads(adminPage);
    await adminPage.goto("/dashboard/population");
    await expect(adminPage.getByTestId("world-map-disabled")).toBeVisible();
    await expect(adminPage.getByTestId("world-map")).toHaveCount(0);

    // Back ON → the map returns.
    await adminPage.goto("/admin/flags");
    await adminPage.getByRole("button", { name: "Turn on population_world_map" }).click();
    await expect(flagRow).toContainText("ON");
    await adminPage.goto("/dashboard/population");
    await expect(adminPage.getByTestId("world-map")).toBeVisible();
    await unstubReads(adminPage);

    // Delete the row — restores the missing-row declared default (TRUE);
    // dashboard-screens is independently protected by its C3 stub.
    await adminPage.goto("/admin/flags");
    await adminPage.getByRole("button", { name: "Delete population_world_map" }).click();
    await expect(flagRow).toContainText("default");
    await expect(flagRow).toContainText("ON");
  });

  test("station 6 — chain actions: stubbed composer prepares byte-exact calldata; live env graceful", async () => {
    test.setTimeout(120_000);
    // Deterministic REGISTERED-chain stubs (lowercase addresses — see header).
    await adminPage.route("**/api/admin/chain/params", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(PARAMS_FIXTURE),
      }),
    );
    await adminPage.route("**/api/admin/chain/roles", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ROLES_FIXTURE),
      }),
    );

    await adminPage.goto("/admin/chain");
    await expect(adminPage.getByTestId("params-token")).toBeVisible();
    await expect(adminPage.getByTestId("params-governance")).toContainText("2000");
    await expect(adminPage.getByTestId("role-topology")).toContainText("REWARDS_ADMIN_ROLE");

    // Compose the default grant_role (contract token, DEFAULT_ADMIN_ROLE).
    await adminPage.locator("#composer-action").selectOption("grant_role");
    await adminPage.locator("#composer-account").fill(GRANT_ACCOUNT);
    await adminPage.getByRole("button", { name: "Prepare", exact: true }).click();

    const card = adminPage.getByTestId("prepared-action-card");
    await expect(card).toBeVisible();
    await expect(card.getByTestId("never-signs-label")).toContainText(/THIS PANEL NEVER SIGNS/);
    await expect(card.getByTestId("required-role")).toBeVisible();
    await expect(card.getByTestId("prepared-tx")).toContainText(/grantRole/);

    // The Safe Tx Builder JSON download resolves and parses with matching data.
    const [download] = await Promise.all([
      adminPage.waitForEvent("download"),
      card.getByRole("button", { name: "Download Safe Tx Builder JSON" }).click(),
    ]);
    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const safeJson = JSON.parse(readFileSync(filePath as string, "utf8")) as {
      version: string;
      chainId: string;
      transactions: { to: string; value: string; data: string }[];
    };
    expect(safeJson.version).toBe("1.0");
    expect(safeJson.chainId).toBe("31337");
    expect(safeJson.transactions).toHaveLength(1);
    expect(safeJson.transactions[0].to).toBe(ADDRS.token);
    expect(safeJson.transactions[0].value).toBe("0");
    expect(safeJson.transactions[0].data).toBe(EXPECTED_GRANT_DATA);

    // Stubs REMOVED → the LIVE default env (84532, unregistered) renders the
    // one graceful honesty card (calldata VALIDITY itself is D1's anvil proof).
    await adminPage.unroute("**/api/admin/chain/params");
    await adminPage.unroute("**/api/admin/chain/roles");
    await adminPage.goto("/admin/chain");
    await expect(adminPage.getByTestId("chain-unavailable")).toContainText(
      /No admin contracts are registered on this chain/,
    );
  });

  test("station 7 — axe: zero critical/serious on /admin, /admin/users, /admin/chain", async () => {
    test.setTimeout(120_000);
    for (const route of ["/admin", "/admin/users", "/admin/chain"]) {
      await adminPage.goto(route);
      await adminPage.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page: adminPage }).analyze();
      await expectNoCriticalOrSerious(route, results);
    }
  });

  test("station 8 — Wave-10 A4: approve-mint override prepares the witness-free adminMint card", async () => {
    test.setTimeout(120_000);
    // The witness-free override's PRIMARY case: an application row whose
    // applicantAddress snapshot is NULL (the applicant never ran the witness
    // flow) — the mint gate must come from the LIVE resolveApplicantAddress,
    // never the stored column.
    const app = await db.citizenshipApplication.create({
      data: {
        userId: citizenId,
        status: "OATH_ACCEPTED",
        name: "E2E Ordinary User",
        domicileCity: "Lisbon",
        hostCountry: "Portugal",
        motto: "code is law",
      },
    });

    // No verified wallet yet → the pillar is DISABLED with the honest reason
    // (route would 400 too — the UI gate mirrors the server's own resolution).
    await adminPage.goto(`/admin/applications/${app.id}`);
    await expect(adminPage.getByTestId("approve-mint-disabled")).toContainText(
      /no verified wallet/,
    );

    // Verify a wallet (direct prisma; checksummed anvil #4 — never a real key).
    // applicantAddress stays NULL in the DB: the destination below proves the
    // LIVE resolution, not a stale snapshot.
    await db.linkedWallet.create({
      data: { userId: citizenId, address: MINT_TO, chain: "EVM", verifiedAt: new Date() },
    });

    // Deterministic REGISTERED-chain stubs (station-6 params + a passport
    // PASSPORT_ADMIN_ROLE topology) so the prepared card can render holders.
    await adminPage.route("**/api/admin/chain/params", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(PARAMS_FIXTURE),
      }),
    );
    await adminPage.route("**/api/admin/chain/roles", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...ROLES_FIXTURE,
          contracts: [
            ...ROLES_FIXTURE.contracts,
            {
              contract: "passport",
              address: ADDRS.passport,
              roles: [
                {
                  role: "PASSPORT_ADMIN_ROLE",
                  roleId: `0x${"33".repeat(32)}`,
                  holders: [ANVIL_ADMIN],
                },
              ],
            },
          ],
        }),
      }),
    );

    await adminPage.goto(`/admin/applications/${app.id}`);
    await expect(adminPage.getByTestId("resolved-mint-to")).toHaveText(MINT_TO);

    // Approve → the server records OFF-CHAIN intent + returns the resolved
    // params; the client feeds them into the PURE encoder → the prepared card.
    await adminPage.getByRole("button", { name: "Approve & prepare admin mint" }).click();
    const card = adminPage.getByTestId("prepared-action-card");
    await expect(card).toBeVisible();
    await expect(card.getByTestId("never-signs-label")).toContainText(/THIS PANEL NEVER SIGNS/);
    await expect(card.getByTestId("required-role")).toContainText(/PASSPORT_ADMIN_ROLE/);
    await expect(card.getByTestId("prepared-tx")).toContainText(/adminMint/);
    await expect(card.getByTestId("prepared-tx")).toContainText(MINT_TO);

    // Over-the-wire mutation proof: off-chain intent + audit row written; NO
    // chain-cache column touched (chain-truth honesty — constraint #3).
    const after = await db.citizenshipApplication.findUniqueOrThrow({ where: { id: app.id } });
    expect(after.adminApprovedAt).not.toBeNull();
    expect(after.adminApprovedBy).toBe(adminId);
    expect(after.status).toBe("OATH_ACCEPTED");
    expect(after.citizenTokenId).toBeNull();
    expect(after.sealTxHash).toBeNull();
    expect(after.sealedAt).toBeNull();
    expect(after.applicantAddress).toBeNull();
    const audit = await db.auditLog.findFirst({
      where: { action: "application.approve_mint", targetId: app.id },
    });
    expect(audit?.actorUserId).toBe(adminId);

    await adminPage.unroute("**/api/admin/chain/params");
    await adminPage.unroute("**/api/admin/chain/roles");
  });

  test("station 9 — Wave-10 C1: 390px no-overflow, tiles navigate as real links, axe at mobile", async () => {
    test.setTimeout(120_000);
    // A dedicated mobile-viewport page in the SAME admin context (shares the
    // session; zero extra logins). adminPage keeps its desktop viewport.
    const mobile = await adminContext.newPage();
    await mobile.setViewportSize({ width: 390, height: 844 });

    // No horizontal overflow: the page body never scrolls sideways at 390px
    // (the ≤760 shell collapse + overflowWrap on long mono values must hold).
    for (const route of ["/admin", "/admin/users", "/admin/applications"]) {
      await mobile.goto(route);
      await mobile.waitForLoadState("networkidle");
      const overflow = await mobile.evaluate(() => ({
        scrollWidth: document.scrollingElement!.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(
        overflow.scrollWidth,
        `${route} must not scroll horizontally at 390px (scrollWidth ${overflow.scrollWidth} vs innerWidth ${overflow.innerWidth})`,
      ).toBeLessThanOrEqual(overflow.innerWidth + 1);
    }

    // Tile navigation: each Overview stat tile is a REAL <a> (keyboard-
    // focusable) that lands on its section. Click-proof one, href-proof all.
    await mobile.goto("/admin");
    await expect(mobile.getByTestId("overview-users")).toHaveAttribute("href", "/admin/users");
    await expect(mobile.getByTestId("overview-applications")).toHaveAttribute(
      "href",
      "/admin/applications",
    );
    await expect(mobile.getByTestId("overview-content")).toHaveAttribute("href", "/admin/content");
    await expect(mobile.getByTestId("overview-flags")).toHaveAttribute("href", "/admin/flags");
    await mobile.getByTestId("overview-applications").click();
    await expect(mobile).toHaveURL(/\/admin\/applications(?:$|[?#])/);

    // axe at mobile width — the linked tiles must stay ZERO critical/serious.
    await mobile.goto("/admin");
    await mobile.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page: mobile }).analyze();
    await expectNoCriticalOrSerious("/admin @390x844", results);

    await mobile.close();
  });

  test("station 10 — Wave-10 C2: charts render accessible data tables at desktop AND mobile; axe stays clean", async () => {
    test.setTimeout(120_000);
    // Desktop: the "Republic at a glance" charts expose their visually-hidden
    // data-table alternative (sr-only → attached, deliberately NOT visible),
    // and the seeded census chart carries the SEEDED honesty label visibly.
    await adminPage.goto("/admin");
    await expect(adminPage.getByTestId("overview-glance")).toBeVisible();
    for (const id of ["apps-chart-table", "audit-chart-table", "census-chart-table"]) {
      await expect(adminPage.getByTestId(id)).toBeAttached();
    }
    await expect(adminPage.getByTestId("census-chart-title")).toContainText(/SEEDED/);
    await adminPage.waitForLoadState("networkidle");
    const desktop = await new AxeBuilder({ page: adminPage }).analyze();
    await expectNoCriticalOrSerious("/admin charts desktop", desktop);

    // Mobile: same alternatives, charts never widen the page, axe stays clean.
    const mobile = await adminContext.newPage();
    await mobile.setViewportSize({ width: 390, height: 844 });
    await mobile.goto("/admin");
    await expect(mobile.getByTestId("overview-glance")).toBeVisible();
    await expect(mobile.getByTestId("apps-chart-table")).toBeAttached();
    const overflow = await mobile.evaluate(() => ({
      scrollWidth: document.scrollingElement!.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(
      overflow.scrollWidth,
      `charts must not widen /admin at 390px (scrollWidth ${overflow.scrollWidth} vs innerWidth ${overflow.innerWidth})`,
    ).toBeLessThanOrEqual(overflow.innerWidth + 1);
    await mobile.waitForLoadState("networkidle");
    const mobileResults = await new AxeBuilder({ page: mobile }).analyze();
    await expectNoCriticalOrSerious("/admin charts @390x844", mobileResults);
    await mobile.close();
  });
});
