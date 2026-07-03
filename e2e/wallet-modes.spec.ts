import { test, expect, type BrowserContext, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";
import path from "node:path";

/**
 * WALLET MODES e2e (Wave 11 D2) — the over-the-wire proof of the mode
 * chooser, import validation, watch-only read-only screen, the air-gapped
 * send producing an unsigned QR, and the camera permission-denied → manual
 * paste fallback, with axe on the new views.
 *
 * REGISTER BUDGET (Global Constraint #8): THIS SPEC ADDS ZERO registrations —
 * the dashboard user is bootstrapped via DIRECT prisma (same dev.db the
 * webServer serves) and logs in via POST /api/auth/login (~1 login; limit
 * 20/15min per IP, shared with admin-panel.spec's ~2). The full-run ledger
 * stays at 9 registrations.
 *
 * All chain reads/broadcasts are stubbed via page.route (specs are
 * standalone — the stub catalog is COPIED from wallet-screen.spec, extended
 * with sendRawTransaction + a success receipt for the broadcast station).
 */

const BASE = "http://localhost:3000";
const EMAIL = "wallet-modes-e2e@cryptrepublic.local";
const PASS = randomBytes(24).toString("base64url");
const ARGON2_OPTIONS = { memoryCost: 65536, timeCost: 3, parallelism: 1, outputLen: 32 } as const;
const WATCHED = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // checksummed
const RECIPIENT = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const TX_HASH = `0x${"ab".repeat(32)}`;
const SIGNED_ENVELOPE = JSON.stringify({
  v: 1,
  t: "cr-eth-tx-signed",
  raw: `0x02${"cd".repeat(60)}`,
});

const db = new PrismaClient({
  datasources: { db: { url: "file:" + path.resolve(__dirname, "../prisma/dev.db") } },
});

function rpcResult(method: string): unknown {
  switch (method) {
    case "eth_chainId":
      return "0x14a34";
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
    case "eth_sendRawTransaction":
      return TX_HASH;
    case "eth_getTransactionReceipt":
      return {
        transactionHash: TX_HASH,
        transactionIndex: "0x0",
        blockHash: `0x${"11".repeat(32)}`,
        blockNumber: "0x1e8481",
        from: `0x${"00".repeat(20)}`,
        to: `0x${"00".repeat(20)}`,
        cumulativeGasUsed: "0x5208",
        gasUsed: "0x5208",
        contractAddress: null,
        logs: [],
        logsBloom: `0x${"00".repeat(256)}`,
        status: "0x1",
        effectiveGasPrice: "0x3b9aca00",
        type: "0x2",
      };
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
  await page.route("**/api/history/**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "1", result: [] }),
    });
  });
}

/** Axe helper — copied from e2e/a11y.spec.ts (standalone; same threshold). */
async function expectNoCriticalOrSerious(
  name: string,
  results: Awaited<ReturnType<AxeBuilder["analyze"]>>,
) {
  const blocking = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  expect(
    blocking.map((v) => ({ id: v.id, impact: v.impact, help: v.help })),
    `${name}: zero critical/serious axe violations required`,
  ).toEqual([]);
}

test.describe.serial("wallet modes (Wave 11 D2 — zero registrations)", () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    await db.user.deleteMany({ where: { email: EMAIL } });
    const passwordHash = await hash(PASS, ARGON2_OPTIONS);
    await db.user.create({ data: { email: EMAIL, passwordHash, name: "E2E Wallet Modes" } });

    ctx = await browser.newContext({ baseURL: BASE });
    // Camera permission-denied is the DEFAULT in this context — the scanner
    // fallback station relies on it; the camera itself is never exercised.
    await ctx.addInitScript(() => {
      Object.defineProperty(navigator, "mediaDevices", {
        value: {
          getUserMedia: () =>
            Promise.reject(Object.assign(new Error("denied"), { name: "NotAllowedError" })),
        },
        configurable: true,
      });
    });
    const res = await ctx.request.post("/api/auth/login", {
      data: { email: EMAIL, passphrase: PASS },
      headers: { origin: BASE },
    });
    expect(res.status(), "login bootstrap").toBe(200);
    page = await ctx.newPage();
    await stubReads(page);
  });

  test.afterAll(async () => {
    try {
      await db.user.deleteMany({ where: { email: EMAIL } });
    } finally {
      await db.$disconnect();
      await ctx?.close();
    }
  });

  test("station 1 — the mode chooser renders all three modes (+ axe)", async () => {
    test.setTimeout(90_000);
    await page.goto("/dashboard/wallet");
    for (const id of ["mode-embedded", "mode-hardware", "mode-watchonly"]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    const results = await new AxeBuilder({ page }).analyze();
    await expectNoCriticalOrSerious("/dashboard/wallet chooser", results);
  });

  test("station 2 — import form rejects a bad phrase inline (public /wallet, no login)", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const anon = await browser.newContext({ baseURL: BASE });
    const p = await anon.newPage();
    await p.goto("/wallet");
    await p.getByTestId("mode-embedded").click();
    await p.getByRole("button", { name: /Import an existing wallet instead/i }).click();
    await p.getByLabel(/recovery phrase/i).fill("definitely not a real bip39 phrase at all");
    await p.getByLabel(/vault passphrase/i).fill("a-long-enough-passphrase");
    await p.getByTestId("import-submit").click();
    // Next's route announcer is also role=alert — filter to the form error.
    await expect(
      p.getByRole("alert").filter({ hasText: /invalid recovery phrase/i }),
    ).toBeVisible();
    // No silent success: still on the import form, no unlocked state.
    await expect(p.getByTestId("import-submit")).toBeVisible();
    await anon.close();
  });

  test("station 3 — watch-only setup → read-only screen with the WATCH-ONLY badge (+ axe)", async () => {
    test.setTimeout(90_000);
    await page.goto("/dashboard/wallet");
    await page.getByTestId("mode-watchonly").click();
    await page.getByTestId("watch-address-input").fill(WATCHED);
    await page.getByTestId("watch-address-save").click();
    await expect(page.getByTestId("watchonly-screen")).toBeVisible();
    await expect(page.getByTestId("watchonly-badge")).toBeVisible();
    await expect(page.getByTestId("watch-address")).toHaveText(WATCHED);
    await expect(page.getByTestId("airgapped-send-open")).toBeEnabled();
    const results = await new AxeBuilder({ page }).analyze();
    await expectNoCriticalOrSerious("watch-only screen", results);
  });

  test("station 4 — air-gapped SEND produces an unsigned QR + summary", async () => {
    test.setTimeout(90_000);
    await page.getByTestId("airgapped-send-open").click();
    await expect(page.getByTestId("airgapped-compose")).toBeVisible();
    await page.getByTestId("ag-recipient").fill(RECIPIENT);
    await page.getByTestId("ag-amount").fill("1");
    await page.getByTestId("ag-build").click();
    await expect(page.getByTestId("ag-unsigned-qr")).toBeVisible();
    await expect(page.getByTestId("ag-unsigned-qr")).toHaveAttribute("src", /^data:image/);
    await expect(page.getByTestId("ag-summary-to")).toHaveText(RECIPIENT);
    const results = await new AxeBuilder({ page }).analyze();
    await expectNoCriticalOrSerious("air-gapped unsigned QR", results);
  });

  test("station 5 — camera permission-denied → paste fallback; pasted signed env broadcasts to a confirmed receipt", async () => {
    test.setTimeout(90_000);
    await page.getByTestId("ag-have-signed").click();
    // Camera path fails (context-level NotAllowedError) → fallback appears.
    await page.getByTestId("scan-start").click();
    // Filter past Next's empty route-announcer alert.
    await expect(page.getByRole("alert").filter({ hasText: /camera/i })).toBeVisible();
    await expect(page.getByTestId("qr-paste-input")).toBeVisible();
    // Paste the signed envelope → stubbed broadcast + success receipt → SENT.
    await page.getByTestId("qr-paste-input").fill(SIGNED_ENVELOPE);
    await page.getByTestId("qr-paste-submit").click();
    await expect(page.getByTestId("ag-sent")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("ag-sent-hash")).toHaveText(TX_HASH);
  });
});
