import "server-only";
import { requireSession } from "@/lib/auth/guard";
import { activeChain } from "@/lib/config/chain";
import { treasuryAvailable } from "@/config/contracts";
import { readDisbursementsServer } from "@/lib/treasury/serverReads";
import { json } from "@/lib/http/responses";

/**
 * GET → EXECUTED treasury flows from `Disbursed` logs (empty on a fresh chain).
 * Graceful when the treasury is unregistered (constraint #11).
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
    return json({ available: false, flows: [] });
  }
  try {
    const disbursements = await readDisbursementsServer(chainId);
    const flows = disbursements.map((d) => ({
      token: d.token,
      to: d.to,
      amount: d.amount.toString(),
      blockNumber: d.blockNumber.toString(),
      txHash: d.txHash,
      status: "EXECUTED" as const,
    }));
    return json({ available: true, flows });
  } catch {
    return json({ available: false, flows: [] });
  }
}
