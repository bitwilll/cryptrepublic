import "server-only";
import { requireSession } from "@/lib/auth/guard";
import { activeChain } from "@/lib/config/chain";
import { contractEntry } from "@/config/contracts";
import { readCitizenMintedLogsServer } from "@/lib/passport/serverReads";
import { json } from "@/lib/http/responses";

/**
 * GET → recent inductions from `CitizenMinted` logs (block-sorted, newest first).
 * Empty on a fresh chain — NEVER the mockup's 6 fabricated inductions.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    await requireSession(req);
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }
  const chainId = activeChain().primaryChainId;
  if (!contractEntry(chainId).passport) {
    return json({ inductions: [] });
  }
  try {
    const logs = await readCitizenMintedLogsServer(chainId);
    const inductions = logs
      .sort((a, b) => Number(b.blockNumber - a.blockNumber))
      .slice(0, 12)
      .map((l) => ({
        tokenId: l.tokenId.toString(),
        mintBlock: l.mintBlock.toString(),
        blockNumber: l.blockNumber.toString(),
      }));
    return json({ inductions });
  } catch {
    return json({ inductions: [] });
  }
}
