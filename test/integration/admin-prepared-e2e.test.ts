// @vitest-environment node
//
// LOCAL ANVIL ONLY — the Wave 9 D1 proof that the admin panel's PREPARED
// calldata is byte-correct end-to-end. The panel PREPARES and NEVER signs
// (Global Constraint #1; `test/no-admin-signing.test.ts` is the standing static
// proof over lib/admin/app admin dirs) — so THIS TEST does the signing, with
// anvil's THROWAWAY dev keys, via direct viem wallet clients against
// 127.0.0.1:8545. The signing code below lives ONLY in test/integration/,
// which the no-admin-signing guard deliberately does not scan. Never a real
// key, never a real network.
//
// Proofs:
//   A. prepareGrantRole/prepareRevokeRole → broadcast → hasRole flips both ways.
//   B. prepareSetApr → broadcast → aprBps changes (and the >50000 mirror throws
//      locally WITHOUT any tx).
//   C. prepareOpenEpochBatch (approve THEN openEpoch — openEpoch PULLS via
//      safeTransferFrom, note #12) → broadcast in order → epochs(1).open and
//      perCitizen === amount / totalCitizens(). Admin $CRYPT is drawn from the
//      treasury GENESIS supply (the harness fundCryptAndRewards grant+disburse
//      pattern — setup MAY be test-signed; only the PREPARED txs must go
//      through the prepared calldata).
//   D. safeTxBuilderJson is BYTE-FAITHFUL to the batch proven on-chain.
//   E. prepareDisburseProposal's GOVERNANCE-PROPOSAL payload executes
//      end-to-end: propose() broadcast FROM A CITIZEN (a non-citizen sender
//      reverts NotCitizen — the negative assertion), on-chain descriptionHash
//      matches the payload's, castVote(For), time-warp past end+executionDelay
//      via the DIRECT anvil test client (cheatcodes never touch the /api/rpc
//      proxy), execute() → the treasury balance moves through the prepared
//      callData verbatim.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// MUST be set before any app module import (harness/env convention; the
// lib/admin modules under test are environment-neutral and read no env).
process.env.NEXT_PUBLIC_CHAIN_ENV = "local";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
process.env.RPC_ANVIL = "http://127.0.0.1:8545";

import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  erc20Abi,
  getAddress,
  http,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { startAnvilWithContracts, foundryAvailable, type AnvilDeployment } from "./anvil-harness";
import {
  prepareGrantRole,
  prepareRevokeRole,
  prepareSetApr,
  prepareOpenEpochBatch,
  prepareDisburseProposal,
  safeTxBuilderJson,
  type PreparedTx,
} from "@/lib/admin/prepare";
import { ROLE_IDS } from "@/lib/admin/roles";
import { accessControlAbi, adminDistributorAbi, adminStakingAbi } from "@/lib/admin/abis";
import { governanceAbi, VOTE, PROPOSAL_STATE } from "@/lib/governance/abi";

const RPC_URL = "http://127.0.0.1:8545";

// anvil default dev keys — LOCAL/THROWAWAY ONLY. The TEST holds them; the
// panel never does. Key #1 is the citizen proposer/voter for Proof E.
const CITIZEN_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;
const citizenAccount = privateKeyToAccount(CITIZEN_PK);
// Two more anvil default addresses so totalCitizens() >= minCitizensForProposal (3 on anvil).
const CITIZEN_2 = getAddress("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"); // #2
const CITIZEN_3 = getAddress("0x90F79bf6EB2c4f870365E785982E1f101E93b906"); // #3
// Untouched anvil addresses: role-grant target (#5) and disburse recipient (#9).
const NEW_ADDR = getAddress("0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc");
const RECIPIENT = getAddress("0xa0Ee7A142d267C1f36714E4a8F75612F20a79720");

// 3 citizens → perCitizen is exact (no floor remainder).
const EPOCH_AMOUNT = 3_000n * 10n ** 18n;
const DISBURSE_AMOUNT = 777n * 10n ** 18n;
// Deploy.s.sol: votingPeriod 3 days + executionDelay 2 days (+ slack).
const WARP_SECONDS = 5 * 24 * 60 * 60 + 60;

const passportViewAbi = parseAbi([
  "function totalCitizens() view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
]);
const executeAbi = parseAbi(["function execute(uint256 proposalId) returns (bytes)"]);

const HAVE_FOUNDRY = foundryAvailable();
const d = HAVE_FOUNDRY ? describe : describe.skip;

let deployment: AnvilDeployment;

const publicClient = createPublicClient({ chain: foundry, transport: http(RPC_URL) });
// Anvil-only cheatcodes (evm_increaseTime / evm_mine) go through this DIRECT
// client, never the allowlisted /api/rpc proxy (wallet-e2e finding #4 pattern).
const testClient = createTestClient({ chain: foundry, mode: "anvil", transport: http(RPC_URL) });
const citizenWallet = createWalletClient({
  account: citizenAccount,
  chain: foundry,
  transport: http(RPC_URL),
});
// Built in beforeAll once the harness hands over the throwaway admin key (#0).
let adminWallet: ReturnType<typeof createWalletClient>;

/** Broadcast ONE prepared tx exactly as exported ({to, data}, value 0) and
 *  require a successful receipt — the byte-correctness gate for every proof. */
async function broadcastPrepared(
  wallet: ReturnType<typeof createWalletClient>,
  tx: PreparedTx,
): Promise<void> {
  expect(tx.value).toBe("0");
  const hash = await wallet.sendTransaction({
    account: wallet.account!,
    chain: foundry,
    to: tx.to,
    data: tx.data,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  expect(receipt.status).toBe("success");
}

async function hasRoleOn(contract: Address, role: Hex, account: Address): Promise<boolean> {
  return publicClient.readContract({
    address: contract,
    abi: accessControlAbi,
    functionName: "hasRole",
    args: [role, account],
  });
}

async function cryptBalance(token: Address, who: Address): Promise<bigint> {
  return publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [who],
  });
}

d("Wave 9 D1 — prepared admin calldata is valid end-to-end on local anvil", () => {
  beforeAll(async () => {
    deployment = await startAnvilWithContracts([]);
    // 3 citizens (>= minCitizensForProposal): the TEST-held key #1 owns
    // tokenId 1 so Proof E can sign propose()/castVote() from a CITIZEN wallet;
    // >= 1 citizen also means openEpoch has a snapshot (NoCitizens at 0).
    deployment.seedCitizensForGovernance([
      getAddress(citizenAccount.address),
      CITIZEN_2,
      CITIZEN_3,
    ]);
    adminWallet = createWalletClient({
      account: privateKeyToAccount(deployment.admin.privateKey),
      chain: foundry,
      transport: http(RPC_URL),
    });
  }, 120_000);

  afterAll(async () => {
    if (deployment) await deployment.stop();
    // Restore config/contracts.ts (the harness emits anvil addresses into it).
    try {
      const { execFileSync } = await import("node:child_process");
      execFileSync("git", ["checkout", "--", "config/contracts.ts"], {
        cwd: join(dirname(fileURLToPath(import.meta.url)), "..", ".."),
        stdio: "ignore",
      });
    } catch {
      /* best-effort cleanup */
    }
  });

  it("Proof A — prepared grantRole/revokeRole broadcast → hasRole flips both ways", async () => {
    const roleId = ROLE_IDS.REWARDS_ADMIN_ROLE;
    expect(await hasRoleOn(deployment.staking, roleId, NEW_ADDR)).toBe(false);

    const grant = prepareGrantRole(
      31337,
      "staking",
      deployment.staking,
      "REWARDS_ADMIN_ROLE",
      NEW_ADDR,
    );
    expect(grant.txs).toHaveLength(1);
    await broadcastPrepared(adminWallet, grant.txs[0]);
    expect(await hasRoleOn(deployment.staking, roleId, NEW_ADDR)).toBe(true);

    const revoke = prepareRevokeRole(
      31337,
      "staking",
      deployment.staking,
      "REWARDS_ADMIN_ROLE",
      NEW_ADDR,
    );
    await broadcastPrepared(adminWallet, revoke.txs[0]);
    expect(await hasRoleOn(deployment.staking, roleId, NEW_ADDR)).toBe(false);
  }, 120_000);

  it("Proof B — prepared setApr broadcast → aprBps changes; the >50000 mirror throws locally", async () => {
    const aprBefore = await publicClient.readContract({
      address: deployment.staking,
      abi: adminStakingAbi,
      functionName: "aprBps",
    });
    expect(aprBefore).toBe(1180); // Deploy.s.sol mockup APR

    const batch = prepareSetApr(31337, deployment.staking, 2500);
    await broadcastPrepared(adminWallet, batch.txs[0]);

    const aprAfter = await publicClient.readContract({
      address: deployment.staking,
      abi: adminStakingAbi,
      functionName: "aprBps",
    });
    expect(aprAfter).toBe(2500);

    // The validation mirror rejects BEFORE encoding — no tx is ever produced.
    expect(() => prepareSetApr(31337, deployment.staking, 50_001)).toThrow(/apr>500%/);
  }, 120_000);

  it("Proof C+D — the approve+openEpoch 2-tx batch opens epoch 1 (right perCitizen); Safe JSON is byte-faithful", async () => {
    // SETUP (test-signed, mirrors the harness fundCryptAndRewards treasury-genesis
    // draw — admin holds DEFAULT_ADMIN_ROLE on the treasury; no supply is minted).
    const setupGrant = await adminWallet.writeContract({
      account: adminWallet.account!,
      chain: foundry,
      address: deployment.treasury,
      abi: accessControlAbi,
      functionName: "grantRole",
      args: [ROLE_IDS.GOVERNANCE_ROLE, deployment.admin.address],
    });
    await publicClient.waitForTransactionReceipt({ hash: setupGrant });
    const setupDraw = await adminWallet.writeContract({
      account: adminWallet.account!,
      chain: foundry,
      address: deployment.treasury,
      abi: parseAbi(["function disburse(address token, address to, uint256 amount)"]),
      functionName: "disburse",
      args: [deployment.token, deployment.admin.address, EPOCH_AMOUNT],
    });
    await publicClient.waitForTransactionReceipt({ hash: setupDraw });

    const totalCitizens = await publicClient.readContract({
      address: deployment.passport,
      abi: passportViewAbi,
      functionName: "totalCitizens",
    });
    expect(totalCitizens).toBe(3n);

    // THE PREPARED ARTIFACT — broadcast IN ORDER (openEpoch PULLS the approve;
    // a lone openEpoch would revert on allowance — the ordered success IS the
    // proof the 2-tx batch is complete and correctly ordered).
    const batch = prepareOpenEpochBatch(
      31337,
      deployment.token,
      deployment.distributor,
      EPOCH_AMOUNT,
    );
    expect(batch.kind).toBe("batch");
    expect(batch.txs).toHaveLength(2);
    expect(batch.txs[0].to).toBe(deployment.token); // approve @ token
    expect(batch.txs[1].to).toBe(deployment.distributor); // openEpoch @ distributor
    await broadcastPrepared(adminWallet, batch.txs[0]);
    await broadcastPrepared(adminWallet, batch.txs[1]);

    const currentEpoch = await publicClient.readContract({
      address: deployment.distributor,
      abi: adminDistributorAbi,
      functionName: "currentEpoch",
    });
    expect(currentEpoch).toBe(1n);

    const [amount, snapshotCitizens, perCitizen, , open] = await publicClient.readContract({
      address: deployment.distributor,
      abi: adminDistributorAbi,
      functionName: "epochs",
      args: [1n],
    });
    expect(open).toBe(true);
    expect(amount).toBe(EPOCH_AMOUNT);
    expect(snapshotCitizens).toBe(totalCitizens);
    expect(perCitizen).toBe(EPOCH_AMOUNT / totalCitizens);

    // Proof D — the Safe Transaction Builder export is byte-faithful to the
    // exact batch just proven on-chain.
    const json = safeTxBuilderJson(batch);
    expect(json.version).toBe("1.0");
    expect(json.chainId).toBe("31337");
    expect(json.transactions).toHaveLength(batch.txs.length);
    for (const [i, t] of json.transactions.entries()) {
      expect(t.to).toBe(batch.txs[i].to);
      expect(t.data).toBe(batch.txs[i].data);
      expect(t.value).toBe("0");
    }
  }, 120_000);

  it("Proof E — the prepared disburse GOVERNANCE-PROPOSAL payload executes end-to-end", async () => {
    const payload = prepareDisburseProposal(
      31337,
      deployment.governance,
      deployment.treasury,
      deployment.token,
      RECIPIENT,
      DISBURSE_AMOUNT,
      "wave9 d1 disburse proof",
    );
    expect(payload.target).toBe(deployment.treasury);
    expect(payload.propose.to).toBe(deployment.governance);

    // NEGATIVE — a NON-citizen sender (the admin key holds no passport) reverts
    // NotCitizen on the very same propose() artifact.
    await expect(
      adminWallet.sendTransaction({
        account: adminWallet.account!,
        chain: foundry,
        to: payload.propose.to,
        data: payload.propose.data,
      }),
    ).rejects.toThrow();

    // The CITIZEN wallet (test-held anvil key #1, owns tokenId 1) submits it.
    const citizen = getAddress(citizenAccount.address);
    expect(
      await publicClient.readContract({
        address: deployment.passport,
        abi: passportViewAbi,
        functionName: "ownerOf",
        args: [1n],
      }),
    ).toBe(citizen);
    const proposeHash = await citizenWallet.sendTransaction({
      account: citizenAccount,
      chain: foundry,
      to: payload.propose.to,
      data: payload.propose.data,
    });
    const proposeReceipt = await publicClient.waitForTransactionReceipt({ hash: proposeHash });
    expect(proposeReceipt.status).toBe("success");

    const proposalId = await publicClient.readContract({
      address: deployment.governance,
      abi: governanceAbi,
      functionName: "proposalCount",
    });
    expect(proposalId).toBe(1n);

    // The on-chain descriptionHash is EXACTLY the payload's (the binding
    // convention keccak256(stringToHex(description)) survived the round trip).
    const proposal = await publicClient.readContract({
      address: deployment.governance,
      abi: governanceAbi,
      functionName: "proposals",
      args: [proposalId],
    });
    expect(proposal[9]).toBe(payload.descriptionHash); // descriptionHash
    expect(getAddress(proposal[10])).toBe(getAddress(deployment.treasury)); // target
    expect(proposal[12]).toBe(payload.callData); // callData verbatim

    // castVote(For) from the citizen's passport.
    const voteHash = await citizenWallet.writeContract({
      account: citizenAccount,
      chain: foundry,
      address: deployment.governance,
      abi: governanceAbi,
      functionName: "castVote",
      args: [proposalId, 1n, VOTE.For],
    });
    await publicClient.waitForTransactionReceipt({ hash: voteHash });

    // Warp past end + executionDelay via the DIRECT anvil test client
    // (cheatcodes are out-of-band setup — never the /api/rpc proxy).
    await testClient.increaseTime({ seconds: WARP_SECONDS });
    await testClient.mine({ blocks: 1 });

    const state = await publicClient.readContract({
      address: deployment.governance,
      abi: governanceAbi,
      functionName: "state",
      args: [proposalId],
    });
    expect(PROPOSAL_STATE[state]).toBe("Succeeded");

    const recipientBefore = await cryptBalance(deployment.token, RECIPIENT);
    const treasuryBefore = await cryptBalance(deployment.token, deployment.treasury);

    const execHash = await citizenWallet.writeContract({
      account: citizenAccount,
      chain: foundry,
      address: deployment.governance,
      abi: executeAbi,
      functionName: "execute",
      args: [proposalId],
    });
    const execReceipt = await publicClient.waitForTransactionReceipt({ hash: execHash });
    expect(execReceipt.status).toBe("success");

    // The treasury balance moved through the PREPARED callData verbatim.
    const recipientAfter = await cryptBalance(deployment.token, RECIPIENT);
    const treasuryAfter = await cryptBalance(deployment.token, deployment.treasury);
    expect(recipientAfter - recipientBefore).toBe(DISBURSE_AMOUNT);
    expect(treasuryBefore - treasuryAfter).toBe(DISBURSE_AMOUNT);
  }, 120_000);
});
