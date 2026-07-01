import "server-only";
import { activeChain } from "@/lib/config/chain";
import { contractEntry } from "@/config/contracts";
import { readTotalCitizensServer } from "@/lib/passport/serverReads";
import { json } from "@/lib/http/responses";

/**
 * GET (public) → the trustless live citizen count from `totalCitizens()`
 * (addendum #1: NEVER totalSupply()). null when the passport is unregistered.
 */
export async function GET(): Promise<Response> {
  const chainId = activeChain().primaryChainId;
  let totalCitizens: string | null = null;
  if (contractEntry(chainId).passport) {
    try {
      totalCitizens = (await readTotalCitizensServer(chainId)).toString();
    } catch {
      totalCitizens = null;
    }
  }
  return json({ totalCitizens });
}
