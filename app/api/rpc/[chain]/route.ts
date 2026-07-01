import { isAllowedEvmMethod, serverRpcUrl } from "@/lib/rpc/allowlist";
import { json, badRequest } from "@/lib/http/responses";

interface JsonRpcRequest {
  jsonrpc?: string;
  method?: unknown;
  params?: unknown;
  id?: unknown;
}

/**
 * Keyed EVM JSON-RPC proxy. Reads a SERVER-ONLY keyed RPC URL from env (never
 * exposed to the browser), rejects any non-allow-listed method (single or
 * batch), forwards the body upstream, and returns the JSON-RPC response.
 * NEVER logs the request body.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ chain: string }> },
): Promise<Response> {
  const { chain } = await params;
  const chainId = Number(chain);
  if (!Number.isInteger(chainId)) return badRequest("Invalid chain.");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const requests: JsonRpcRequest[] = Array.isArray(body) ? body : [body as JsonRpcRequest];
  for (const r of requests) {
    if (typeof r?.method !== "string" || !isAllowedEvmMethod(r.method)) {
      return badRequest("Method not allowed.");
    }
  }

  let url: string;
  try {
    url = serverRpcUrl(chainId);
  } catch {
    return badRequest("Unknown chain or RPC not configured.");
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return json({ error: "Upstream RPC unavailable." }, { status: 502 });
  }

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}
