import "server-only";
import { requireSession } from "@/lib/auth/guard";
import { activeChain } from "@/lib/config/chain";
import { governanceAvailable, distributorAvailable } from "@/config/contracts";
import { prisma } from "@/lib/db";
import { resolveApplicantAddress } from "@/lib/applications/applicant";
import { readPassportStatusServer, readRequiredWitnessesServer } from "@/lib/passport/serverReads";
import {
  readProposalCountServer,
  readProposalServer,
  readMyVoteServer,
} from "@/lib/governance/serverReads";
import { readCurrentEpochServer, readClaimableServer } from "@/lib/dividends/serverReads";
import { json } from "@/lib/http/responses";

/**
 * GET → the citizen's outstanding obligations:
 *  - unvoted OPEN proposals (voteByPassport == None per open id)
 *  - pending witness requests (DB)
 *  - an unclaimed dividend (claimable(currentEpoch, tokenId) > 0)
 * FIRST resolve the caller's verified address + tokenId server-side; skip the
 * chain reads and return an EMPTY set when there is no wallet or they are not a
 * citizen (a non-citizen's only "obligation" is to mint — surfaced by the UI).
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
  const address = await resolveApplicantAddress(userId);

  // The applicant's own in-flight mint (witness stage) — relevant even before a
  // wallet is linked, so it is surfaced BEFORE the address gate below. Statuses
  // per lib/applications/state.ts: OATH_ACCEPTED = collecting attestations (when
  // a witness request is outstanding) or ready to request them; WITNESSED =
  // enough attestations collected, awaiting the on-chain seal.
  const application = await prisma.citizenshipApplication.findUnique({
    where: { userId },
    select: {
      status: true,
      witnessNonce: true,
      _count: { select: { witnessSignatures: true } },
    },
  });

  const obligations: { kind: string; ref: string; label: string }[] = [];
  if (application?.status === "WITNESSED") {
    obligations.push({
      kind: "witness",
      ref: "seal",
      label: "All witness attestations collected — seal your passport.",
    });
  } else if (application?.status === "OATH_ACCEPTED") {
    if (application.witnessNonce) {
      const n = application._count.witnessSignatures;
      // The denominator is a chain read; omit it honestly when unreadable.
      let required: number | null = null;
      try {
        required = await readRequiredWitnessesServer(chainId);
      } catch {
        required = null;
      }
      obligations.push({
        kind: "witness",
        ref: "witnessing",
        label:
          required !== null
            ? `Your passport mint is waiting for witness attestations (${n} of ${required} collected).`
            : `Your passport mint is waiting for witness attestations (${n} collected so far).`,
      });
    } else {
      obligations.push({
        kind: "witness",
        ref: "witnessing",
        label: "Your application is at the witness stage — resume to request attestations.",
      });
    }
  }

  if (!address) {
    return json({ isCitizen: false, tokenId: null, obligations });
  }

  let status: { isCitizen: boolean; tokenId: bigint | null };
  try {
    status = await readPassportStatusServer(chainId, address);
  } catch {
    status = { isCitizen: false, tokenId: null };
  }

  if (!status.isCitizen || status.tokenId === null) {
    // Not a citizen -> skip voteByPassport / claimable entirely.
    return json({ isCitizen: false, tokenId: null, obligations });
  }
  const tokenId = status.tokenId;

  // Unvoted OPEN proposals.
  if (governanceAvailable(chainId)) {
    try {
      const count = await readProposalCountServer(chainId);
      const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1));
      for (const id of ids) {
        const p = await readProposalServer(chainId, id);
        if (p.state !== "Active") continue;
        const myVote = await readMyVoteServer(chainId, id, tokenId);
        if (myVote === 0) {
          obligations.push({
            kind: "vote",
            ref: id.toString(),
            label: `Proposal #${id.toString()} awaits your vote.`,
          });
        }
      }
    } catch {
      // governance unavailable / RPC down — no vote obligations surfaced.
    }
  }

  // Unclaimed dividend.
  if (distributorAvailable(chainId)) {
    try {
      const epoch = await readCurrentEpochServer(chainId);
      if (epoch > 0n) {
        const claimable = await readClaimableServer(chainId, epoch, tokenId);
        if (claimable > 0n) {
          obligations.push({
            kind: "dividend",
            ref: epoch.toString(),
            label: "You have an unclaimed dividend.",
          });
        }
      }
    } catch {
      // distributor unavailable / RPC down — no dividend obligation surfaced.
    }
  }

  return json({ isCitizen: true, tokenId: tokenId.toString(), obligations });
}
