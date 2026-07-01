import "client-only";
import { getAbiItem, type Address, type Hex } from "viem";
import { publicClientFor } from "@/lib/wallet/services/evmClients";
import { passportAddress } from "@/config/contracts";
import { passportAbi } from "./abi";

/**
 * Typed passport READ client. Every read goes through the app's REAL
 * `publicClientFor(chainId)` → `/api/rpc/<chainId>` proxy (CSP-safe). No write
 * lives here — the single write (`mintWithWitnesses`) is signed by the user's own
 * wallet in `lib/passport/mint.ts`.
 */

export interface CitizenRecord {
  tokenId: bigint;
  nameHash: Hex;
  motto: Hex;
  domicile: Hex;
  oathAccepted: boolean;
  mintBlock: bigint;
}

export interface PassportStatus {
  isCitizen: boolean;
  tokenId?: bigint; // the owned token if a citizen
  citizen?: CitizenRecord;
  tokenURI?: string;
}

function client(chainId: number) {
  return publicClientFor(chainId);
}

function address(chainId: number): Address {
  return passportAddress(chainId);
}

/** requiredWitnesses() as a number. */
export async function readRequiredWitnesses(chainId: number): Promise<number> {
  const n = await client(chainId).readContract({
    address: address(chainId),
    abi: passportAbi,
    functionName: "requiredWitnesses",
  });
  return Number(n);
}

/** nonces(applicant) — the per-applicant nonce mintWithWitnesses will consume. */
export function readApplicantNonce(chainId: number, applicant: Address): Promise<bigint> {
  return client(chainId).readContract({
    address: address(chainId),
    abi: passportAbi,
    functionName: "nonces",
    args: [applicant],
  });
}

/** DOMAIN_SEPARATOR() — for cross-checking the app-built domain against chain. */
export function readDomainSeparator(chainId: number): Promise<Hex> {
  return client(chainId).readContract({
    address: address(chainId),
    abi: passportAbi,
    functionName: "DOMAIN_SEPARATOR",
  });
}

export function readTotalCitizens(chainId: number): Promise<bigint> {
  return client(chainId).readContract({
    address: address(chainId),
    abi: passportAbi,
    functionName: "totalCitizens",
  });
}

export function readHasPassport(chainId: number, who: Address): Promise<boolean> {
  return client(chainId).readContract({
    address: address(chainId),
    abi: passportAbi,
    functionName: "hasPassport",
    args: [who],
  });
}

/**
 * Full status for the "Your Passport" screen.
 *
 * The passport is NOT ERC721Enumerable (no `tokenOfOwnerByIndex`), so to resolve
 * a citizen's owned tokenId we query `CitizenMinted(tokenId, citizen, ...)` logs
 * filtered by the indexed `citizen` topic. A citizen holds exactly one soulbound
 * token, so there is exactly one such log.
 */
export async function readPassportStatus(chainId: number, who: Address): Promise<PassportStatus> {
  const c = client(chainId);
  const addr = address(chainId);
  const isCitizen = await readHasPassport(chainId, who);
  if (!isCitizen) return { isCitizen: false };

  const citizenMintedEvent = getAbiItem({ abi: passportAbi, name: "CitizenMinted" });
  const logs = await c.getLogs({
    address: addr,
    event: citizenMintedEvent,
    args: { citizen: who },
    fromBlock: 0n,
    toBlock: "latest",
  });
  if (logs.length === 0) {
    // hasPassport is true but no mint log resolved — surface a citizen with no
    // resolvable tokenId rather than throwing (defensive).
    return { isCitizen: true };
  }
  const tokenId = logs[0].args.tokenId as bigint;

  const [record, tokenURI] = await Promise.all([
    c.readContract({
      address: addr,
      abi: passportAbi,
      functionName: "citizenOf",
      args: [tokenId],
    }),
    c.readContract({
      address: addr,
      abi: passportAbi,
      functionName: "tokenURI",
      args: [tokenId],
    }),
  ]);

  const [nameHash, motto, domicile, oathAccepted, mintBlock] = record;
  const citizen: CitizenRecord = {
    tokenId,
    nameHash,
    motto,
    domicile,
    oathAccepted,
    mintBlock,
  };
  return { isCitizen: true, tokenId, citizen, tokenURI };
}
