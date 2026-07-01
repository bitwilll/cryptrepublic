import "server-only";
import {
  createPublicClient,
  getAbiItem,
  http,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { evmEntry } from "@/config/chains.config";
import { serverRpcUrl } from "@/lib/rpc/allowlist";
import { passportAddress } from "@/config/contracts";
import { passportAbi } from "./abi";

/**
 * SERVER-SIDE passport reads for route handlers. The browser reads go through
 * `lib/passport/client.ts` (client-only, via the `/api/rpc` proxy); route
 * handlers cannot import that client-only module, so they use this server-only
 * reader that talks to the KEYED (server-only) RPC URL directly — no CSP concern
 * server-side, no key exposed to the browser.
 */
function serverClient(chainId: number): PublicClient {
  const entry = evmEntry(chainId); // throws for unknown/inactive chain
  return createPublicClient({
    chain: entry.viemChain,
    transport: http(serverRpcUrl(chainId)),
  });
}

export function readApplicantNonceServer(chainId: number, applicant: Address): Promise<bigint> {
  return serverClient(chainId).readContract({
    address: passportAddress(chainId),
    abi: passportAbi,
    functionName: "nonces",
    args: [applicant],
  });
}

export function readHasPassportServer(chainId: number, who: Address): Promise<boolean> {
  return serverClient(chainId).readContract({
    address: passportAddress(chainId),
    abi: passportAbi,
    functionName: "hasPassport",
    args: [who],
  });
}

export async function readRequiredWitnessesServer(chainId: number): Promise<number> {
  const n = await serverClient(chainId).readContract({
    address: passportAddress(chainId),
    abi: passportAbi,
    functionName: "requiredWitnesses",
  });
  return Number(n);
}

export function readDomainSeparatorServer(chainId: number): Promise<Hex> {
  return serverClient(chainId).readContract({
    address: passportAddress(chainId),
    abi: passportAbi,
    functionName: "DOMAIN_SEPARATOR",
  });
}

export interface PassportStatusServer {
  isCitizen: boolean;
  tokenId: bigint | null;
}

/**
 * SERVER-SIDE tokenId resolver. Mirrors the client-only `readPassportStatus`'s
 * `CitizenMinted`-log path (the passport is NOT ERC721Enumerable, so a citizen's
 * owned tokenId is resolved via the indexed `citizen` topic — exactly one log per
 * soulbound holder). Route handlers cannot import the client-only resolver, so
 * this exists for `/api/citizen/obligations` (A5) and the propose-embassy binding
 * (B6). Defensive: returns `{ isCitizen:false, tokenId:null }` when no log
 * matches — never throws for a missing log.
 */
export async function readPassportStatusServer(
  chainId: number,
  who: Address,
): Promise<PassportStatusServer> {
  const c = serverClient(chainId);
  const addr = passportAddress(chainId);
  const isCitizen = await readHasPassportServer(chainId, who);
  if (!isCitizen) return { isCitizen: false, tokenId: null };

  const event = getAbiItem({ abi: passportAbi, name: "CitizenMinted" });
  const logs = await c.getLogs({
    address: addr,
    event,
    args: { citizen: who },
    fromBlock: 0n,
    toBlock: "latest",
  });
  if (logs.length === 0) {
    // hasPassport true but no resolvable mint log — surface a citizen with no
    // tokenId rather than throwing (defensive; mirrors readPassportStatus).
    return { isCitizen: true, tokenId: null };
  }
  return { isCitizen: true, tokenId: logs[0].args.tokenId as bigint };
}
