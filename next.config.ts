import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Legacy design-tool exports (*.html, *.jsx) sit at repo root as reference only.
  // They are not imported by app/, so Next ignores them.
  // Security headers (CSP etc.) are added in a later wave alongside the wallet.
};

export default nextConfig;
