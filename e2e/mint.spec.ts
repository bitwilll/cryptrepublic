import { test, expect } from "@playwright/test";

/**
 * Mint flow UI walk-through (Wave 5).
 *
 * DOCUMENTED SPLIT: driving the FULL seal path in a browser — a transient
 * embedded signer signing `mintWithWitnesses` + 7 real external witness EIP-712
 * sigs against a live anvil — is impractical to orchestrate from pure Playwright.
 * The authoritative on-chain proof (real 7 sigs → mintWithWitnesses → passport
 * shown; 6 sigs revert; self-attest reverts; stale-nonce fails fast) lives in the
 * viem/Vitest integration test `test/integration/mint-e2e.test.ts`
 * (`pnpm test:integration`). This spec validates the UI state machine + gating +
 * the not-yet-citizen "Your Passport" state.
 */

const APP = "http://localhost:3000";

async function register(page: import("@playwright/test").Page) {
  const email = `mint-e2e-${Date.now()}@example.org`;
  const passphrase = "correct horse battery staple";
  await page.goto("/auth");
  await page.getByRole("tab", { name: /REGISTER/i }).click();
  await page.getByLabel(/FULL OR CHOSEN NAME/i).fill("E2E Applicant");
  await page.getByLabel(/E-MAIL OF RECORD/i).fill(email);
  await page.getByLabel(/CHOOSE A PASSPHRASE/i).fill(passphrase);
  await page.getByRole("button", { name: /MINT/i }).click();
  await expect(page).toHaveURL(/\/dashboard\/mint/);
}

test("mint UI: 4-step flow gating (Attest → Oath → Witness)", async ({ page }) => {
  await register(page);

  // Step 01 — Attest. The stepper shows all four steps.
  await expect(page.getByText("ATTEST", { exact: true })).toBeVisible();
  await expect(page.getByText("OATH", { exact: true })).toBeVisible();
  await expect(page.getByText("WITNESS", { exact: true })).toBeVisible();
  await expect(page.getByText("SEAL", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Attest who you are/i })).toBeVisible();

  // The name is PREFILLED from registration (resume behavior), so CONTINUE
  // starts enabled; clearing the name re-gates it, proving the gate still works.
  const continueBtn = page.getByRole("button", { name: /CONTINUE/i });
  await expect(continueBtn).toBeEnabled();
  await page.getByLabel(/Legal or chosen name/i).fill("");
  await expect(continueBtn).toBeDisabled();
  await page.getByLabel(/Legal or chosen name/i).fill("A. Nakadai");
  // city is pre-filled ("Lisbon"); the button should now enable.
  await expect(continueBtn).toBeEnabled();

  // Advance to Oath (persists via /api/applications/attest).
  await continueBtn.click();
  await expect(page.getByRole("heading", { name: /The oath of entry/i })).toBeVisible();

  // Oath gating: needs motto (>4) + accepted checkbox.
  const continueBtn2 = page.getByRole("button", { name: /CONTINUE/i });
  await expect(continueBtn2).toBeDisabled();
  await page.getByLabel(/Personal motto/i).fill("Recognized in time.");
  await page.getByLabel(/Accept the constitution/i).check();
  await expect(continueBtn2).toBeEnabled();

  // Advance to Witness.
  await continueBtn2.click();
  await expect(page.getByRole("heading", { name: /witnesses, signing/i })).toBeVisible();
  // The witness grid renders tiles; the SEAL button is gated until enough sigs +
  // the "ready" checkbox (which itself is disabled until collected >= required).
  await expect(page.getByTestId("witness-tile-0")).toBeVisible();
  await expect(page.getByRole("button", { name: /SEAL MY PASSPORT/i })).toBeDisabled();

  // RESUME (live report): reloading must NOT restart at Attest — the saved
  // OATH_ACCEPTED application resumes at the witness step with the waiting note,
  // and BACK is locked (steps 0-1 are committed server-side; re-submitting attest
  // from there is exactly the 400 that surfaced as "Could not save your attestation").
  await page.reload();
  await expect(page.getByRole("heading", { name: /witnesses, signing/i })).toBeVisible();
  await expect(page.getByTestId("witness-waiting-note")).toBeVisible();
  await expect(page.getByRole("button", { name: /back/i })).toBeDisabled();

  // The dashboard shows the in-flight state — waiting at the witness stage with a
  // RESUME affordance, and NO "start a new mint" CTA.
  await page.goto("/dashboard");
  const pending = page.getByTestId("witness-pending");
  await expect(pending).toBeVisible();
  await expect(pending).toContainText(/witness/i);
  await expect(pending.getByRole("link", { name: /resume/i })).toHaveAttribute(
    "href",
    "/dashboard/mint",
  );
  await expect(page.getByRole("link", { name: /mint your passport/i })).toHaveCount(0);
});

test("Your Passport shows the not-yet-citizen state with a mint CTA", async ({ page }) => {
  await register(page);
  await page.goto("/dashboard/passport");
  // No wallet / not a citizen yet → CTA to mint.
  await expect(page.getByRole("heading", { name: /not yet a citizen/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Mint Your Passport/i })).toBeVisible();
});
