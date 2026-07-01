import { activeChain } from "@/config/chains.config";
import { json, badRequest } from "@/lib/http/responses";

/**
 * Bitcoin (Esplora / mempool.space) proxy — balances + receive/history reads
 * only. Allow-lists the Esplora path shapes we use so the browser can't proxy
 * arbitrary upstreams. Base URL is derived from the active bitcoin network.
 */
function baseUrl(): string {
  return activeChain().bitcoinNetwork === "mainnet"
    ? "https://mempool.space/api"
    : "https://mempool.space/testnet/api";
}

const ADDR_RE = /^[0-9a-zA-Z]+$/;
const TXID_RE = /^[0-9a-fA-F]{64}$/;

/** Return the allow-listed upstream path, or null if the shape isn't allowed. */
function resolvePath(segments: string[]): string | null {
  // address/:addr
  if (segments.length === 2 && segments[0] === "address" && ADDR_RE.test(segments[1])) {
    return `address/${segments[1]}`;
  }
  // address/:addr/utxo | address/:addr/txs
  if (
    segments.length === 3 &&
    segments[0] === "address" &&
    ADDR_RE.test(segments[1]) &&
    (segments[2] === "utxo" || segments[2] === "txs")
  ) {
    return `address/${segments[1]}/${segments[2]}`;
  }
  // tx/:id
  if (segments.length === 2 && segments[0] === "tx" && TXID_RE.test(segments[1])) {
    return `tx/${segments[1]}`;
  }
  return null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params;
  const segments = Array.isArray(path) ? path : [path];
  const allowed = resolvePath(segments);
  if (!allowed) return badRequest("Path not allowed.");

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl()}/${allowed}`);
  } catch {
    return json({ error: "Upstream BTC provider unavailable." }, { status: 502 });
  }

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}
