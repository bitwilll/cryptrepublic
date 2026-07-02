import "server-only";
import { json } from "@/lib/http/responses";
import { guardAdminGet } from "@/lib/admin/routeGuard";
import { activeChain } from "@/lib/config/chain";
import { readRoleTopologyServer } from "@/lib/admin/serverReads";

/**
 * GET /api/admin/chain/roles — the CONFIRMED role topology per contract:
 * candidates from RoleGranted logs ONLY, kept only when hasRole confirms
 * (the pinned algorithm — lib/admin/serverReads.ts; AccessControl is not
 * enumerable). Rate-limited per admin (log scan). GRACEFUL: unregistered
 * chain / any failure → 200 {available:false, contracts:[]} — never a 500.
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
    return json(await readRoleTopologyServer(chainId));
  } catch {
    return json({ chainId, available: false, contracts: [] });
  }
}
