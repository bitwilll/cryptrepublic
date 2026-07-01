import "client-only";
import { createPublicClient, http, type PublicClient } from "viem";
import { evmEntry } from "@/config/chains.config";

/**
 * Origin the proxy path resolves against. In the browser viem's http transport
 * accepts a relative `/api/*` URL (resolved against the document origin), but
 * viem constructs a `new URL()` internally which needs an absolute base outside
 * a browser (Node tests). We use `window.location.origin` when present and fall
 * back to `NEXT_PUBLIC_APP_URL` (default localhost) so the URL is always valid.
 * The path stays `/api/rpc/<chainId>`, so `connect-src 'self'` still covers it.
 */
function proxyOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/**
 * One viem PublicClient per chain. The transport posts JSON-RPC to our
 * allow-listed `/api/rpc/<chainId>` proxy — so the browser never contacts a
 * keyed RPC origin directly and `connect-src 'self'` covers every read.
 */
export function publicClientFor(chainId: number): PublicClient {
  const entry = evmEntry(chainId); // throws for unknown/inactive chain
  return createPublicClient({
    chain: entry.viemChain,
    transport: http(`${proxyOrigin()}/api/rpc/${chainId}`),
  });
}
