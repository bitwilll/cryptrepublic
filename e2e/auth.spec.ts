import { test, expect } from "@playwright/test";

test("register → dashboard/mint → logout → login → dashboard", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.org`;
  const passphrase = "correct horse battery staple";

  await page.goto("/auth");
  await page.getByRole("tab", { name: /REGISTER/i }).click();
  await page.getByLabel(/FULL OR CHOSEN NAME/i).fill("E2E Citizen");
  await page.getByLabel(/E-MAIL OF RECORD/i).fill(email);
  await page.getByLabel(/CHOOSE A PASSPHRASE/i).fill(passphrase);
  await page.getByRole("button", { name: /MINT/i }).click();
  await expect(page).toHaveURL(/\/dashboard\/mint/);

  // logout via the API (button lands in a later wave); then confirm the guard.
  await page.request.post("/api/auth/logout", { headers: { origin: "http://localhost:3000" } });
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth/);

  // sign in again
  await page.getByLabel(/E-MAIL OF RECORD/i).fill(email);
  await page.getByLabel(/PASSPHRASE/i).fill(passphrase);
  await page.getByRole("button", { name: /AUTHENTICATE/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});
