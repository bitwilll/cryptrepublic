import { isAllowedSolanaMethod, serverSolanaRpcUrl } from "@/lib/rpc/allowlist";
import { json, badRequest } from "@/lib/http/responses";

interface JsonRpcRequest {
  jsonrpc?: string;
  method?: unknown;
  params?: unknown;
  id?: unknown;
}

/**
 * Keyed Solana JSON-RPC proxy. Reads the SERVER-ONLY keyed Solana RPC URL from
 * env, rejects any non-allow-listed method, forwards, and returns the response.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const requests: JsonRpcRequest[] = Array.isArray(body) ? body : [body as JsonRpcRequest];
  for (const r of requests) {
    if (typeof r?.method !== "string" || !isAllowedSolanaMethod(r.method)) {
      return badRequest("Method not allowed.");
    }
  }

  let url: string;
  try {
    url = serverSolanaRpcUrl();
  } catch {
    return badRequest("Solana RPC not configured.");
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
