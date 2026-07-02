import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * Wallet & Chain SCREEN-STATE specs (Wave 6 Task 12) against the PRODUCTION build
 * with the real CSP. Covers the screen's rendered STATES, not on-chain execution
 * — the authoritative approve/stake/$CRYPT-send proof lives in the viem/Vitest
 * integration test `test/integration/wallet-e2e.test.ts` (`pnpm test:integration`),
 * exactly as mint.spec.ts defers the seal path to mint-e2e.
 *
 * The default (unset) env resolves to the Base Sepolia testnet profile (chainId
 * 84532), where the passport/staking/$CRYPT addresses are unregistered
 * placeholders — so this doubles as the graceful-degradation coverage (finding
 * #14): passport "unavailable", stake panel disabled, $CRYPT absent from the send
 * picker, with NO crashed/blank screen. Reads are stubbed via page.route so the
 * states render deterministically without a live chain.
 */

const PASS = "correct horse battery staple";
const VALID_TO = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

/** Canned JSON-RPC results — enough for readChainStats + previewEvmSend to render. */
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

/** Stub the app's read paths so screen states render without a live chain. */
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
}

async function register(page: Page) {
  const email = `wallet-e2e-${Date.now()}@example.org`;
  await page.goto("/auth");
  await page.getByRole("tab", { name: /REGISTER/i }).click();
  await page.getByLabel(/FULL OR CHOSEN NAME/i).fill("E2E Wallet");
  await page.getByLabel(/E-MAIL OF RECORD/i).fill(email);
  await page.getByLabel(/CHOOSE A PASSPHRASE/i).fill(PASS);
  await page.getByRole("button", { name: /MINT/i }).click();
  await expect(page).toHaveURL(/\/dashboard\/mint/);
}

/** Create the embedded vault at /wallet (persists in IndexedDB for this context). */
async function createVault(page: Page) {
  await page.goto("/wallet");
  // Wave 11 A2: a fresh context lands on the mode chooser — pick EMBEDDED.
  await page.getByTestId("mode-embedded").click();
  await page.getByLabel(/Choose a vault passphrase/i).fill(PASS);
  await page.getByRole("button", { name: /Create wallet/i }).click();
  await expect(page.getByTestId("mnemonic")).toBeVisible({ timeout: 25_000 });
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Continue/i }).click();
  await expect(page.getByTestId("addr-evm")).toBeVisible();
}

test("no vault → the wallet screen shows the create state", async ({ page }) => {
  await register(page);
  await page.goto("/dashboard/wallet");
  // Wave 11 A2: a fresh context lands on the mode chooser — pick EMBEDDED.
  await page.getByTestId("mode-embedded").click();
  await expect(page.getByRole("heading", { name: /No wallet yet/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Create wallet/i })).toHaveAttribute(
    "href",
    "/wallet",
  );
});

test("wallet screen renders honest states + graceful degradation (locked view)", async ({
  page,
}) => {
  await stubReads(page);
  await register(page);
  await createVault(page);

  // Fresh navigation → the in-memory seed is gone, so the screen is LOCKED (the
  // vault exists in IndexedDB). Reads are public and still run while locked.
  await page.goto("/dashboard/wallet");

  // Locked banner + an Unlock affordance.
  await expect(page.getByText(/Wallet is locked/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Unlock$/i })).toBeVisible();

  // Representative-price disclaimer renders near the total (findings #8/#15).
  await expect(page.getByTestId("representative-disclaimer")).toHaveText(/representative prices/i);
  // Empty portfolio → $0.00, never NaN.
  await expect(page.getByTestId("portfolio-total")).toHaveText("$0.00");

  // Honest chain stats — the REAL chain name, not the mockup's "CR-L2 / 7331".
  await expect(page.getByTestId("chainstat-chain")).toHaveText(/Base Sepolia/i);
  await expect(page.getByTestId("chainstat-chain")).not.toHaveText(/CR-L2|7331/);
  await expect(page.getByTestId("chainstat-representative-note")).toContainText(
    /not measurable|omitted/i,
  );

  // Graceful degradation on the unregistered testnet chain (finding #14).
  await expect(page.getByTestId("passport-unavailable")).toBeVisible();
  await expect(page.getByTestId("stake-unavailable")).toBeVisible();
  // STAKE action disabled when staking is unavailable.
  await expect(page.getByRole("button", { name: "STAKE", exact: true })).toBeDisabled();

  // Activity ledger empty state (stubbed no rows).
  await expect(page.getByTestId("activity-empty")).toBeVisible();

  // RECEIVE → checksummed address + QR, no send affordance.
  await page.getByRole("button", { name: "RECEIVE", exact: true }).click();
  await expect(page.getByTestId("receive-address")).toHaveText(/^0x[0-9a-fA-F]{40}$/);
  await expect(page.getByTestId("receive-qr")).toBeVisible();
  await page.getByRole("button", { name: /Close/i }).click();

  // SEND → the token picker has native but NOT $CRYPT (unregistered on 84532);
  // a valid form yields a human-readable confirm (not raw wei).
  await page.getByRole("button", { name: "SEND", exact: true }).click();
  const pickerText = (await page.getByTestId("token-picker").textContent()) ?? "";
  expect(pickerText).not.toMatch(/CRYPT/);
  await page.getByTestId("recipient-input").fill(VALID_TO);
  await page.getByTestId("amount-input").fill("1");
  await page.getByTestId("review-send").click();
  await expect(page.getByTestId("send-confirm")).toBeVisible();
  await expect(page.getByTestId("confirm-amount")).toHaveText(/^1 ETH$/);
  await expect(page.getByTestId("confirm-chain")).toHaveText(/Base Sepolia/i);
  // Human-readable — never the raw base-unit string.
  await expect(page.getByTestId("confirm-amount")).not.toContainText("1000000000000000000");
  await page.getByRole("button", { name: /^Back$/i }).click();
  await page.getByRole("button", { name: /^Cancel$/i }).click();

  // SWAP/BRIDGE → prominent TESTNET-MOCK banner, and NO execute/sign button.
  await page.getByRole("button", { name: "SWAP", exact: true }).click();
  await expect(page.getByTestId("testnet-mock-banner")).toContainText(/testnet mock/i);
  await expect(page.getByRole("button", { name: /execute|sign|swap now/i })).toHaveCount(0);
});
