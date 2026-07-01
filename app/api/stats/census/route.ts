import "server-only";
import { requireSession } from "@/lib/auth/guard";
import { activeChain } from "@/lib/config/chain";
import { contractEntry } from "@/config/contracts";
import {
  readTotalCitizensServer,
  readCitizenMintedLogsServer,
  readHeadBlockServer,
} from "@/lib/passport/serverReads";
import { json } from "@/lib/http/responses";

/**
 * GET → the live census total (`totalCitizens()`) + a 24h delta computed from
 * `CitizenMinted` logs newer than ~24h of blocks. Honest 0 delta on a fresh
 * chain.
 */
const BLOCKS_24H_ESTIMATE = 7200n; // ~12s blocks; approximate window for the delta

export async function GET(req: Request): Promise<Response> {
  try {
    await requireSession(req);
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }
  const chainId = activeChain().primaryChainId;
  if (!contractEntry(chainId).passport) {
    return json({ totalCitizens: null, delta24h: 0 });
  }
  try {
    const total = await readTotalCitizensServer(chainId);
    let delta24h = 0;
    try {
      const head = await readHeadBlockServer(chainId);
      const fromBlock = head > BLOCKS_24H_ESTIMATE ? head - BLOCKS_24H_ESTIMATE : 0n;
      const recent = await readCitizenMintedLogsServer(chainId, fromBlock);
      delta24h = recent.length;
    } catch {
      delta24h = 0;
    }
    return json({ totalCitizens: total.toString(), delta24h });
  } catch {
    return json({ totalCitizens: null, delta24h: 0 });
  }
}
