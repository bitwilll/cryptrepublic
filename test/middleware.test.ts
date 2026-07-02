// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

/**
 * Security-header contract for middleware.ts (Wave 8 B1):
 *  - HSTS is PRODUCTION-ONLY (localhost dev must never cache HSTS) and ADDITIVE —
 *    the pre-existing CSP/nonce, x-frame-options, referrer-policy and
 *    x-content-type-options headers stay byte-identical in shape.
 */

function run(): Response {
  return middleware(new NextRequest("http://localhost:3000/"));
}

afterEach(() => vi.unstubAllEnvs());

describe("middleware security headers", () => {
  it("sets Strict-Transport-Security in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = run();
    expect(res.headers.get("strict-transport-security")).toBe(
      "max-age=31536000; includeSubDomains",
    );
  });

  it("does NOT set Strict-Transport-Security outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    const res = run();
    expect(res.headers.get("strict-transport-security")).toBeNull();
  });

  it("keeps the existing prod CSP + hardening headers unchanged", () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = run();
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'wasm-unsafe-eval'/);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("keeps the dev CSP (unsafe-eval/unsafe-inline for HMR) unchanged", () => {
    vi.stubEnv("NODE_ENV", "development");
    const res = run();
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("'unsafe-inline'");
  });
});
