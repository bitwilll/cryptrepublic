import "server-only";
import { requireSession } from "@/lib/auth/guard";
import { activeChain } from "@/lib/config/chain";
import { distributorAvailable } from "@/config/contracts";
import { resolveApplicantAddress } from "@/lib/applications/applicant";
import { readPassportStatusServer } from "@/lib/passport/serverReads";
import { readDividendHistoryServer } from "@/lib/dividends/serverReads";
import { json } from "@/lib/http/responses";

/**
 * GET → the caller's dividend claim history (`DividendClaimed` logs for their
 * tokenId). Empty for a non-citizen / a citizen with no claims. Graceful when the
 * distributor is unregistered (constraint #11).
 */
export async function GET(req: Request): Promise<Response> {
  let userId: string;
  try {
    ({
      user: { id: userId },
    } = await requireSession(req));
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }
  const chainId = activeChain().primaryChainId;
  if (!distributorAvailable(chainId)) {
    return json({ available: false, claims: [] });
  }

  const address = await resolveApplicantAddress(userId);
  if (!address) return json({ available: true, claims: [] });

  try {
    const status = await readPassportStatusServer(chainId, address);
    if (!status.isCitizen || status.tokenId === null) {
      return json({ available: true, claims: [] });
    }
    const history = await readDividendHistoryServer(chainId, status.tokenId);
    const claims = history.map((c) => ({
      epochId: c.epochId.toString(),
      tokenId: c.tokenId.toString(),
      amount: c.amount.toString(),
      blockNumber: c.blockNumber.toString(),
      txHash: c.txHash,
    }));
    return json({ available: true, claims });
  } catch {
    return json({ available: false, claims: [] });
  }
}
