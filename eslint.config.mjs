import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  { ignores: [".next/**", "node_modules/**", "contracts/**", "*.jsx", "image-slot.js"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // CLIENT-ONLY wallet boundary: no server surface may import lib/wallet.
    // Covers route/layout/page server files, server actions, middleware, every
    // server-only module tree (auth/db/rpc/indexer), and config/** (linted via
    // next.config.ts eslint.dirs). The "use client" wallet UI lives under
    // components/wallet/** — NOT in this scope — and may import lib/wallet.
    files: [
      "app/**/route.ts",
      "app/**/layout.tsx",
      "app/**/page.tsx",
      "app/**/actions.ts",
      "middleware.ts",
      "lib/auth/**",
      "lib/db.ts",
      "lib/rpc/**",
      "lib/indexer/**",
      "config/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/wallet", "@/lib/wallet/*", "**/lib/wallet/*"],
              message:
                "lib/wallet is CLIENT-ONLY: never import wallet key-material modules from a server file.",
            },
          ],
        },
      ],
    },
  },
];
