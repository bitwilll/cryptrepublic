import { evmEntry } from "@/config/chains.config";
import { json, badRequest } from "@/lib/http/responses";

const ETHERSCAN_V2_BASE = "https://api.etherscan.io/v2/api";

/**
 * Tx-history proxy via Etherscan API v2 (multichain, one key). Reads the
 * SERVER-ONLY `ETHERSCAN_API_KEY`, validates the chain against the active
 * profile, forwards a `txlist` request, and returns the JSON. The API key
 * never reaches the browser.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ chain: string }> },
): Promise<Response> {
  const { chain } = await params;
  const chainId = Number(chain);
  if (!Number.isInteger(chainId)) return badRequest("Invalid chain.");

  try {
    evmEntry(chainId); // throws for unknown/inactive chain
  } catch {
    return badRequest("Unknown or inactive chain.");
  }

  const address = new URL(req.url).searchParams.get("address");
  if (!address) return badRequest("Missing address.");

  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) return badRequest("History provider not configured.");

  const upstreamUrl = new URL(ETHERSCAN_V2_BASE);
  upstreamUrl.searchParams.set("chainid", String(chainId));
  upstreamUrl.searchParams.set("module", "account");
  upstreamUrl.searchParams.set("action", "txlist");
  upstreamUrl.searchParams.set("address", address);
  upstreamUrl.searchParams.set("sort", "desc");
  upstreamUrl.searchParams.set("apikey", apiKey);

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl.toString());
  } catch {
    return json({ error: "Upstream history unavailable." }, { status: 502 });
  }

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}
