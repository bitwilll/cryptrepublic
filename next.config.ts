import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Canonical host: www serves the same Vercel deployment, but sessions/CSRF and
  // NEXT_PUBLIC_APP_URL are pinned to the apex — permanently redirect www so
  // users never browse (and mutate) from the twin host. Host-conditioned, so
  // local dev is unaffected. (lib/auth/csrf.ts additionally accepts the www twin
  // as defense in depth for in-flight pages.)
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.cryptrepublic.com" }],
        destination: "https://cryptrepublic.com/:path*",
        permanent: true,
      },
    ];
  },
  // Legacy design-tool exports (*.html, *.jsx) sit at repo root as reference only.
  // They are not imported by app/, so Next ignores them.
  //
  // CSP + security headers live in middleware.ts (a per-request nonce is needed
  // for the strict script-src, which headers() cannot mint).
  //
  // `next lint` only lints app/pages/components/lib by default — add `config` so
  // the client-only import-boundary rule scoped to `config/**` actually fires.
  eslint: {
    dirs: ["app", "components", "lib", "config"],
  },
  webpack(config) {
    // wagmi/WalletConnect pull in optional deps that are never loaded in a
    // browser: @metamask/sdk optionally imports the React Native-only
    // `@react-native-async-storage/async-storage`, and pino optionally imports
    // `pino-pretty` (dev logging). Alias both to false to silence the (harmless)
    // "Module not found" build warnings.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@react-native-async-storage/async-storage": false,
      "pino-pretty": false,
    };
    return config;
  },
};

export default nextConfig;
