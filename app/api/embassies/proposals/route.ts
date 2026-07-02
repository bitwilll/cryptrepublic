import "server-only";
import { getAddress, keccak256, stringToHex } from "viem";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { activeChain } from "@/lib/config/chain";
import { prisma } from "@/lib/db";
import { resolveApplicantAddress } from "@/lib/applications/applicant";
import { readHasPassportServer } from "@/lib/passport/serverReads";
import { readGovernanceParamServer } from "@/lib/governance/serverReads";
import { proposeEmbassySchema, canonicalEmbassyContent } from "@/lib/validation/dashboard";
import { rateLimit } from "@/lib/auth/ratelimit";
import { json, badRequest, forbidden, tooManyRequests } from "@/lib/http/responses";

/**
 * POST → attach off-chain content to a citizen's on-chain propose-embassy
 * signalling proposal. Beyond verifying the caller is A citizen, this BINDS the
 * content to the caller AND to the on-chain proposal (constraint #4 / #5):
 *   1. resolve the caller's verified EVM address (never a client field);
 *   2. verify passport ownership on-chain;
 *   3. reject unless `proposals(proposalId).proposer === caller` (authorship —
 *      no attaching content to another citizen's proposalId);
 *   4. reject unless `keccak256(canonical content) === on-chain descriptionHash`
 *      (content/hash match — no citing a proposalId that does not correspond to
 *      the content).
 * `proposalId` + `txHash` are REQUIRED (schema) — a proposal with no on-chain id
 * cannot pass the binding.
 */
export async function POST(req: Request): Promise<Response> {
  if (!isAllowedOrigin(req)) return forbidden();
  let userId: string;
  try {
    ({
      user: { id: userId },
    } = await requireSession(req));
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }

  // Per-user rate limit (Wave 8 B1): 5 embassy proposals / 15 min. Keyed on the
  // session user id (never IP) — Constraint #4.
  const rl = rateLimit(`embassy-propose:${userId}`, 5, 15 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const parsed = proposeEmbassySchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the embassy proposal fields.");
  const data = parsed.data;

  const chainId = activeChain().primaryChainId;

  // 1. Verified caller address (never trust a client field).
  const address = await resolveApplicantAddress(userId);
  if (!address) return forbidden();

  // 2. On-chain passport ownership.
  const isCitizen = await readHasPassportServer(chainId, address);
  if (!isCitizen) return forbidden();

  // 3 + 4. Bind to the on-chain proposal: proposer === caller AND
  //         keccak256(content) === descriptionHash.
  let onchain: { proposer: `0x${string}`; descriptionHash: `0x${string}` };
  try {
    onchain = await readGovernanceParamServer(chainId, BigInt(data.proposalId));
  } catch {
    return badRequest("Could not read the on-chain proposal.");
  }
  if (getAddress(onchain.proposer) !== getAddress(address)) {
    return forbidden(); // authorship spoof
  }
  const computedHash = keccak256(stringToHex(canonicalEmbassyContent(data)));
  if (computedHash.toLowerCase() !== onchain.descriptionHash.toLowerCase()) {
    return badRequest("Content does not match the on-chain proposal descriptionHash.");
  }

  const proposal = await prisma.governanceProposalContent.upsert({
    where: { chainId_proposalId: { chainId, proposalId: data.proposalId } },
    update: {
      title: `Embassy: ${data.name}`,
      tag: "CIVIC",
      body: canonicalEmbassyContent(data),
      descriptionHash: onchain.descriptionHash,
    },
    create: {
      chainId,
      proposalId: data.proposalId,
      title: `Embassy: ${data.name}`,
      tag: "CIVIC",
      body: canonicalEmbassyContent(data),
      descriptionHash: onchain.descriptionHash,
    },
  });

  return json({ ok: true, proposalContentId: proposal.id, txHash: data.txHash });
}
