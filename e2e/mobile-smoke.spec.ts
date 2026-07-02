import { test, expect, type Page } from "@playwright/test";

/**
 * Mobile smoke for the two screens the §8.1 mobile matrix still missed
 * (Wave 8 C2): marketing home `/` and `/auth` at 390×844.
 *
 * REGISTER BUDGET (Global Constraint #5): total e2e registrations in one full
 * `pnpm e2e` run = 9 — 8 pre-existing (auth.spec 1 + mint.spec 2 +
 * wallet-screen.spec 2 + dashboard-screens.spec 3) + 1 in
 * critical-path.spec.ts. THIS SPEC ADDS 0 (nothing is submitted on /auth).
 * The /api/auth/register limit is 10/15min per IP; any future spec must update
 * this ledger and stay UNDER 10. The other mobile slices already ride
 * elsewhere: mint + wallet + passport inside critical-path.spec.ts (stations
 * 2/4/5), and every dashboard-screens screen carries its own 390×844
 * no-overflow check.
 *
 * Complements (never duplicates) the desktop assertions in home.spec.ts /
 * auth.spec.ts.
 */

test.use({ viewport: { width: 390, height: 844 } });

async function expectNoHorizontalOverflow(page: Page) {
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
  expect(fits, "document must not overflow horizontally at 390px").toBe(true);
}

test("home @ 390×844: no overflow, burger sheet, hero, passport fits, footer, zero console errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto("/");
  await expectNoHorizontalOverflow(page);

  // Hero h1 visible.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // The passport stage fits the viewport.
  const book = page.locator("#passportBook");
  await expect(book).toBeVisible();
  const box = await book.boundingBox();
  expect(box, "#passportBook must have a bounding box").not.toBeNull();
  expect(box!.width, "passport must fit the 390px viewport").toBeLessThanOrEqual(390);

  // Burger opens the nav sheet: full-width stacked links.
  const burger = page.getByRole("button", { name: /Open menu/i });
  await expect(burger).toBeVisible();
  await burger.click();
  const sheet = page.locator(".mobile-menu.open");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("link", { name: /Why CryptRepublic/i })).toBeVisible();
  await expect(sheet.getByRole("link", { name: /Sign in \/ Register/i })).toBeVisible();
  // Sheet-style block links: each link spans (nearly) the sheet's full width.
  const linkBox = await sheet.getByRole("link", { name: /Why CryptRepublic/i }).boundingBox();
  expect(linkBox, "sheet link must render").not.toBeNull();
  expect(linkBox!.width, "sheet links are full-width blocks").toBeGreaterThan(300);
  // Close the sheet again (link navigates within the page).
  await burger.click();
  await expect(sheet).toBeHidden();

  // Footer renders its 2-col mobile grid (presence + column count, no pixel math).
  const foot = page.locator("footer .foot");
  await expect(foot).toBeVisible();
  const cols = await foot.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" "));
  expect(cols, "footer collapses to 2 columns at ≤640").toHaveLength(2);

  expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
});

test("auth @ 390×844: no overflow, tabs switchable, form + console visible — ZERO registrations", async ({
  page,
}) => {
  await page.goto("/auth");
  await expectNoHorizontalOverflow(page);

  // Tabs visible + switchable.
  const signInTab = page.getByRole("tab", { name: /SIGN IN/i });
  const registerTab = page.getByRole("tab", { name: /REGISTER/i });
  await expect(signInTab).toBeVisible();
  await expect(registerTab).toBeVisible();

  // SIGN IN form: fields + submit visible and within the viewport width.
  await expect(page.getByLabel(/E-MAIL OF RECORD/i)).toBeVisible();
  await expect(page.getByLabel(/PASSPHRASE/i)).toBeVisible();
  const authBtn = page.getByRole("button", { name: /AUTHENTICATE/i });
  await expect(authBtn).toBeVisible();
  for (const loc of [page.getByLabel(/E-MAIL OF RECORD/i), authBtn]) {
    const b = await loc.boundingBox();
    expect(b).not.toBeNull();
    expect(b!.x + b!.width, "affordance fits the 390px viewport").toBeLessThanOrEqual(391);
  }

  // Switch to REGISTER: its fields + submit render; NOTHING is submitted
  // (register budget: this spec adds 0 registrations).
  await registerTab.click();
  await expect(page.getByLabel(/FULL OR CHOSEN NAME/i)).toBeVisible();
  await expect(page.getByLabel(/CHOOSE A PASSPHRASE/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /MINT/i })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  // The terminal/console log region renders.
  await expect(page.getByRole("log")).toBeVisible();

  // Back to SIGN IN (switchable both ways).
  await signInTab.click();
  await expect(page.getByLabel(/^(?!.*CHOOSE).*PASSPHRASE/i)).toBeVisible();
});
