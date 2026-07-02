import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * Dashboard SCREEN-STATE specs (Wave 7 Task C2) against the PRODUCTION build with
 * the real CSP. Renders each of the 6 citizen dashboard screens UNDER THE REAL
 * SHELL (Sidebar + Topbar + MobileNavDrawer) and asserts the state matrix +
 * honesty constraints. On-chain EXECUTION (vote/claim) is proven separately in the
 * viem/Vitest integration test `test/integration/governance-dividends-e2e.test.ts`
 * (`pnpm test:integration`), exactly as wallet-screen.spec.ts defers writes to
 * wallet-e2e.
 *
 * The default (unset) env resolves to the Base Sepolia testnet profile (chainId
 * 84532), where governance/treasury/distributor addresses are unregistered
 * placeholders — so this doubles as the graceful-degradation coverage (constraint
 * #11): treasury "unavailable", dividend "no epoch", vote/propose disabled, with
 * NO crashed/blank screen. Reads (/api/rpc + the /api/* dashboard endpoints) are
 * stubbed via page.route so states render deterministically without a live chain
 * or seeded DB.
 */

const PASS = "correct horse battery staple";

/** Canned JSON-RPC results — enough for readChainStats + shell reads to render. */
function rpcResult(method: string): unknown {
  switch (method) {
    case "eth_chainId":
      return "0x14a34"; // 84532
    case "eth_blockNumber":
      return "0x1e8480"; // 2,000,000
    case "eth_gasPrice":
    case "eth_maxPriorityFeePerGas":
      return "0x3b9aca00"; // 1 gwei
    case "eth_getBalance":
    case "eth_getTransactionCount":
      return "0x0";
    case "eth_estimateGas":
      return "0x5208"; // 21000
    case "eth_call":
      return `0x${"0".repeat(64)}`;
    case "eth_getBlockByNumber":
    case "eth_getBlockByHash":
      return {
        number: "0x1e8480",
        hash: `0x${"11".repeat(32)}`,
        parentHash: `0x${"22".repeat(32)}`,
        nonce: "0x0000000000000000",
        sha3Uncles: `0x${"00".repeat(32)}`,
        logsBloom: `0x${"00".repeat(256)}`,
        transactionsRoot: `0x${"00".repeat(32)}`,
        stateRoot: `0x${"00".repeat(32)}`,
        receiptsRoot: `0x${"00".repeat(32)}`,
        miner: `0x${"00".repeat(20)}`,
        difficulty: "0x0",
        totalDifficulty: "0x0",
        extraData: "0x",
        size: "0x0",
        gasLimit: "0x1c9c380",
        gasUsed: "0x0",
        timestamp: "0x64000000",
        baseFeePerGas: "0x3b9aca00",
        transactions: [],
        uncles: [],
      };
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

/**
 * Deterministic fixtures for the /api/* dashboard reads. Honest empty/zero
 * on-chain-derived sets (fresh chain) + a seeded off-chain catalog/directory. The
 * holdings register sums to a large demonstrative total so the SEEDED tag next to
 * the AUM hero is the thing under test.
 */
const API_FIXTURES: Record<string, unknown> = {
  "/api/citizen/obligations": { obligations: [] },
  "/api/stats/activity": { activity: [] },
  "/api/stats/summary": { totalCitizens: "3" },
  "/api/stats/census": { delta24h: 0 },
  "/api/stats/inductions": { inductions: [] },
  "/api/governance/proposals": { proposals: [] },
  "/api/treasury/summary": { available: false, cryptWei: null, ethWei: null },
  "/api/treasury/allocations": {
    allocations: [
      {
        bucket: "embassy_ops",
        label: "Embassy operations",
        targetBps: 3800,
        color: "#c9a227",
        onchainBps: null,
      },
      {
        bucket: "reserve",
        label: "Sovereign reserve",
        targetBps: 2600,
        color: "#1957d3",
        onchainBps: null,
      },
    ],
  },
  "/api/treasury/flows": { flows: [] },
  "/api/holdings/assets": {
    assets: [
      {
        ref: "RE-001",
        kind: "re",
        name: "Alfama Quarter Block",
        location: "Lisbon, Portugal",
        valueUsd: "28400000",
        yieldBps: 480,
        annualYieldUsd: "1363200",
        status: "OWNED (demonstrative)",
        acquiredAt: "2024.11.04",
      },
      {
        ref: "IP-001",
        kind: "ip",
        name: "Sovereign Ledger Patent",
        location: "Registry (off-chain)",
        valueUsd: "12000000",
        yieldBps: 300,
        annualYieldUsd: "360000",
        status: "HELD (demonstrative)",
        acquiredAt: "2025.02.01",
      },
      {
        ref: "EQ-001",
        kind: "eq",
        name: "Validator Pool",
        location: "Off-chain descriptor",
        valueUsd: "9000000",
        yieldBps: 900,
        annualYieldUsd: "810000",
        status: "STAKED (demonstrative)",
        acquiredAt: "ongoing",
      },
    ],
    totalValueUsd: "49400000",
    totalAnnualYieldUsd: "2533200",
    composition: [
      { kind: "re", valueUsd: "28400000", shareBps: 5748 },
      { kind: "ip", valueUsd: "12000000", shareBps: 2429 },
      { kind: "eq", valueUsd: "9000000", shareBps: 1821 },
    ],
    seeded: true,
  },
  "/api/holdings/dividends": { claims: [] },
  "/api/constitution": {
    texts: [
      {
        key: "doctrine_art_iv",
        title: "Article IV — The Doctrine",
        body: "The estate of the Republic is held in common and governed in common.",
        citation: "CONSTITUTION ART. IV §1",
      },
    ],
  },
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
  "/api/embassies": {
    embassies: [
      {
        code: "LIS",
        name: "Lisbon Embassy",
        neighborhood: "Alfama",
        hours: "10:00–18:00",
        foundedAt: "2024",
        brandColor: "#c9a227",
        city: "Lisbon",
        country: "Portugal",
      },
      {
        code: "BER",
        name: "Berlin Embassy",
        neighborhood: "Kreuzberg",
        hours: "09:00–17:00",
        foundedAt: "2025",
        brandColor: "#1957d3",
        city: "Berlin",
        country: "Germany",
      },
    ],
  },
};

/** Stub the app's read paths so screen states render without a live chain / DB. */
async function stubReads(page: Page) {
  // JSON-RPC proxy → canned per-method results.
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

  // Dashboard GET reads → deterministic fixtures (longest-prefix match).
  await page.route("**/api/**", async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.startsWith("/api/rpc/")) return route.fallback();
    // Governance comments / embassy detail — honest empty / not-found handled below.
    if (/^\/api\/governance\/proposals\/[^/]+\/comments$/.test(path)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ comments: [] }),
      });
      return;
    }
    if (/^\/api\/embassies\/[^/]+$/.test(path) && path !== "/api/embassies/proposals") {
      const code = decodeURIComponent(path.split("/").pop() ?? "");
      const emb = (
        API_FIXTURES["/api/embassies"] as { embassies: { code: string }[] }
      ).embassies.find((e) => e.code === code);
      if (!emb) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ notfound: true }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ embassy: emb, liveCitizenCount: 0 }),
      });
      return;
    }
    const fixture = API_FIXTURES[path];
    if (fixture !== undefined) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fixture),
      });
      return;
    }
    // Unknown API read — fall through to the real handler.
    await route.fallback();
  });
}

/** Spec-§8.1 mobile-smoke slice: the document must not scroll horizontally. */
async function expectNoHorizontalOverflow(page: Page) {
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
  expect(fits, "document must not overflow horizontally at this viewport").toBe(true);
}

/** Brief 390×844 no-overflow check on the current screen, then restore desktop. */
async function checkMobileNoOverflow(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 1280, height: 800 });
}

async function register(page: Page) {
  const email = `dash-e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.org`;
  await page.goto("/auth");
  await page.getByRole("tab", { name: /REGISTER/i }).click();
  await page.getByLabel(/FULL OR CHOSEN NAME/i).fill("E2E Citizen");
  await page.getByLabel(/E-MAIL OF RECORD/i).fill(email);
  await page.getByLabel(/CHOOSE A PASSPHRASE/i).fill(PASS);
  await page.getByRole("button", { name: /MINT/i }).click();
  await expect(page).toHaveURL(/\/dashboard\/mint/);
}

/**
 * Tests are CONSOLIDATED so each registers ONCE (the auth register endpoint is
 * rate-limited to 10/15min per IP, and every e2e spec shares the local IP — one
 * register per test would trip the limiter across the full `pnpm e2e` run). Each
 * test still asserts a coherent slice of the state matrix, navigating between
 * screens within its own authenticated context.
 */

test("shell + home + governance + treasury render honestly under the real shell", async ({
  page,
}) => {
  await stubReads(page);
  await register(page);

  // ── Shell: 8 nav items with real App Router hrefs (scope to <nav> + exact labels
  //    so nothing collides with the "Mint your passport" CTA links). ──
  await page.goto("/dashboard");
  const nav = page.locator("nav").first();
  const expectedNav: Array<[string, string]> = [
    ["Citizen home", "/dashboard"],
    ["Constitution & votes", "/dashboard/governance"],
    ["Treasury", "/dashboard/treasury"],
    ["Population", "/dashboard/population"],
    ["Your passport", "/dashboard/passport"],
    ["Sovereign holdings", "/dashboard/holdings"],
    ["Embassies", "/dashboard/embassies"],
    ["Wallet & chain", "/dashboard/wallet"],
  ];
  for (const [name, href] of expectedNav) {
    await expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
  }

  // Topbar: REAL chain name (never the mockup's "CR-L2 / 7331") + a live block.
  const topbar = page.locator("header");
  await expect(topbar).toContainText(/Base Sepolia/i);
  await expect(topbar).not.toContainText(/CR-L2|7331/);
  await expect(page.getByTestId("topbar-block")).toContainText(/BLK \d+/);

  // ── Home: not-yet-citizen salutation + honest empty obligations. ──
  await expect(page.getByTestId("salutation")).toContainText(/Welcome, applicant/i);
  await expect(page.getByTestId("salutation")).not.toContainText(/21 408 932/);
  await expect(page.getByTestId("obligations")).toContainText(/Mint your passport/i);

  // ── Mobile: no horizontal overflow + the burger opens the slide-in drawer. ──
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: /Open navigation/i }).click();
  await expect(page.getByTestId("citizen-card")).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });

  // ── Governance: "no open amendments" empty state on a fresh chain. ──
  await page.goto("/dashboard/governance");
  await expect(page.getByTestId("amendments-empty")).toBeVisible();
  await expect(page.getByTestId("amendments-empty")).toContainText(/No open amendments/i);
  await checkMobileNoOverflow(page);

  // ── Treasury: honest unavailable reserves (never "$14.20M") + STAKE → wallet. ──
  await page.goto("/dashboard/treasury");
  await expect(page.getByTestId("treasury-unavailable")).toBeVisible();
  await expect(page.getByTestId("treasury-hero")).not.toContainText(/\$14\.20M|14\.20M/);
  await expect(page.getByRole("link", { name: /STAKE/i })).toHaveAttribute(
    "href",
    "/dashboard/wallet",
  );
  await expect(page.getByTestId("disbursements")).toContainText(/No disbursements yet/i);
  await checkMobileNoOverflow(page);
});

test("governance vote disabled (non-citizen) + holdings + population + embassies", async ({
  page,
}) => {
  await stubReads(page);
  // Override the proposals fixture with one active proposal so the cast panel renders.
  await page.route("**/api/governance/proposals**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        proposals: [
          {
            proposalId: "1",
            state: "Active",
            tally: { forVotes: "0", againstVotes: "0", abstainVotes: "0", snapshotCitizens: "3" },
            start: "0",
            end: "0",
            proposer: "0x0000000000000000000000000000000000000000",
            descriptionHash: `0x${"0".repeat(64)}`,
            title: "Ratify the founding charter",
            tag: "PROCEDURAL",
            body: "A signalling amendment.",
          },
        ],
      }),
    });
  });
  await register(page);

  // ── Governance: vote DISABLED with a mint nudge for a non-citizen. ──
  await page.goto("/dashboard/governance");
  await expect(page.getByTestId("cast-vote-panel")).toBeVisible();
  await expect(page.getByTestId("cast-vote-panel")).toContainText(
    /Mint your passport to participate/i,
  );
  await expect(page.getByRole("button", { name: /Vote YEA/i })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Vote NAY/i })).toBeDisabled();

  // ── Holdings: SEEDED-tagged AUM + scrubbed provenance + filters + LEGAL + TESTNET. ──
  await page.goto("/dashboard/holdings");
  await expect(page.getByTestId("seeded-tag")).toBeVisible();
  await expect(page.getByTestId("seeded-tag")).toContainText(/SEEDED|DEMONSTRATIVE/i);
  const registerText =
    (await page
      .getByText(/The asset register/i)
      .locator("..")
      .textContent()) ?? "";
  expect(registerText).not.toMatch(/CR-L2|TITLED ON CHAIN/i);
  await page.getByRole("button", { name: /^Real estate$/i }).click();
  await expect(page.getByText("RE-001")).toBeVisible();
  await expect(page.getByTestId("no-epoch")).toBeVisible();
  await expect(page.getByRole("button", { name: /CLAIM DIVIDEND/i })).toBeDisabled();
  await expect(page.getByTestId("legal-note")).toContainText(/regulated security/i);
  await expect(page.getByTestId("dividend-panel")).toContainText(/TESTNET/);
  await checkMobileNoOverflow(page);

  // ── Population: live census count (never 48 392) + SEEDED pins + empty inductions. ──
  await page.goto("/dashboard/population");
  await expect(page.getByTestId("census-hero")).toContainText("3");
  await expect(page.getByTestId("census-hero")).not.toContainText(/48 392/);
  await expect(page.getByTestId("world-map")).toBeVisible();
  await expect(page.getByTestId("map-pin").first()).toBeVisible();
  await expect(page.getByTestId("top-cities")).toContainText(/SEEDED SNAPSHOT/i);
  await expect(page.getByTestId("inductions-empty")).toBeVisible();

  // ── Mobile (390×844): the top-cities ROW grids keep their columns (the
  //    data-grid="row" exemption from the global ≤760 collapse) and the screen
  //    does not overflow. Vacuity guard FIRST: the rows must actually exist. ──
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  const rows = page.locator('[data-grid="row"]');
  expect(await rows.count(), 'population must render [data-grid="row"] rows').toBeGreaterThan(0);
  for (const row of await rows.all()) {
    const cols = await row.evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
    );
    expect(cols, "row grids must keep >1 column at the mobile viewport").toBeGreaterThan(1);
  }
  await page.setViewportSize({ width: 1280, height: 800 });

  // ── Embassies: grid from the seeded directory + PROPOSE disabled for non-citizen. ──
  await page.goto("/dashboard/embassies");
  await expect(page.getByRole("heading", { name: /Lisbon Embassy/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Berlin Embassy/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /PROPOSE AN EMBASSY/i })).toBeDisabled();
  await expect(page.getByText(/Mint your passport to propose/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /VIEW EMBASSY/i }).first()).toHaveAttribute(
    "href",
    /\/dashboard\/embassies\/(LIS|BER)/,
  );
  await checkMobileNoOverflow(page);

  // ── Embassy detail: a known code renders; an unknown code → not-found. ──
  await page.goto("/dashboard/embassies/LIS");
  await expect(page.getByRole("heading", { name: /Lisbon Embassy/i })).toBeVisible();
  await expect(page.getByTestId("live-citizen-count")).toBeVisible();
  await page.goto("/dashboard/embassies/ZZZ");
  await expect(page.getByTestId("embassy-not-found")).toBeVisible();
});

test("graceful degradation: no crash on the unregistered default chain", async ({ page }) => {
  // NO /api/* fixtures for the contract-backed reads on this run — only /api/rpc is
  // stubbed. The screens must still render (empty/unavailable), never crash/blank.
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
  await register(page);

  // Treasury: unavailable card, shell intact.
  await page.goto("/dashboard/treasury");
  await expect(page.getByTestId("treasury-hero")).toBeVisible();
  await expect(page.getByTestId("citizen-card")).toBeVisible();

  // Holdings: dividend panel resolves to no-epoch, no crash.
  await page.goto("/dashboard/holdings");
  await expect(page.getByTestId("dividend-panel")).toBeVisible();
  await expect(page.getByTestId("no-epoch")).toBeVisible();

  // Governance: renders under the shell, no crash.
  await page.goto("/dashboard/governance");
  await expect(page.getByRole("heading", { name: /Amendments in session/i })).toBeVisible();
});
