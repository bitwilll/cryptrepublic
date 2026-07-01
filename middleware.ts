import { NextResponse, type NextRequest } from "next/server";

/**
 * Security headers + CSP for the whole app. The wallet needs a strict script
 * policy (NO general `unsafe-eval`, NO script `unsafe-inline`) with ONE exception
 * — `wasm-unsafe-eval` so the Argon2id (hash-wasm) WASM can compile; if the CSP
 * ever blocks WASM, `kdf.ts` degrades to the PBKDF2 fallback rather than bricking
 * wallet creation.
 *
 * Inline scripts: Next App Router emits inline bootstrap/RSC scripts. Rather than
 * `unsafe-inline` (which the plan forbids for scripts), we mint a per-request
 * nonce here, pass it to Next via the `x-nonce` request header (Next auto-applies
 * it to its own <script> tags), and pin `script-src` to `'self' 'nonce-…'`.
 *
 * connect-src: ALL keyed RPC/indexer/BTC reads AND the public fallback route
 * through `/api/*` (see config/chains.config.ts), so `'self'` covers every read.
 * WalletConnect opens BOTH `.com` and `.org` (https + wss) sockets — enumerated.
 *
 * Tradeoff: a nonce forces dynamic rendering (no full static prerender). That is
 * acceptable for this app; the alternative (`unsafe-inline` scripts) is worse.
 *
 * Dev note: Next dev/HMR needs `'unsafe-eval'` + `'unsafe-inline'`; the strict
 * policy applies only in production.
 */
export function middleware(request: NextRequest): NextResponse {
  const isProd = process.env.NODE_ENV === "production";
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const scriptSrc = isProd
    ? `'self' 'nonce-${nonce}' 'wasm-unsafe-eval'`
    : `'self' 'unsafe-eval' 'unsafe-inline' 'wasm-unsafe-eval'`;

  const connectSrc = [
    "'self'",
    "https://*.walletconnect.com",
    "wss://*.walletconnect.com",
    "https://*.walletconnect.org",
    "wss://*.walletconnect.org",
  ].join(" ");

  const csp = [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data:`,
    `font-src 'self'`,
    `connect-src ${connectSrc}`,
    `worker-src 'self' blob:`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  response.headers.set("x-frame-options", "DENY");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set("x-content-type-options", "nosniff");
  return response;
}

export const config = {
  // Apply to all routes except Next internals and static assets.
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
