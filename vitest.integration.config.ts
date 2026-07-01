import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * LOCAL-ANVIL integration config (Wave 5 Task 7). Runs ONLY
 * `test/integration/**` — spawns anvil, runs the Foundry Deploy + SeedGenesis
 * scripts, and drives the full mint path through the app's real code. Kept
 * separate from the default unit suite (which excludes test/integration/**).
 *
 * Run with: `pnpm test:integration` (requires Foundry — anvil/forge on PATH).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/integration/**/*.test.ts"],
    globals: true,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // Each integration file spawns its OWN anvil on the fixed port 8545 and
    // rewrites the shared broadcast dir + config/contracts.ts, so the files MUST
    // run one at a time — parallel workers would collide on the port and clobber
    // each other's broadcast. Serialize across files.
    fileParallelism: false,
    env: { DATABASE_URL: process.env.DATABASE_URL ?? "file:./dev.db" },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(new URL("./test/empty-module.ts", import.meta.url)),
      "client-only": fileURLToPath(new URL("./test/empty-module.ts", import.meta.url)),
    },
  },
});
