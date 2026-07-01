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
import { createPublicClient, http, keccak256, toBytes, type Address, type Hex } from "viem";
import { foundry } from "viem/chains";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const contractsDir = join(repoRoot, "contracts");

const RPC_URL = "http://127.0.0.1:8545";
// anvil default account #0 — LOCAL/THROWAWAY dev key ONLY.
const ADMIN_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const ADMIN_ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;
const ZERO_BYTES32 = ("0x" + "0".repeat(64)) as Hex;

export interface AnvilDeployment {
  rpcUrl: string;
  chainId: 31337;
  passport: Address;
  token: Address;
  staking: Address;
  treasury: Address;
  governance: Address;
  distributor: Address;
  admin: { address: Address; privateKey: Hex };
  /**
   * LOCAL-ONLY. Admin-mint one passport per address so `totalCitizens()` reaches
   * `minCitizensForProposal` (3 on anvil) and each address OWNS a soulbound
   * tokenId (1..N in order). Admin holds `PASSPORT_ADMIN_ROLE`, so `adminMint`
   * works. nameHash/motto/domicile are opaque local placeholders (a genesis
   * citizen's nameHash is untranslatable by design — never asserted).
   */
  seedCitizensForGovernance(addresses: Address[]): void;
  /**
   * LOCAL-ONLY. Open a dividend epoch funded from the treasury GENESIS supply.
   * Draws `amount` treasury -> admin (admin self-grants GOVERNANCE_ROLE to
   * `disburse`, same pattern as `fundCryptAndRewards`, so NO supply is minted),
   * then — admin holds `FUNDER_ROLE` on the distributor — `approve(distributor,
   * amount)` + `openEpoch(amount)` (which PULLS the funds). Amount must be
   * obviously sufficient (>= snapshotCitizens so perCitizen > 0).
   */
  openDividendEpoch(amount: bigint): void;
  /**
   * LOCAL-ONLY. Fund a test wallet with $CRYPT and top up the staking reward pool
   * from the treasury GENESIS supply (moves existing supply — never mints), so no
   * self-granted MINTER_ROLE and no supply expansion (finding #9). The two draws
   * are independently sized so neither starves the other (finding #3):
   *   1. grant GOVERNANCE_ROLE to admin (admin holds DEFAULT_ADMIN_ROLE on treasury),
   *   2. disburse `recipientAmount + rewardAmount` treasury -> admin,
   *   3. transfer `recipientAmount` admin -> recipient,
   *   4. approve `rewardAmount` to staking then fundRewards(`rewardAmount`).
   * `recipientAmount` is the wallet's full $CRYPT (enough to STAKE and still SEND).
   */
  fundCryptAndRewards(recipient: Address, recipientAmount: bigint, rewardAmount: bigint): void;
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
    const created = (name: string): Address | undefined =>
      txs.find((t) => t.transactionType === "CREATE" && t.contractName === name)
        ?.contractAddress as Address | undefined;
    const passport = created("CryptRepublicPassport");
    const token = created("CryptToken");
    const staking = created("CryptStaking");
    const treasury = created("CryptTreasury");
    const governance = created("CryptGovernance");
    const distributor = created("DividendDistributor");
    if (!passport) throw new Error("passport address not found in broadcast");
    if (!token) throw new Error("token address not found in broadcast");
    if (!staking) throw new Error("staking address not found in broadcast");
    if (!treasury) throw new Error("treasury address not found in broadcast");
    if (!governance) throw new Error("governance address not found in broadcast");
    if (!distributor) throw new Error("distributor address not found in broadcast");

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

    // LOCAL-ONLY throwaway admin cast helper (anvil key #0).
    const castSend = (to: Address, sig: string, args: string[]): void => {
      execFileSync(
        "cast",
        ["send", to, sig, ...args, "--rpc-url", RPC_URL, "--private-key", ADMIN_PK],
        { cwd: contractsDir, stdio: "ignore" },
      );
    };

    const fundCryptAndRewards = (
      recipient: Address,
      recipientAmount: bigint,
      rewardAmount: bigint,
    ): void => {
      const total = recipientAmount + rewardAmount;
      const GOVERNANCE_ROLE = keccak256(toBytes("GOVERNANCE_ROLE"));
      // 1. Admin (DEFAULT_ADMIN_ROLE on treasury) self-grants GOVERNANCE_ROLE so it can disburse.
      castSend(treasury, "grantRole(bytes32,address)", [GOVERNANCE_ROLE, ADMIN_ADDR]);
      // 2. Move existing GENESIS $CRYPT treasury -> admin (no mint; less-privileged path, finding #9).
      castSend(treasury, "disburse(address,address,uint256)", [
        token,
        ADMIN_ADDR,
        total.toString(),
      ]);
      // 3. Fund the test wallet (enough to STAKE and still SEND).
      castSend(token, "transfer(address,uint256)", [recipient, recipientAmount.toString()]);
      // 4. Fund the staking reward pool from a SEPARATE draw (exact allowance -> fundRewards).
      castSend(token, "approve(address,uint256)", [staking, rewardAmount.toString()]);
      castSend(staking, "fundRewards(uint256)", [rewardAmount.toString()]);
    };

    // Admin-mint one soulbound passport per address (admin holds PASSPORT_ADMIN_ROLE).
    // nameHash/motto/domicile are opaque local placeholders (never asserted against
    // the app's nameHashOf — a genesis/admin-mint nameHash is untranslatable).
    const seedCitizensForGovernance = (addresses: Address[]): void => {
      for (const who of addresses) {
        const nameHash = keccak256(toBytes(who)); // deterministic, opaque placeholder
        castSend(passport, "adminMint(address,bytes32,bytes32,bytes32)", [
          who,
          nameHash,
          ZERO_BYTES32,
          ZERO_BYTES32,
        ]);
      }
    };

    // Open a dividend epoch funded from treasury genesis. Draw `amount` treasury ->
    // admin (same less-privileged disburse path as fundCryptAndRewards, no mint),
    // then approve + openEpoch (admin holds FUNDER_ROLE; openEpoch PULLS the funds).
    const openDividendEpoch = (amount: bigint): void => {
      const GOVERNANCE_ROLE = keccak256(toBytes("GOVERNANCE_ROLE"));
      castSend(treasury, "grantRole(bytes32,address)", [GOVERNANCE_ROLE, ADMIN_ADDR]);
      castSend(treasury, "disburse(address,address,uint256)", [
        token,
        ADMIN_ADDR,
        amount.toString(),
      ]);
      castSend(token, "approve(address,uint256)", [distributor, amount.toString()]);
      castSend(distributor, "openEpoch(uint256)", [amount.toString()]);
    };

    return {
      rpcUrl: RPC_URL,
      chainId: 31337,
      passport,
      token,
      staking,
      treasury,
      governance,
      distributor,
      admin: { address: ADMIN_ADDR, privateKey: ADMIN_PK },
      fundCryptAndRewards,
      seedCitizensForGovernance,
      openDividendEpoch,
      stop,
    };
  } catch (e) {
    await stop();
    throw e;
  }
}
