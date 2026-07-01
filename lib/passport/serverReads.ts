import "server-only";
import { createPublicClient, http, type Address, type Hex, type PublicClient } from "viem";
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
