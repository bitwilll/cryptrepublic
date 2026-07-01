import { test, expect } from "@playwright/test";

test("home renders all sections with no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await expect(page).toHaveTitle(/CryptRepublic/);
  await expect(page.locator("section")).toHaveCount(8);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/NETWORK STATE/i);
  // count-up settles to the real citizen figure
  await expect(page.getByText("48 392").first()).toBeVisible({ timeout: 4000 });
  // passport book toggles open on click. force:true bypasses Playwright's
  // actionability/stability wait — the book is intentionally always animating
  // (float keyframes + a hover transform transition), so it is never "stable";
  // we only need the click handler to fire.
  const book = page.locator("#passportBook");
  await book.click({ force: true });
  await expect(book).toHaveClass(/open/);
  expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
});
