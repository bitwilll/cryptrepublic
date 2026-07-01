import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "test/**/*.test.ts",
      "test/**/*.test.tsx",
      "lib/**/*.test.ts",
      "components/**/*.test.tsx",
    ],
    globals: true,
    // Honor CI's DATABASE_URL (which CI also migrates) so the db test hits the
    // migrated database; fall back to the local dev db otherwise.
    env: { DATABASE_URL: process.env.DATABASE_URL ?? "file:./dev.db" },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // Next.js server-only/client-only markers are no-ops in unit tests.
      "server-only": fileURLToPath(new URL("./test/empty-module.ts", import.meta.url)),
      "client-only": fileURLToPath(new URL("./test/empty-module.ts", import.meta.url)),
    },
  },
});
