import { test, expect, type Page } from "@playwright/test";

/**
 * Wallet e2e against the PRODUCTION build with the real CSP active. Covers:
 *  - create -> mnemonic shown once (Argon2id vault-encrypt under prod CSP)
 *  - lock -> unlock (right passphrase works, wrong fails with no oracle)
 *  - reveal seed
 *  - ZERO CSP violations on /wallet (WalletConnect/RPC + Argon2id WASM path)
 *
 * The mnemonic is random per run, so we capture it and assert reveal MATCHES it
 * (never a hardcoded phrase).
 */

const PASS = "correct horse battery staple";
const WRONG = "totally wrong passphrase";

/** Attach a CSP-violation + console-error collector to the page. */
function collect(page: Page) {
  const cspViolations: string[] = [];
  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      const w = window as unknown as { __csp?: string[] };
      (w.__csp ??= []).push(`${e.violatedDirective} :: ${e.blockedURI || "inline"}`);
    });
  });
  return {
    async csp() {
      return page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
    },
    consoleErrors,
  };
}

test("create → lock → unlock (wrong fails, right works) → reveal, with zero CSP violations", async ({
  page,
}) => {
  const c = collect(page);

  await page.goto("/wallet");

  // Wave 11 A2: a fresh context lands on the mode chooser — pick EMBEDDED.
  await page.getByTestId("mode-embedded").click();

  // CREATE — Argon2id vault-encrypt must succeed under the prod CSP.
  await page.getByLabel(/Choose a vault passphrase/i).fill(PASS);
  await page.getByRole("button", { name: /Create wallet/i }).click();

  const mnemonicEl = page.getByTestId("mnemonic");
  await expect(mnemonicEl).toBeVisible({ timeout: 20000 });
  const mnemonic = (await mnemonicEl.textContent())?.trim() ?? "";
  expect(mnemonic.split(/\s+/)).toHaveLength(24);

  // Addresses + receive QR render.
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Continue/i }).click();
  await expect(page.getByTestId("addr-evm")).toHaveText(/^0x[0-9a-fA-F]{40}$/);
  await expect(page.getByTestId("addr-bitcoin")).toHaveText(/^tb1/);
  await expect(page.getByTestId("receive-qr")).toBeVisible();
  await expect(page.getByTestId("wallet-state")).toHaveText(/unlocked/i);

  // LOCK.
  await page.getByRole("button", { name: /^Lock$/i }).click();
  await expect(page.getByTestId("wallet-state")).toHaveText(/locked/i);

  // UNLOCK with the WRONG passphrase → inline error, still locked (no oracle).
  await page.getByRole("button", { name: /^Unlock$/i }).click();
  await page.getByLabel(/Vault passphrase/i).fill(WRONG);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Unlock$/i })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText(/incorrect passphrase/i);
  // Still locked: the unlock dialog remains open (no oracle beyond pass/fail).
  await expect(page.getByRole("dialog")).toBeVisible();

  // UNLOCK with the RIGHT passphrase → unlocked.
  await page.getByLabel(/Vault passphrase/i).fill(PASS);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Unlock$/i })
    .click();
  await expect(page.getByTestId("wallet-state")).toHaveText(/unlocked/i);

  // REVEAL with the right passphrase → the SAME mnemonic.
  await page.getByLabel(/Reveal recovery phrase/i).fill(PASS);
  await page.getByRole("button", { name: /^Reveal$/i }).click();
  await expect(page.getByTestId("revealed-mnemonic")).toHaveText(mnemonic);

  // ZERO CSP violations across the whole flow; no WASM/CompileError.
  const csp = await c.csp();
  expect(csp, `CSP violations: ${csp.join("; ")}`).toHaveLength(0);
  const wasmErrors = c.consoleErrors.filter((e) => /WebAssembly|CompileError|wasm/i.test(e));
  expect(wasmErrors, `WASM errors: ${wasmErrors.join("; ")}`).toHaveLength(0);
});
