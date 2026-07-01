import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:3000" },
  // Run e2e against a PRODUCTION build, not `pnpm dev`: dev mode + React 19 emit
  // hydration/Fast-Refresh console noise that would fail the zero-console-errors assertion.
  webServer: {
    command: "pnpm build && pnpm start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
