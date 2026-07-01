// @vitest-environment node
//
// LOCAL ANVIL ONLY — the load-bearing end-to-end validation of Wave 6 (wallet
// screen writes). Runs the REAL frozen contracts on a REAL (local) anvil chain
// and drives the wallet's STAKE and SEND paths through the APP's OWN service code:
//   deploy -> fund the test wallet + reward pool from treasury genesis ->
//   readStakePosition/readCryptAllowance (0) -> approveCryptEmbedded (exact) ->
//   stakeEmbedded -> readback (staked up, TVL up) -> time-travel -> earned > 0;
//   then previewEvmSend + toSendConfirmVM ($CRYPT resolves to "CRYPT") ->
//   sendEvm -> receipt success -> recipient $CRYPT balance up.
//
// Runs with CHAIN_ENV=local so publicClientFor(31337) / evmEntry(31337) /
// serverRpcUrl(31337) resolve the app's REAL read/broadcast path. Browser fetches
// to `/api/rpc/31337` are dispatched IN-PROCESS to the real proxy route handler,
// and every JSON-RPC method is captured so we assert `eth_sendTransaction` /
// `personal_sign` / `eth_sign` / `eth_accounts` are NEVER used on the embedded
// path — only `eth_sendRawTransaction`.
//
// anvil-only cheatcodes (evm_increaseTime / evm_mine) go through a DIRECT anvil
// client, NOT the allowlisted /api/rpc proxy (which rejects them — finding #4).

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// MUST be set before any app module is imported so CHAIN_ENV resolves to local.
process.env.NEXT_PUBLIC_CHAIN_ENV = "local";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
process.env.RPC_ANVIL = "http://127.0.0.1:8545";

import {
  createPublicClient,
  createTestClient,
  erc20Abi,
  getAddress,
  http,
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

// anvil default key #8 (LOCAL/THROWAWAY dev key) — the test wallet.
const WALLET_PK = "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97" as Hex;
const testAccount = privateKeyToAccount(WALLET_PK);
// anvil default account #1 — the $CRYPT send recipient.
const RECIPIENT = getAddress("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");

// Explicit, independently-sufficient amounts (no shared-N double-spend, finding #3).
const STAKE = 1_000n * 10n ** 18n;
const SEND = 5n * 10n ** 18n;
const REWARD = 10_000n * 10n ** 18n;

const HAVE_FOUNDRY = foundryAvailable();
const d = HAVE_FOUNDRY ? describe : describe.skip;

type AppMods = {
  staking: typeof import("@/lib/wallet/services/staking");
  send: typeof import("@/lib/wallet/services/send");
  sendView: typeof import("@/lib/wallet/services/sendView");
  contracts: typeof import("@/config/contracts");
  rpcRoute: typeof import("@/app/api/rpc/[chain]/route");
};

let deployment: AnvilDeployment;
let mods: AppMods;
const rpcMethods: string[] = [];

// Direct anvil clients for out-of-band setup/assertions (NOT the app path).
const directClient = createPublicClient({
  chain: foundry,
  transport: http("http://127.0.0.1:8545"),
});
const testClient = createTestClient({
  chain: foundry,
  mode: "anvil",
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

d("Wave 6 wallet — stake + $CRYPT send on local anvil", () => {
  beforeAll(async () => {
    deployment = await startAnvilWithContracts([]);

    // Fund the test wallet (STAKE + SEND) and the reward pool (REWARD) from the
    // treasury genesis supply — separate draws so neither starves the other.
    deployment.fundCryptAndRewards(getAddress(testAccount.address), STAKE + SEND, REWARD);

    // Fresh module graph so config/contracts.ts (just emitted) is re-read.
    vi.resetModules();
    mods = {
      staking: await import("@/lib/wallet/services/staking"),
      send: await import("@/lib/wallet/services/send"),
      sendView: await import("@/lib/wallet/services/sendView"),
      contracts: await import("@/config/contracts"),
      rpcRoute: await import("@/app/api/rpc/[chain]/route"),
    };

    // Route the app's browser fetch to `/api/rpc/31337` IN-PROCESS to the REAL
    // proxy route handler (which forwards to anvil). Capture every JSON-RPC
    // method so we can assert no eth_sendTransaction. Direct anvil calls (the
    // test/public clients above) fall through to realFetch and are NOT captured.
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

  it("staking is registered on the local chain (token + staking emitted)", () => {
    expect(mods.staking.stakingAvailable(31337)).toBe(true);
    expect(mods.contracts.contractEntry(31337).token).toBeDefined();
    expect(mods.contracts.contractEntry(31337).staking).toBeDefined();
  });

  it("approve (exact) -> stake -> readback -> accrue; embedded path uses raw broadcast only", async () => {
    const wallet = getAddress(testAccount.address);

    // 1. Baseline: nothing staked, no allowance.
    const before = await mods.staking.readStakePosition(31337, wallet);
    expect(before.staked).toBe(0n);
    expect(await mods.staking.readCryptAllowance(31337, wallet)).toBe(0n);

    rpcMethods.length = 0;

    // 2. Approve the EXACT stake amount; allowance now covers it.
    await mods.staking.approveCryptEmbedded(31337, STAKE);
    expect(await mods.staking.readCryptAllowance(31337, wallet)).toBeGreaterThanOrEqual(STAKE);

    // 3. Stake (approve fully confirmed first — writeEmbedded awaits the receipt,
    //    so stake's on-chain simulate sees a fresh allowance; TOCTOU-safe).
    await mods.staking.stakeEmbedded(31337, STAKE);
    const after = await mods.staking.readStakePosition(31337, wallet);
    expect(after.staked).toBe(STAKE);
    expect(after.totalStaked).toBeGreaterThanOrEqual(STAKE);

    // 4. Advance time via a DIRECT anvil client (evm_increaseTime is NOT allowlisted
    //    — it must never touch the /api/rpc proxy, finding #4), then assert earned > 0.
    await testClient.increaseTime({ seconds: 365 * 24 * 60 * 60 });
    await testClient.mine({ blocks: 1 });
    const accrued = await mods.staking.readStakePosition(31337, wallet);
    expect(accrued.earned).toBeGreaterThan(0n);

    // 5. The embedded write path broadcast a RAW tx and NEVER signed server-side.
    expect(rpcMethods).toContain("eth_sendRawTransaction");
    expect(rpcMethods).not.toContain("eth_sendTransaction");
    expect(rpcMethods).not.toContain("personal_sign");
    expect(rpcMethods).not.toContain("eth_sign");
    expect(rpcMethods).not.toContain("eth_accounts");
    // The cheatcodes never reached the app proxy.
    expect(rpcMethods).not.toContain("evm_increaseTime");
    expect(rpcMethods).not.toContain("evm_mine");
  }, 120_000);

  it("sends $CRYPT (resolved via sendableTokens/contractEntry, not tokens.ts); confirm renders CRYPT", async () => {
    const wallet = getAddress(testAccount.address);
    const cryptAddr = mods.contracts.contractEntry(31337).token as Address;
    expect(cryptAddr).toBeDefined();

    // The confirm VM resolves $CRYPT end-to-end — the regression proof for
    // findings #1/#2 ($CRYPT lives in contractEntry.token, not config/tokens.ts).
    const preview = await mods.send.previewEvmSend(
      { chainId: 31337, to: RECIPIENT, amount: SEND, token: cryptAddr },
      wallet,
    );
    const vm = mods.sendView.toSendConfirmVM(preview);
    expect(vm.tokenSymbol).toBe("CRYPT");
    expect(vm.amountDisplay).toBe("5"); // formatted human units, not raw wei

    const balBefore = await directCryptBalance(cryptAddr, RECIPIENT);
    rpcMethods.length = 0;

    const hash = await mods.send.sendEvm({
      chainId: 31337,
      to: RECIPIENT,
      amount: SEND,
      token: cryptAddr,
    });
    expect(hash).toMatch(/^0x[0-9a-fA-F]{64}$/);

    const receipt = await directClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");

    const balAfter = await directCryptBalance(cryptAddr, RECIPIENT);
    expect(balAfter - balBefore).toBe(SEND);

    expect(rpcMethods).toContain("eth_sendRawTransaction");
    expect(rpcMethods).not.toContain("eth_sendTransaction");
  }, 120_000);
});
