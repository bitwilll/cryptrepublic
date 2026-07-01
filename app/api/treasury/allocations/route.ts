import "server-only";
import { keccak256, stringToHex } from "viem";
import { requireSession } from "@/lib/auth/guard";
import { activeChain } from "@/lib/config/chain";
import { treasuryAvailable } from "@/config/contracts";
import { prisma } from "@/lib/db";
import { readAllocationBpsServer } from "@/lib/treasury/serverReads";
import { json } from "@/lib/http/responses";

/**
 * GET → seeded allocation TARGETS (governance-ratified intent — NOT live splits),
 * each overlaid with the on-chain `allocationBps` for its bucket key when the
 * treasury is deployed (constraint #11 — probe availability, never crash). On an
 * unregistered chain `onchainBps` is null and only the targets render.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    await requireSession(req);
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }
  const chainId = activeChain().primaryChainId;
  const allocations = await prisma.treasuryAllocation.findMany({ orderBy: { targetBps: "desc" } });

  const available = treasuryAvailable(chainId);
  const rows = await Promise.all(
    allocations.map(async (a) => {
      let onchainBps: number | null = null;
      if (available) {
        try {
          onchainBps = await readAllocationBpsServer(chainId, keccak256(stringToHex(a.bucket)));
        } catch {
          onchainBps = null;
        }
      }
      return {
        bucket: a.bucket,
        label: a.label,
        targetBps: a.targetBps,
        color: a.color,
        onchainBps,
      };
    }),
  );

  return json({ allocations: rows, isTargets: true });
}
