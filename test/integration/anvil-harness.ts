// LOCAL ANVIL ONLY — anvil default dev keys, never a real key or network.
//
// Spawns a local anvil node, runs the Foundry Deploy + SeedGenesis scripts with
// anvil's throwaway default dev key (#0), emits the deployed addresses into
// `config/contracts.ts` via scripts/emit-contract-addresses.mjs, and asserts the
// passport has code on-chain. Returns the deployment + a `stop()`.
//
// MAJOR — SeedGenesis nameHash divergence: SeedGenesis computes each seed
// citizen's nameHash as keccak256(abi.encode(address)) (the ADDRESS abi-encoded),
// NOT keccak256(stringToHex(name)) like the app's nameHashOf. A genesis citizen's
// on-chain nameHash is therefore OPAQUE/untranslatable — never assert it equals
// nameHashOf(<name>). Only the applicant minted via mintWithWitnesses has a
// nameHash the app itself supplied.
import { spawn, type ChildProcess } from "node:child_process";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, type Address, type Hex } from "viem";
import { foundry } from "viem/chains";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const contractsDir = join(repoRoot, "contracts");

const RPC_URL = "http://127.0.0.1:8545";
// anvil default account #0 — LOCAL/THROWAWAY dev key ONLY.
const ADMIN_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const ADMIN_ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;

export interface AnvilDeployment {
  rpcUrl: string;
  chainId: 31337;
  passport: Address;
  token: Address;
  admin: { address: Address; privateKey: Hex };
  stop(): Promise<void>;
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Foundry/anvil availability (skip gracefully in CI without Foundry). */
export function foundryAvailable(): boolean {
  try {
    execFileSync("anvil", ["--version"], { stdio: "ignore" });
    execFileSync("forge", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function waitForRpc(client: ReturnType<typeof createPublicClient>): Promise<void> {
  for (let i = 0; i < 50; i++) {
    try {
      await client.getBlockNumber();
      return;
    } catch {
      await wait(200);
    }
  }
  throw new Error("anvil RPC did not come up in time");
}

/**
 * Start anvil, deploy the contracts, genesis-seed `seedCitizens`, emit addresses,
 * and assert the passport has code. `seedCitizens` become existing citizens
 * (so they can act as witnesses).
 */
export async function startAnvilWithContracts(seedCitizens: Address[]): Promise<AnvilDeployment> {
  // Fresh broadcast so we parse the CURRENT run, never a stale file.
  rmSync(join(contractsDir, "broadcast"), { recursive: true, force: true });

  const anvil: ChildProcess = spawn("anvil", ["--silent", "--port", "8545"], {
    cwd: contractsDir,
    stdio: "ignore",
  });

  const client = createPublicClient({ chain: foundry, transport: http(RPC_URL) });

  const stop = async (): Promise<void> => {
    anvil.kill("SIGKILL");
    // Do NOT commit broadcast/ — remove it after the run.
    rmSync(join(contractsDir, "broadcast"), { recursive: true, force: true });
    await wait(100);
  };

  try {
    await waitForRpc(client);

    // Deploy (broadcaster == admin → runs configure: requiredWitnesses=7 + roles).
    execFileSync(
      "forge",
      [
        "script",
        "script/Deploy.s.sol",
        "--rpc-url",
        RPC_URL,
        "--private-key",
        ADMIN_PK,
        "--broadcast",
      ],
      { cwd: contractsDir, stdio: "ignore" },
    );

    // Emit addresses into config/contracts.ts (the app's registry).
    execFileSync("node", ["scripts/emit-contract-addresses.mjs", "--chain", "31337"], {
      cwd: repoRoot,
      stdio: "ignore",
    });

    // Read the emitted addresses back from the broadcast (fresh import each run).
    const broadcast = (await import(
      join(contractsDir, "broadcast", "Deploy.s.sol", "31337", "run-latest.json") +
        `?t=${Date.now()}`,
      { with: { type: "json" } }
    )) as {
      default: {
        transactions: { transactionType: string; contractName: string; contractAddress: string }[];
      };
    };
    const txs = broadcast.default.transactions;
    const passport = txs.find(
      (t) => t.transactionType === "CREATE" && t.contractName === "CryptRepublicPassport",
    )?.contractAddress as Address;
    const token = txs.find((t) => t.transactionType === "CREATE" && t.contractName === "CryptToken")
      ?.contractAddress as Address;
    if (!passport) throw new Error("passport address not found in broadcast");

    // Assert the passport actually has code before proceeding.
    const code = await client.getBytecode({ address: passport });
    if (!code || code === "0x") {
      throw new Error(`no code at passport ${passport}`);
    }

    // Genesis-seed the witness citizens.
    if (seedCitizens.length > 0) {
      execFileSync(
        "forge",
        [
          "script",
          "script/SeedGenesis.s.sol",
          "--rpc-url",
          RPC_URL,
          "--private-key",
          ADMIN_PK,
          "--broadcast",
        ],
        {
          cwd: contractsDir,
          stdio: "ignore",
          env: {
            ...process.env,
            PASSPORT: passport,
            SEED_CITIZENS: seedCitizens.join(","),
          },
        },
      );
    }

    return {
      rpcUrl: RPC_URL,
      chainId: 31337,
      passport,
      token: token ?? ("0x0000000000000000000000000000000000000000" as Address),
      admin: { address: ADMIN_ADDR, privateKey: ADMIN_PK },
      stop,
    };
  } catch (e) {
    await stop();
    throw e;
  }
}
