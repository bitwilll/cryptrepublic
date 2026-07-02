import "server-only";
import {
  createPublicClient,
  getAbiItem,
  http,
  stringToHex,
  toBytes,
  type PublicClient,
} from "viem";
import { evmEntry } from "@/config/chains.config";
import { serverRpcUrl } from "@/lib/rpc/allowlist";
import { contractEntry } from "@/config/contracts";
import { prisma } from "@/lib/db";
import {
  accessControlAbi,
  adminDistributorAbi,
  adminGovernanceAbi,
  adminPassportAbi,
  adminStakingAbi,
  adminTokenAbi,
  adminTreasuryAbi,
} from "./abis";
import {
  ADMIN_CONTRACTS,
  CONTRACT_ROLES,
  ROLE_IDS,
  type AdminContract,
  type RoleName,
} from "./roles";

/**
 * SERVER-SIDE admin chain reads (Wave 9). Mirrors lib/passport/serverReads.ts
 * (`serverClient` via `serverRpcUrl`; eth_getLogs is already allowlisted —
 * lib/rpc/allowlist.ts:24 — NO new RPC methods). READS ONLY — the admin panel
 * never broadcasts (test/no-admin-signing.test.ts).
 *
 * GRACEFUL DEGRADATION (Wave-7 constraint #11 posture): the unregistered
 * default env (84532 placeholders) returns `{available:false}`, and every
 * per-contract read is wrapped so one failing contract degrades to an OMITTED
 * section — never a thrown 500.
 */

function serverClient(chainId: number): PublicClient {
  const entry = evmEntry(chainId); // throws for unknown/inactive chain
  return createPublicClient({
    chain: entry.viemChain,
    transport: http(serverRpcUrl(chainId)),
  });
}

export interface AdminChainParams {
  chainId: number;
  available: boolean; // false when NO admin-relevant contract is registered
  addresses: Partial<Record<AdminContract, `0x${string}`>>; // the composer's source of truth
  token?: { paused: boolean; maxSupply: string; totalSupply: string };
  passport?: { requiredWitnesses: number; burnEnabled: boolean };
  governance?: {
    votingPeriod: string;
    quorumBps: number;
    executionDelay: string;
    minCitizensForProposal: string;
  };
  treasury?: {
    totalAllocationBps: number;
    allocations: { bucket: string; onchainBps: number | null }[]; // per DB TreasuryAllocation buckets
  };
  distributor?: { currentEpoch: string };
  staking?: { aprBps: number; totalStaked: string; rewardPoolRemaining: string };
}

function registeredAddresses(chainId: number): Partial<Record<AdminContract, `0x${string}`>> {
  const entry = contractEntry(chainId);
  const addresses: Partial<Record<AdminContract, `0x${string}`>> = {};
  for (const c of ADMIN_CONTRACTS) {
    const addr = entry[c];
    if (addr) addresses[c] = addr;
  }
  return addresses;
}

export async function readAdminParamsServer(chainId: number): Promise<AdminChainParams> {
  const addresses = registeredAddresses(chainId);
  if (Object.keys(addresses).length === 0) {
    return { chainId, available: false, addresses: {} }; // the 84532 default env — graceful
  }
  const client = serverClient(chainId);
  const out: AdminChainParams = { chainId, available: true, addresses };

  if (addresses.token) {
    try {
      const address = addresses.token;
      const [paused, maxSupply, totalSupply] = await Promise.all([
        client.readContract({ address, abi: adminTokenAbi, functionName: "paused" }),
        client.readContract({ address, abi: adminTokenAbi, functionName: "MAX_SUPPLY" }),
        client.readContract({ address, abi: adminTokenAbi, functionName: "totalSupply" }),
      ]);
      out.token = {
        paused: Boolean(paused),
        maxSupply: (maxSupply as bigint).toString(),
        totalSupply: (totalSupply as bigint).toString(),
      };
    } catch {
      // degrade: omit the token section
    }
  }

  if (addresses.passport) {
    try {
      const address = addresses.passport;
      const [requiredWitnesses, burnEnabled] = await Promise.all([
        client.readContract({ address, abi: adminPassportAbi, functionName: "requiredWitnesses" }),
        client.readContract({ address, abi: adminPassportAbi, functionName: "burnEnabled" }),
      ]);
      out.passport = {
        requiredWitnesses: Number(requiredWitnesses),
        burnEnabled: Boolean(burnEnabled),
      };
    } catch {
      // degrade
    }
  }

  if (addresses.governance) {
    try {
      const address = addresses.governance;
      const [votingPeriod, quorumBps, executionDelay, minCitizens] = await Promise.all([
        client.readContract({ address, abi: adminGovernanceAbi, functionName: "votingPeriod" }),
        client.readContract({ address, abi: adminGovernanceAbi, functionName: "quorumBps" }),
        client.readContract({ address, abi: adminGovernanceAbi, functionName: "executionDelay" }),
        client.readContract({
          address,
          abi: adminGovernanceAbi,
          functionName: "minCitizensForProposal",
        }),
      ]);
      out.governance = {
        votingPeriod: (votingPeriod as bigint).toString(),
        quorumBps: Number(quorumBps),
        executionDelay: (executionDelay as bigint).toString(),
        minCitizensForProposal: (minCitizens as bigint).toString(),
      };
    } catch {
      // degrade
    }
  }

  if (addresses.treasury) {
    try {
      const address = addresses.treasury;
      const totalAllocationBps = await client.readContract({
        address,
        abi: adminTreasuryAbi,
        functionName: "totalAllocationBps",
      });
      const rows = await prisma.treasuryAllocation.findMany({ select: { bucket: true } });
      const allocations: { bucket: string; onchainBps: number | null }[] = [];
      for (const { bucket } of rows) {
        // SAME bucket→bytes32 mapping as prepareSetAllocation (stringToHex size 32 —
        // recorded decision, notes #14). An unencodable bucket (> 32 UTF-8 bytes)
        // maps to onchainBps null — one bad row must not degrade the whole card.
        try {
          if (toBytes(bucket).length > 32) throw new Error("bucket exceeds 32 bytes");
          const bps = await client.readContract({
            address,
            abi: adminTreasuryAbi,
            functionName: "allocationBps",
            args: [stringToHex(bucket, { size: 32 })],
          });
          allocations.push({ bucket, onchainBps: Number(bps) });
        } catch {
          allocations.push({ bucket, onchainBps: null });
        }
      }
      out.treasury = { totalAllocationBps: Number(totalAllocationBps), allocations };
    } catch {
      // degrade
    }
  }

  if (addresses.distributor) {
    try {
      const currentEpoch = await client.readContract({
        address: addresses.distributor,
        abi: adminDistributorAbi,
        functionName: "currentEpoch",
      });
      out.distributor = { currentEpoch: (currentEpoch as bigint).toString() };
    } catch {
      // degrade
    }
  }

  if (addresses.staking) {
    try {
      const address = addresses.staking;
      const [aprBps, totalStaked, rewardPoolRemaining] = await Promise.all([
        client.readContract({ address, abi: adminStakingAbi, functionName: "aprBps" }),
        client.readContract({ address, abi: adminStakingAbi, functionName: "totalStaked" }),
        client.readContract({
          address,
          abi: adminStakingAbi,
          functionName: "rewardPoolRemaining",
        }),
      ]);
      out.staking = {
        aprBps: Number(aprBps),
        totalStaked: (totalStaked as bigint).toString(),
        rewardPoolRemaining: (rewardPoolRemaining as bigint).toString(),
      };
    } catch {
      // degrade
    }
  }

  return out;
}

export interface RoleHolders {
  role: RoleName;
  roleId: `0x${string}`;
  holders: `0x${string}`[];
}

export interface ContractRoleTopology {
  contract: AdminContract;
  address: `0x${string}`;
  roles: RoleHolders[];
}

/** ALGORITHM (pinned — do NOT implement as a set-difference fold): candidates =
 *  the DISTINCT accounts appearing in RoleGranted logs ONLY; RoleRevoked logs are
 *  NOT applied to the candidate set (subtracting them false-negatives any
 *  grant→revoke→re-grant history — and the panel itself prepares revoke-then-
 *  regrant flows). Removal is EXCLUSIVELY the hasRole confirm step: every
 *  candidate is checked via hasRole and kept only when true. hasRole is the
 *  source of truth for the final holder list; the logs only bound the candidate
 *  universe (AccessControl is not enumerable).
 *
 *  fromBlock = the registry entry's optional `deployBlock` (default 0 — correct
 *  on 31337; addendum #6: real chains should pin it to the deploy block, since
 *  getLogs-from-0 may hit provider limits on Base/Base Sepolia). */
export async function readRoleTopologyServer(
  chainId: number,
): Promise<{ chainId: number; available: boolean; contracts: ContractRoleTopology[] }> {
  const entry = contractEntry(chainId);
  const addresses = registeredAddresses(chainId);
  const present = ADMIN_CONTRACTS.filter((c) => addresses[c]);
  if (present.length === 0) {
    return { chainId, available: false, contracts: [] };
  }
  const client = serverClient(chainId);
  const fromBlock = BigInt(entry.deployBlock ?? 0);
  const grantedEvent = getAbiItem({ abi: accessControlAbi, name: "RoleGranted" });

  const contracts: ContractRoleTopology[] = [];
  for (const contract of present) {
    const address = addresses[contract]!;
    try {
      const logs = await client.getLogs({
        address,
        event: grantedEvent,
        fromBlock,
        toBlock: "latest",
      });
      const roles: RoleHolders[] = [];
      for (const role of CONTRACT_ROLES[contract]) {
        const roleId = ROLE_IDS[role];
        const candidates = [
          ...new Set(
            logs
              .filter((l) => (l.args.role as string)?.toLowerCase() === roleId.toLowerCase())
              .map((l) => l.args.account as `0x${string}`),
          ),
        ];
        const holders: `0x${string}`[] = [];
        for (const candidate of candidates) {
          const confirmed = await client.readContract({
            address,
            abi: accessControlAbi,
            functionName: "hasRole",
            args: [roleId, candidate],
          });
          if (confirmed) holders.push(candidate);
        }
        roles.push({ role, roleId, holders });
      }
      contracts.push({ contract, address, roles });
    } catch {
      // degrade: omit this contract's topology, keep the rest
    }
  }
  return { chainId, available: true, contracts };
}
