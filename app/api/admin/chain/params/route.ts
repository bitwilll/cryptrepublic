import "server-only";
import { json } from "@/lib/http/responses";
import { guardAdminGet } from "@/lib/admin/routeGuard";
import { activeChain } from "@/lib/config/chain";
import { readAdminParamsServer } from "@/lib/admin/serverReads";

/**
 * GET /api/admin/chain/params — current per-contract params + the registered
 * ADDRESSES (the C4 composer's source of truth: the client-side throwing
 * accessors would crash on the unregistered 84532 default env — note #7).
 *
 * Thin wrapper over lib/admin/serverReads (READS ONLY — the panel never
 * broadcasts). Rate-limited per admin even though it is a GET: the reads scan
 * logs from the deploy block (constraint #2). GRACEFUL: the unregistered
 * default chain AND any serverReads failure return 200 {available:false} —
 * never a 500 (Wave-7 constraint-#11 posture, test-asserted).
 */
export async function GET(req: Request): Promise<Response> {
  const actor = await guardAdminGet(req, {
    keyPrefix: "admin-chain",
    limit: 30,
    windowMs: 5 * 60_000,
  });
  if (actor instanceof Response) return actor;

  const chainId = activeChain().primaryChainId;
  try {
    return json(await readAdminParamsServer(chainId));
  } catch {
    return json({ chainId, available: false, addresses: {} });
  }
}
