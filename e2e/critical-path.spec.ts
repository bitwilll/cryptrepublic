import { test, expect, type BrowserContext, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * CRITICAL PATH (spec §8.1) — tagged `@critical`, run via `pnpm e2e:critical`.
 *
 * THE RELEASE GATE IS TWO COMMANDS, TOGETHER: `pnpm e2e:critical` (this browser
 * spec — the UI-side chain of the §8.1 critical path with deterministic stubbed
 * reads on the default testnet env) AND `pnpm test:integration` (the three anvil
 * suites where the REAL on-chain proofs live: passport seal/mint in
 * `test/integration/mint-e2e.test.ts`, funded send + staking in
 * `test/integration/wallet-e2e.test.ts`, governance castVote + dividend
 * claim/no-double-claim in `test/integration/governance-dividends-e2e.test.ts`).
 * This browser spec does NOT mint, send, vote, or claim on a real chain and
 * never claims to — a fresh default env has unregistered contracts, and
 * fabricating a full-on-chain browser pass would be dishonest. The two halves
 * together cover the spec-§8.1 chain — every §8.1 station, INCLUDING the "see
 * passport on Your Passport" view (station 7 in this spec; the count increment
 * is anvil-proven), appears in at least one gated half.
 *
 * The two halves cover the §8.1 steps on LOCAL/STUBBED environments only;
 * executing the chain on live Base Sepolia remains a USER step (deploy + fork
 * tests + burn-in per contracts/docs/DEPLOY_RUNBOOK.md / docs/MAINNET_HANDOFF.md).
 *
 * REGISTER BUDGET (Global Constraint #5): a full `pnpm e2e` run performs 9
 * registrations — 8 pre-existing (auth.spec 1 + mint.spec 2 + wallet-screen.spec
 * 2 + dashboard-screens.spec 3) + exactly ONE here (station 1). e2e/a11y.spec.ts
 * and e2e/mobile-smoke.spec.ts register nobody. The /api/auth/register limit is
 * 10/15min per IP; any future spec must update this ledger and stay UNDER 10.
 *
 * ONE browser context, ONE registration: stations run serially on a shared page
 * (test.describe.serial). Stubs copy the wallet-screen.spec.ts /
 * dashboard-screens.spec.ts patterns — Playwright specs are standalone, no
 * cross-spec imports.
 *
 * A11Y THRESHOLD (same as e2e/a11y.spec.ts): ZERO critical + ZERO serious axe
 * violations at the mint / wallet / governance / holdings stops; moderate/minor
 * logged, not failed. No `.exclude()` — any future exclusion needs an in-file
 * justification.
 *
 * MOBILE (390×844) stations assert DOCUMENT-level no-horizontal-overflow only:
 * the wallet token table scrolls horizontally INSIDE its card by design (the
 * Wave 8 A1 wide-row decision — overflow-x wrapper + row minWidth), so the
 * document itself must not scroll sideways.
 */

const PASS = "correct horse battery staple";
const VALID_TO = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

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
 * Deterministic fixtures for the /api/* dashboard reads (subset of the
 * dashboard-screens.spec.ts catalog). The governance fixture carries ONE active
 * proposal so the cast-vote panel renders its non-citizen gating (station 6).
 */
const API_FIXTURES: Record<string, unknown> = {
  "/api/citizen/obligations": { obligations: [] },
  "/api/stats/activity": { activity: [] },
  "/api/stats/summary": { totalCitizens: "3" },
  "/api/stats/census": { delta24h: 0 },
  "/api/stats/inductions": { inductions: [] },
  "/api/governance/proposals": {
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
  },
  "/api/treasury/summary": { available: false, cryptWei: null, ethWei: null },
  "/api/treasury/flows": { flows: [] },
  "/api/holdings/dividends": { claims: [] },
};

/** Stub the app's read paths so screen states render without a live chain / DB. */
async function stubReads(page: Page) {
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
  // Etherscan-style history proxy → no rows (empty activity ledger).
  await page.route("**/api/history/**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "1", result: [] }),
    });
  });
  // Dashboard GET reads → deterministic fixtures; unknown APIs (auth,
  // applications attest/oath, …) fall through to the REAL handlers.
  await page.route("**/api/**", async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/rpc/") || path.startsWith("/api/history/")) return route.fallback();
    if (/^\/api\/governance\/proposals\/[^/]+\/comments$/.test(path)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ comments: [] }),
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
    await route.fallback();
  });
}

/** Spec-§8.1 mobile slice: the DOCUMENT must not scroll horizontally. */
async function expectNoHorizontalOverflow(page: Page) {
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
  expect(fits, "document must not overflow horizontally at this viewport").toBe(true);
}

/** Axe threshold shared with e2e/a11y.spec.ts: 0 critical/serious; rest logged. */
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

async function axeStation(page: Page, name: string) {
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).analyze();
  await expectNoCriticalOrSerious(name, results);
}

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

test.describe.serial("@critical path — register → vault → mint UI → send-confirm → gates", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      baseURL: "http://localhost:3000",
      viewport: DESKTOP,
    });
    page = await context.newPage();
    await stubReads(page);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("station 1 — register (the ONE registration) lands on /dashboard/mint", async () => {
    const email = `critical-e2e-${Date.now()}@example.org`;
    await page.goto("/auth");
    await page.getByRole("tab", { name: /REGISTER/i }).click();
    await page.getByLabel(/FULL OR CHOSEN NAME/i).fill("E2E Critical");
    await page.getByLabel(/E-MAIL OF RECORD/i).fill(email);
    await page.getByLabel(/CHOOSE A PASSPHRASE/i).fill(PASS);
    await page.getByRole("button", { name: /MINT/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/mint/);
  });

  test("station 2 — Your Passport provisional (pending) view + passport mobile", async () => {
    // The §8.1 "see passport on Your Passport" station: without it the release
    // gate would pass with the passport screen deleted. ORDER NOTE: this runs
    // BEFORE vault creation — once an embedded vault is cached, the passport
    // screen on the unregistered default testnet chain renders its honest
    // read-error state ("Could not read the passport contract…"). Pre-vault
    // (no wallet), the registered user's DRAFT application surfaces the
    // clearly-labeled PROVISIONAL "pending · to be verified · NOT YET ON CHAIN"
    // card with a CTA into the mint flow. Chain-truth is intact: the sealed/
    // citizen view + count increment are anvil-proven in
    // test/integration/mint-e2e.test.ts.
    await page.goto("/dashboard/passport");
    await expect(page.getByTestId("passport-provisional")).toBeVisible();
    await expect(page.getByTestId("passport-provisional-status")).toContainText(
      /not yet on chain/i,
    );
    await expect(page.getByRole("link", { name: /continue your application/i })).toHaveAttribute(
      "href",
      "/dashboard/mint",
    );

    // Passport's slice of the §8.1 mobile smoke.
    await page.setViewportSize(MOBILE);
    await expectNoHorizontalOverflow(page);
    await page.setViewportSize(DESKTOP);
  });

  test("station 3 — create + unlock the embedded vault", async () => {
    await page.goto("/wallet");
    // Wave 11 A2: a fresh context lands on the mode chooser — pick EMBEDDED.
    await page.getByTestId("mode-embedded").click();
    await page.getByLabel(/Choose a vault passphrase/i).fill(PASS);
    await page.getByRole("button", { name: /Create wallet/i }).click();
    await expect(page.getByTestId("mnemonic")).toBeVisible({ timeout: 25_000 });
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /Continue/i }).click();
    await expect(page.getByTestId("addr-evm")).toBeVisible();
  });

  test("station 4 — attest → oath → witness gate UI (+ mint mobile + axe)", async () => {
    await page.goto("/dashboard/mint");

    // Attest (step 1): the name is PREFILLED from registration (resume), so
    // CONTINUE starts enabled; clearing the name re-gates it (proves the gate).
    await expect(page.getByRole("heading", { name: /Attest who you are/i })).toBeVisible();
    const continueBtn = page.getByRole("button", { name: /CONTINUE/i });
    await expect(continueBtn).toBeEnabled();
    await page.getByLabel(/Legal or chosen name/i).fill("");
    await expect(continueBtn).toBeDisabled();
    await page.getByLabel(/Legal or chosen name/i).fill("A. Nakadai");
    await expect(continueBtn).toBeEnabled();

    // Mobile check (C2's registered half, station 9): stepper + form usable at 390×844.
    await page.setViewportSize(MOBILE);
    await expectNoHorizontalOverflow(page);
    await expect(page.getByText("ATTEST", { exact: true })).toBeVisible();
    await expect(page.getByLabel(/Legal or chosen name/i)).toBeVisible();
    await page.setViewportSize(DESKTOP);

    // Advance to Oath (step 2) — persists via /api/applications/attest (real handler).
    await continueBtn.click();
    await expect(page.getByRole("heading", { name: /The oath of entry/i })).toBeVisible();
    const continueBtn2 = page.getByRole("button", { name: /CONTINUE/i });
    await expect(continueBtn2).toBeDisabled();
    await page.getByLabel(/Personal motto/i).fill("Recognized in time.");
    await page.getByLabel(/Accept the constitution/i).check();
    await expect(continueBtn2).toBeEnabled();

    // Witness gate UI (step 3): tiles render; SEAL stays disabled below quorum.
    // The REAL seal (7 EIP-712 sigs → mintWithWitnesses) is anvil-proven in
    // test/integration/mint-e2e.test.ts.
    await continueBtn2.click();
    await expect(page.getByRole("heading", { name: /witnesses, signing/i })).toBeVisible();
    await expect(page.getByTestId("witness-tile-0")).toBeVisible();
    await expect(page.getByRole("button", { name: /SEAL MY PASSPORT/i })).toBeDisabled();

    await axeStation(page, "/dashboard/mint (witness step)");
  });

  test("station 5 — wallet send-confirm (no broadcast) + wallet mobile + axe", async () => {
    await page.goto("/dashboard/wallet");
    await expect(page.getByText(/Wallet is locked/i)).toBeVisible();

    // Mobile check: DOCUMENT-level no-overflow ONLY (the token table scrolls
    // inside its card by design) + the SEND affordance visible.
    await page.setViewportSize(MOBILE);
    await expectNoHorizontalOverflow(page);
    await expect(page.getByRole("button", { name: "SEND", exact: true })).toBeVisible();
    await page.setViewportSize(DESKTOP);

    // Send-confirm: review renders human-readable amount + chain; NO broadcast —
    // the funded send is anvil-proven in test/integration/wallet-e2e.test.ts.
    await page.getByRole("button", { name: "SEND", exact: true }).click();
    await page.getByTestId("recipient-input").fill(VALID_TO);
    await page.getByTestId("amount-input").fill("1");
    await page.getByTestId("review-send").click();
    await expect(page.getByTestId("send-confirm")).toBeVisible();
    await expect(page.getByTestId("confirm-amount")).toHaveText(/^1 ETH$/);
    await expect(page.getByTestId("confirm-chain")).toHaveText(/Base Sepolia/i);
    await page.getByRole("button", { name: /^Back$/i }).click();
    await page.getByRole("button", { name: /^Cancel$/i }).click();

    await axeStation(page, "/dashboard/wallet");
  });

  test("station 6 — governance vote gating (non-citizen) + axe", async () => {
    // On-chain castVote is anvil-proven in
    // test/integration/governance-dividends-e2e.test.ts; here the UI gate holds.
    await page.goto("/dashboard/governance");
    await expect(page.getByTestId("cast-vote-panel")).toBeVisible();
    await expect(page.getByTestId("cast-vote-panel")).toContainText(
      /Mint your passport to participate/i,
    );
    await expect(page.getByRole("button", { name: /Vote YEA/i })).toBeDisabled();
    await expect(page.getByRole("button", { name: /Vote NAY/i })).toBeDisabled();

    await axeStation(page, "/dashboard/governance");
  });

  test("station 7 — holdings claim gating + LEGAL note + axe", async () => {
    // On-chain claim/no-double-claim is anvil-proven in
    // test/integration/governance-dividends-e2e.test.ts; here the UI gate holds.
    await page.goto("/dashboard/holdings");
    await expect(page.getByTestId("no-epoch")).toBeVisible();
    await expect(page.getByRole("button", { name: /CLAIM DIVIDEND/i })).toBeDisabled();
    await expect(page.getByTestId("legal-note")).toContainText(/regulated security/i);

    await axeStation(page, "/dashboard/holdings");
  });
});
