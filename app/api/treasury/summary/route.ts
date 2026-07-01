import "server-only";
import { requireSession } from "@/lib/auth/guard";
import { activeChain } from "@/lib/config/chain";
import { treasuryAvailable } from "@/config/contracts";
import { readTreasuryReservesServer } from "@/lib/treasury/serverReads";
import { json } from "@/lib/http/responses";

/**
 * GET → REAL treasury reserves ($CRYPT + ETH balances). Honest near-0 on a fresh
 * chain — NEVER the mockup's "$14.20M". Graceful when the treasury is
 * unregistered (constraint #11): returns `available:false` with null reserves.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    await requireSession(req);
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }
  const chainId = activeChain().primaryChainId;
  if (!treasuryAvailable(chainId)) {
    return json({ available: false, cryptWei: null, ethWei: null });
  }
  try {
    const reserves = await readTreasuryReservesServer(chainId);
    return json({
      available: true,
      cryptWei: reserves.cryptWei.toString(),
      ethWei: reserves.ethWei.toString(),
    });
  } catch {
    return json({ available: false, cryptWei: null, ethWei: null });
  }
}
