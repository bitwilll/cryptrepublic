import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Automated axe-core smoke on the PUBLIC pages (Wave 8 A2 item 7).
 *
 * THRESHOLD (documented): ZERO `critical` and ZERO `serious` violations.
 * `moderate` / `minor` findings are LOGGED (console.log) but do not fail — the
 * gate is deliberately scoped to what axe classifies as user-blocking.
 *
 * Scope: `/` (marketing home) and `/auth` only — NO registration happens here
 * (register budget, Global Constraint #5: 8 pre-existing registrations across a
 * full `pnpm e2e` run; this spec adds 0). The DASHBOARD axe stations ride
 * inside Task C1's critical-path spec (`e2e/critical-path.spec.ts`, forward
 * reference) within its single registered context, under this same threshold.
 *
 * No `.exclude()` calls: nothing is exempted. Any future exclusion requires an
 * in-file comment justifying it.
 */

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

test("axe smoke: marketing home has no critical/serious violations", async ({ page }) => {
  await page.goto("/");
  // Let the reveal-on-scroll pass settle so axe scans rendered content.
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).analyze();
  await expectNoCriticalOrSerious("/", results);
});

test("axe smoke: /auth has no critical/serious violations (no registration)", async ({ page }) => {
  await page.goto("/auth");
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).analyze();
  await expectNoCriticalOrSerious("/auth", results);
});
