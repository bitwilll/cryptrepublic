// @vitest-environment node
//
// LOCAL ANVIL ONLY — the load-bearing end-to-end validation of Wave 7 (governance
// vote + dividend claim). Runs the REAL frozen contracts on a REAL (local) anvil
// chain and drives the governance and dividend WRITE paths through the APP's OWN
// service code (mirrors test/integration/wallet-e2e.test.ts EXACTLY):
//   deploy -> admin-mint >= minCitizensForProposal(3) citizens (the TEST wallet
//   OWNS one tokenId) -> proposeEmbedded (signalling 0x0/0/0x) -> readProposal
//   (Active, tally 0) -> castVoteEmbedded(For) -> readProposal (forVotes==1) +
//   readMyVote(For);
//   then openDividendEpoch (funded from treasury genesis; admin has FUNDER_ROLE)
//   -> readClaimable > 0 -> claimDividendEmbedded -> claimed==true, $CRYPT up by
//   perCitizen, a SECOND claim reverts (AlreadyClaimed) -> no double-claim.
//
// Runs with CHAIN_ENV=local so publicClientFor(31337) / evmEntry(31337) /
// serverRpcUrl(31337) resolve the app's REAL read/broadcast path. Browser fetches
// to `/api/rpc/31337` are dispatched IN-PROCESS to the real proxy route handler,
// and every JSON-RPC method is captured so we assert `eth_sendTransaction` /
// `personal_sign` / `eth_sign` / `eth_accounts` are NEVER used on the embedded
// path — only `eth_sendRawTransaction`.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// MUST be set before any app module is imported so CHAIN_ENV resolves to local.
process.env.NEXT_PUBLIC_CHAIN_ENV = "local";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
process.env.RPC_ANVIL = "http://127.0.0.1:8545";

import {
  createPublicClient,
  erc20Abi,
  getAddress,
  http,
  keccak256,
  toHex,
  type Account,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { startAnvilWithContracts, foundryAvailable, type AnvilDeployment } from "./anvil-harness";

// Hoisted mutable signer holder so the mocked `withEvmSigner` yields the test
// wallet's anvil account. `vi.mock` below closes over it.
const signerHolder = vi.hoisted(() => ({ current: null as Account | null }));

vi.mock("@/lib/wallet/embedded/session", () => ({
  withEvmSigner: async <T>(fn: (a: Account) => Promise<T>): Promise<T> => {
    if (!signerHolder.current) throw new Error("no test signer injected");
    return fn(signerHolder.current);
  },
  isUnlocked: () => true,
  getAccounts: () => (signerHolder.current ? { evm: signerHolder.current.address } : null),
}));

// anvil default key #8 (LOCAL/THROWAWAY dev key) — the TEST wallet (owns a passport).
const WALLET_PK = "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97" as Hex;
const testAccount = privateKeyToAccount(WALLET_PK);
// Two more anvil default accounts so totalCitizens() >= minCitizensForProposal(3).
const CITIZEN_2 = getAddress("0x70997970C51812dc3A010C7d01b50e0d17dc79C8"); // #1
const CITIZEN_3 = getAddress("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"); // #2

// Explicit, obviously-sufficient dividend amount (drawn from treasury genesis).
const EPOCH_AMOUNT = 3_000n * 10n ** 18n;

const HAVE_FOUNDRY = foundryAvailable();
const d = HAVE_FOUNDRY ? describe : describe.skip;

type AppMods = {
  governanceClient: typeof import("@/lib/governance/client");
  governanceWrite: typeof import("@/lib/governance/write");
  dividendsClient: typeof import("@/lib/dividends/client");
  dividendsWrite: typeof import("@/lib/dividends/write");
  passportClient: typeof import("@/lib/passport/client");
  governanceAbiMod: typeof import("@/lib/governance/abi");
  contracts: typeof import("@/config/contracts");
  rpcRoute: typeof import("@/app/api/rpc/[chain]/route");
};

let deployment: AnvilDeployment;
let mods: AppMods;
const rpcMethods: string[] = [];

// Direct anvil client for out-of-band assertions (NOT the app path).
const directClient = createPublicClient({
  chain: foundry,
  transport: http("http://127.0.0.1:8545"),
});

async function directCryptBalance(token: Address, who: Address): Promise<bigint> {
  return directClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [who],
  });
}

function assertNoServerSigning(): void {
  expect(rpcMethods).toContain("eth_sendRawTransaction");
  expect(rpcMethods).not.toContain("eth_sendTransaction");
  expect(rpcMethods).not.toContain("personal_sign");
  expect(rpcMethods).not.toContain("eth_sign");
  expect(rpcMethods).not.toContain("eth_accounts");
  // Setup cheatcodes/casts never reach the app proxy.
  expect(rpcMethods).not.toContain("evm_increaseTime");
  expect(rpcMethods).not.toContain("evm_mine");
}

d("Wave 7 governance vote + dividend claim on local anvil", () => {
  beforeAll(async () => {
    deployment = await startAnvilWithContracts([]);

    // Admin-mint 3 citizens (test wallet + 2 more) so totalCitizens() >= 3 (the
    // propose floor) and the test wallet OWNS a passport tokenId to vote/claim with.
    deployment.seedCitizensForGovernance([getAddress(testAccount.address), CITIZEN_2, CITIZEN_3]);

    // Fresh module graph so config/contracts.ts (just emitted) is re-read.
    vi.resetModules();
    mods = {
      governanceClient: await import("@/lib/governance/client"),
      governanceWrite: await import("@/lib/governance/write"),
      dividendsClient: await import("@/lib/dividends/client"),
      dividendsWrite: await import("@/lib/dividends/write"),
      passportClient: await import("@/lib/passport/client"),
      governanceAbiMod: await import("@/lib/governance/abi"),
      contracts: await import("@/config/contracts"),
      rpcRoute: await import("@/app/api/rpc/[chain]/route"),
    };

    // Route the app's browser fetch to `/api/rpc/31337` IN-PROCESS to the REAL
    // proxy route handler (which forwards to anvil). Capture every JSON-RPC
    // method so we can assert no eth_sendTransaction. Direct anvil calls (the
    // directClient above) fall through to realFetch and are NOT captured.
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/rpc/31337")) {
        const bodyText = typeof init?.body === "string" ? init.body : "";
        try {
          const parsed = JSON.parse(bodyText);
          for (const r of Array.isArray(parsed) ? parsed : [parsed]) {
            if (r?.method) rpcMethods.push(r.method);
          }
        } catch {
          /* ignore */
        }
        const req = new Request("http://localhost:3000/api/rpc/31337", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: bodyText,
        });
        return mods.rpcRoute.POST(req, { params: Promise.resolve({ chain: "31337" }) });
      }
      return realFetch(input, init);
    });

    // Inject the test wallet's anvil signer so the mocked withEvmSigner yields it.
    signerHolder.current = testAccount;
  }, 120_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    if (deployment) await deployment.stop();
    // Restore config/contracts.ts to its committed (placeholder) state so the
    // emitted anvil address never pollutes git.
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

  it("governance/distributor are registered on the local chain (emitted)", () => {
    expect(mods.contracts.governanceAvailable(31337)).toBe(true);
    expect(mods.contracts.distributorAvailable(31337)).toBe(true);
    expect(mods.contracts.contractEntry(31337).governance).toBeDefined();
    expect(mods.contracts.contractEntry(31337).distributor).toBeDefined();
  });

  it("propose (signalling) -> castVote(For) -> tally reflects the vote; embedded raw broadcast only", async () => {
    const wallet = getAddress(testAccount.address);
    const { VOTE } = mods.governanceAbiMod;

    // Resolve the test wallet's passport tokenId (via readPassportStatus).
    const status = await mods.passportClient.readPassportStatus(31337, wallet);
    expect(status.isCitizen).toBe(true);
    expect(status.tokenId).toBeDefined();
    const tokenId = status.tokenId as bigint;

    rpcMethods.length = 0;

    // Create a pure off-chain-content (signalling) proposal through the APP path.
    const descriptionHash = keccak256(toHex("Wave 7 anvil signalling proposal"));
    const { proposalId } = await mods.governanceWrite.proposeEmbedded(
      31337,
      "0x0000000000000000000000000000000000000000",
      0n,
      "0x",
      descriptionHash,
    );
    expect(proposalId).toBeGreaterThanOrEqual(0n);

    // Fresh proposal is Active with an all-zero tally.
    const beforeVote = await mods.governanceClient.readProposal(31337, proposalId);
    expect(beforeVote.state).toBe("Active");
    expect(beforeVote.tally.forVotes).toBe(0n);
    expect(beforeVote.tally.againstVotes).toBe(0n);
    expect(beforeVote.tally.abstainVotes).toBe(0n);

    // Cast a FOR vote keyed by the passport tokenId (weight 1).
    await mods.governanceWrite.castVoteEmbedded(31337, proposalId, tokenId, VOTE.For);

    // The tally reflects exactly one FOR vote; readMyVote confirms it.
    const afterVote = await mods.governanceClient.readProposal(31337, proposalId);
    expect(afterVote.tally.forVotes).toBe(1n);
    expect(afterVote.tally.againstVotes).toBe(0n);
    const myVote = await mods.governanceClient.readMyVote(31337, proposalId, tokenId);
    expect(myVote).toBe(VOTE.For);

    assertNoServerSigning();
  }, 120_000);

  it("openEpoch -> claimable > 0 -> claim -> balance up by perCitizen; second claim reverts", async () => {
    const wallet = getAddress(testAccount.address);
    const cryptAddr = mods.contracts.contractEntry(31337).token as Address;

    const status = await mods.passportClient.readPassportStatus(31337, wallet);
    const tokenId = status.tokenId as bigint;

    // Open a dividend epoch funded from treasury genesis (admin has FUNDER_ROLE).
    deployment.openDividendEpoch(EPOCH_AMOUNT);

    const epochId = await mods.dividendsClient.readCurrentEpoch(31337);
    expect(epochId).toBe(1n);
    const epoch = await mods.dividendsClient.readEpoch(31337, epochId);
    expect(epoch.open).toBe(true);
    expect(epoch.snapshotCitizens).toBe(3n);
    expect(epoch.perCitizen).toBeGreaterThan(0n);

    // The test wallet's passport is claimable for a non-zero amount.
    const claimable = await mods.dividendsClient.readClaimable(31337, epochId, tokenId);
    expect(claimable).toBeGreaterThan(0n);
    expect(claimable).toBe(epoch.perCitizen);

    const balBefore = await directCryptBalance(cryptAddr, wallet);
    rpcMethods.length = 0;

    // Claim through the APP path.
    const hash = await mods.dividendsWrite.claimDividendEmbedded(31337, epochId, tokenId);
    expect(hash).toMatch(/^0x[0-9a-fA-F]{64}$/);

    // claimed flag flips; balance up by exactly perCitizen.
    const claimed = await mods.dividendsClient.readClaimed(31337, epochId, tokenId);
    expect(claimed).toBe(true);
    const balAfter = await directCryptBalance(cryptAddr, wallet);
    expect(balAfter - balBefore).toBe(epoch.perCitizen);

    // A SECOND claim reverts (AlreadyClaimed) — no double-claim. writeEmbedded
    // throws when the on-chain simulate rejects.
    await expect(
      mods.dividendsWrite.claimDividendEmbedded(31337, epochId, tokenId),
    ).rejects.toThrow();

    assertNoServerSigning();
  }, 120_000);
});
