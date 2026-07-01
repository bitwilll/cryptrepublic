# CryptRepublic Wave 6 — Wallet & Chain Screen — Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL — before executing any task below, invoke `superpowers:test-driven-development` and `superpowers:executing-plans`. Every task is TDD: write the failing test first, then the implementation, then confirm green. Do NOT skip the RED step. Keep ALL prior tests green (206 app + 165 forge + integration).

## Goal

Ship the full **Wallet & Chain** dashboard screen on REAL chain data: native + `$CRYPT` + `WETH`/`WBTC`/`USDC` balances with a portfolio total, the passport SBT card, `SEND` / `RECEIVE(QR)` / `SWAP` / `STAKE` / `BRIDGE` actions, on-chain tx history, staking against `CryptStaking` (approve → stake / unstake / claim), a clearly-labeled TESTNET-MOCK swap/bridge, and honest live chain stats. Every send and every contract write shows an explicit human-readable confirm before signing. The build is validated end-to-end on **local anvil only**.

## Architecture

- **Screen route:** `app/dashboard/wallet/page.tsx` (Server Component shell) mounts `<WalletChainApp/>` (client island) inside the dashboard shell + session guard. This follows spec §7.7 (wallet ≠ citizenship — a logged-in non-citizen may use the wallet). The existing `app/wallet/page.tsx` (the minimal Wave 3 exerciser) stays as-is; Wave 6 adds the full screen under `/dashboard/wallet` so it inherits the sidebar + session guard.
- **Reads** (balances, staking positions, chain stats) route through `publicClientFor(chainId)` → `/api/rpc/<chainId>` (CSP-safe, already built). History routes through `/api/history/<chainId>`.
- **Writes** (SEND, APPROVE, STAKE, UNSTAKE, CLAIM) are USER-signed and non-custodial. EMBEDDED path: `simulateContract` dry-run → `account.signTransaction({type:"eip1559"})` → `client.sendRawTransaction` (the `send.ts` / `mint.ts` pattern). EXTERNAL path: wagmi `writeContract`. NEVER `eth_sendTransaction` on embedded (the proxy allowlist rejects it).
- **Passport** SBT read via `lib/passport/client.ts` (`readPassportStatus`); rendered as a distinct non-transferable card with NO send affordance.
- **Swap/Bridge** reuse `lib/wallet/services/swap.ts` (quote-only mock) verbatim behind a labeled banner. No execution path added.

## Tech Stack

Next.js 15 App Router + TypeScript strict (no `any`, unused vars prefixed `_`), viem, wagmi, `@tanstack/react-query`, the existing government-issue design system (`styles/tokens.css` + `components/ui/*`), Vitest (unit + `vitest.integration.config.ts` for anvil), Playwright (`e2e/`), Foundry (local anvil). Package manager: **pnpm**. Prettier enforced. Per-task commits with a `Co-Authored-By` trailer.

---

## Global Constraints

Copy these locked decisions into your working memory; they override any convenience shortcut.

1. **Non-custodial, server never signs / never holds keys.** No `PRIVATE_KEY`/`MNEMONIC` in env. Embedded seeds live only in the browser (`lib/wallet/embedded/session.ts`).
2. **No `eth_sendTransaction` on embedded.** All embedded writes = `simulateContract` dry-run → `withEvmSigner` → `account.signTransaction({...type:"eip1559"})` → `client.sendRawTransaction`. The RPC allowlist (`lib/rpc/allowlist.ts`) rejects `eth_sendTransaction`; never invent a new signing path; never call `personal_sign`/`eth_sign`/`eth_accounts` on the embedded path. EXTERNAL writes = wagmi `writeContract` (the only legitimate `writeContract` caller).
3. **Explicit human-readable confirm before EVERY send AND every contract write.** SEND / APPROVE / STAKE / UNSTAKE / CLAIM each show to/spender + amount + token + chain + fee (formatted with `formatUnits` + correct decimals + checksummed address + chain name), never raw base-unit strings. Validate + checksum the recipient (`getAddress`) before enabling confirm.
4. **Swap/Bridge = TESTNET-MOCK only.** Reuse `getSwapQuote` verbatim; render behind an explicit "TESTNET MOCK / SIMULATED" banner. NO execution path in Wave 6. `getSwapQuote` throws on mainnet by design.
5. **Approve exact amount.** Read `allowance(user, staking)` first; SKIP approve when it already covers the amount; approve the EXACT `amount` (never `type(uint256).max`). Max-approve only as an explicit, disclosed opt-in — never the default. Approve is a distinct confirm (spender = staking, exact amount).
6. **CryptStaking has NO `staked()`/`APR()`/`getStake()` getters.** Read `stakes(address).amount` (struct field 0 = principal), `earned(address)` (view = pending rewards), `aprBps()` (uint16 BASIS POINTS, GLOBAL — divide by 100 to display %), `totalStaked()` (TVL), `rewardPoolRemaining()` (reward budget). `claim()` payout is CAPPED at `rewardPoolRemaining` — the confirm UI must NOT promise the full `earned` figure; label the payout "up to earned, capped by the reward pool".
7. **`$CRYPT` ALWAYS resolves from `config/contracts.ts` `token`** (symbol `"CRYPT"`, 18 decimals), NOT `config/tokens.ts` (where `CRYPT` is a placeholder with `address: undefined`). This applies to EVERY consumer — portfolio, staking approve/stake, **AND send/confirm + the SEND token picker** (a common trap: `tokensForChain` alone omits $CRYPT, so send/confirm silently throws or drops it). Anywhere send needs token metadata, resolve through the union helper `sendableTokens(chainId)` (Task 4) = `tokensForChain(chainId)` + the registered `$CRYPT` entry from `contractEntry(chainId).token`. Gate the STAKE affordance OFF when `token` or `staking` is unregistered on the active chain.
8. **Nothing hardcodes an address.** Add a `staking?` field + a throwing `stakingAddress(chainId)` accessor to `config/contracts.ts` (mirroring `passportAddress`); extend `scripts/emit-contract-addresses.mjs` to also write the staking address from the Foundry broadcast.
9. **Portfolio total sums ONLY resolvable tokens** — never `NaN`. Base Sepolia has `WBTC` + `$CRYPT` undefined; handle gracefully.
10. **Chain-stats honesty.** Derive `chainId` / block number / gas (`estimateFeesPerGas`) / explorer URL from the active viem client (`useChainInfo` / `evmEntry`). The mockup's validators / TPS / finality / "chain 7331" are FABRICATED — OMIT them or render behind an explicit "representative" marker; never present a hardcoded validator count/TPS as live.
11. **Passport row is a DISTINCT component** (not a generic `AssetRow` with a disabled prop). Never pass the passport into the SendModal token list (soulbound).
12. **LOCAL-ANVIL-ONLY boundary.** Build + validate on local anvil (31337 → 127.0.0.1:8545). Never deploy to or transact on a real network; never hold/request a real key.
13. **Reuse existing infra verbatim.** The balance layer, `/api/rpc` + `/api/history` proxies, `send.ts`, `swap.ts`, `receive.ts`, `evmClients.ts`, and the anvil default profile already exist and are correct. READ the actual files and match exact signatures — do not re-derive them.
14. **Graceful degradation on an unregistered chain (CHAIN_ENV honesty).** On the default testnet env, `passportAddress(84532)` / `stakingAddress(84532)` / `contractEntry(84532).token` are unregistered placeholders and their throwing accessors WILL throw. Every card that touches one — `PassportAssetCard`, `StakePanel`, and the `$CRYPT` SEND entry — MUST catch the "not deployed / unregistered" throw and render a graceful empty/unavailable state, NEVER crash the screen. (Prefer the non-throwing probes where they exist: `stakingAvailable(chainId)`; guard passport/token reads in a try/catch.)
15. **Representative-price disclaimer is RENDERED, not just a code comment.** `REPRESENTATIVE_PRICES.CRYPT = 1` (and every other static price) feeds a real-looking `$` portfolio total. A visible "Representative prices — not a live oracle" disclaimer MUST appear in the actual UI next to the total (and near per-token prices), asserted by a test. A code comment alone does NOT satisfy this.

---

## File Structure

```
app/
  dashboard/
    wallet/
      page.tsx                         # NEW — Server shell → <WalletChainApp/>
config/
  contracts.ts                         # EDIT — add staking? + stakingAddress()
lib/
  wallet/
    services/
      portfolio.ts                     # NEW — balances aggregator + USD total
      portfolio.test.ts                # NEW
      staking.ts                       # NEW — read + approve/stake/unstake/claim builders
      staking.test.ts                  # NEW
      sendView.ts                      # NEW — send-confirm view model (formatting)
      sendView.test.ts                 # NEW
      chainStats.ts                    # NEW — honest chain-stats reader
      chainStats.test.ts               # NEW
    stakingAbi.ts                      # NEW — CryptStaking + ERC20 approve/allowance ABI (parseAbi)
components/
  wallet/
    WalletChainApp.tsx                 # NEW — screen orchestrator (client)
    WalletChainApp.test.tsx            # NEW
    PortfolioHeader.tsx                # NEW — hero: total + address(copy) + action buttons
    TokenList.tsx                      # NEW — AssetRow list (resolvable tokens)
    PassportAssetCard.tsx              # NEW — distinct SBT card, non-transferable, no send
    ChainStatsPanel.tsx               # NEW — honest live stats
    StakePanel.tsx                     # NEW — staked/earned/APR + approve→stake/unstake/claim
    SendModal.tsx                      # NEW — explicit confirm
    ReceiveModal.tsx                   # NEW — address + QR + copy
    SwapBridgeModal.tsx                # NEW — labeled TESTNET-MOCK
    ActivityLedger.tsx                 # NEW — tx history log
scripts/
  emit-contract-addresses.mjs          # EDIT — also emit staking address
test/
  integration/
    anvil-harness.ts                   # EDIT — emit staking, fund $CRYPT + rewards, expose staking/admin
    wallet-e2e.test.ts                 # NEW — approve→stake→readback + token SEND, assert no eth_sendTransaction
e2e/
  wallet-screen.spec.ts                # NEW — screen states (loading/empty/populated, locked/unlocked, receive QR, send-confirm, mock banner)
```

---

### Task 1 — `config/contracts.ts`: add `staking` + `stakingAddress()`; extend emit script

**Files:**
- EDIT `config/contracts.ts`
- EDIT `scripts/emit-contract-addresses.mjs`
- Test: extend `config/contracts.test.ts` (create if absent) — assert `stakingAddress` throws when unregistered and returns the address when set.

**Interfaces (exact):**
```ts
export interface ContractEntry {
  passport?: `0x${string}`;
  token?: `0x${string}`;
  staking?: `0x${string}`; // NEW
}
export function stakingAddress(chainId: number): `0x${string}`; // throws if unregistered
```

**TDD steps:**

1. [ ] RED — add `config/contracts.test.ts`:
   ```ts
   import { describe, it, expect } from "vitest";
   import { stakingAddress, contractEntry } from "@/config/contracts";

   describe("stakingAddress", () => {
     it("throws when staking is unregistered on a chain", () => {
       expect(() => stakingAddress(31337)).toThrow(/staking/i);
     });
     it("contractEntry returns {} for unknown chains", () => {
       expect(contractEntry(99999)).toEqual({});
     });
   });
   ```
2. [ ] GREEN — in `config/contracts.ts` add the `staking?` field to `ContractEntry` and the accessor mirroring `passportAddress` EXACTLY:
   ```ts
   export function stakingAddress(chainId: number): `0x${string}` {
     const addr = contractEntry(chainId).staking;
     if (!addr) {
       throw new Error(`Staking not deployed on chain ${chainId}`);
     }
     return addr;
   }
   ```
3. [ ] Extend `scripts/emit-contract-addresses.mjs` — READ the current file first; it already does `findAddress("CryptRepublicPassport")` + `findAddress("CryptToken")`. Add `const staking = findAddress("CryptStaking");` and push `staking: "${staking}"` into `entryFields` when present (mirror the existing `if (token) entryFields.push(...)` block). Add a `console.log` line for staking. Do NOT change the single-line-replace regex logic.
4. [ ] Run `pnpm test config/contracts.test.ts` — green. Manually eyeball the emit script diff (its correctness is proven by Task 9's integration run).

---

### Task 2 — Staking ABI + read/write helper lib

**Files:**
- NEW `lib/wallet/stakingAbi.ts`
- NEW `lib/wallet/services/staking.ts`
- NEW `lib/wallet/services/staking.test.ts`

READ FIRST: `contracts/src/CryptStaking.sol`, `lib/wallet/services/send.ts`, `lib/passport/mint.ts` (the embedded simulate→sign→sendRaw pattern), `lib/wallet/embedded/session.ts` (`withEvmSigner`), `config/contracts.ts` (`stakingAddress`), `config/tokens.ts` note. Match the on-chain signatures byte-for-byte from `CryptStaking.sol`.

**`lib/wallet/stakingAbi.ts` (exact — from CryptStaking.sol + ERC20):**
```ts
import { parseAbi } from "viem";

/** FROZEN — byte-matches contracts/src/CryptStaking.sol external surface. */
export const stakingAbi = parseAbi([
  "function stake(uint256 amount)",
  "function unstake(uint256 amount)",
  "function claim()",
  "function stakes(address) view returns (uint256 amount, uint256 rewardAccrued, uint256 userRewardPerTokenPaid)",
  "function earned(address user) view returns (uint256)",
  "function aprBps() view returns (uint16)",
  "function totalStaked() view returns (uint256)",
  "function rewardPoolRemaining() view returns (uint256)",
]);

/** ERC-20 approve/allowance (for $CRYPT → staking). */
export const erc20ApproveAbi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);
```

**Interfaces (exact — `lib/wallet/services/staking.ts`):**
```ts
export interface StakePosition {
  staked: bigint;        // stakes(user).amount
  earned: bigint;        // earned(user) — CAPPED by rewardPoolRemaining on claim
  aprBps: number;        // aprBps() (global, basis points) — display = aprBps/100 %
  totalStaked: bigint;   // TVL
  rewardPoolRemaining: bigint;
}

/** All reads for the stake panel, from config/contracts.ts token+staking. Returns null when unregistered. */
export function readStakePosition(chainId: number, user: `0x${string}`): Promise<StakePosition>;

/** Current $CRYPT allowance the user has granted the staking contract. */
export function readCryptAllowance(chainId: number, owner: `0x${string}`): Promise<bigint>;

/** True when the STAKE affordance is available (token + staking both registered on chain). */
export function stakingAvailable(chainId: number): boolean;

/** EMBEDDED approve of EXACTLY `amount` $CRYPT to the staking contract. Returns tx hash. */
export function approveCryptEmbedded(chainId: number, amount: bigint): Promise<`0x${string}`>;

/** EMBEDDED stake/unstake/claim. Each: simulate → sign eip1559 → sendRawTransaction. */
export function stakeEmbedded(chainId: number, amount: bigint): Promise<`0x${string}`>;
export function unstakeEmbedded(chainId: number, amount: bigint): Promise<`0x${string}`>;
export function claimEmbedded(chainId: number): Promise<`0x${string}`>;
```

Implementation note: `$CRYPT` address comes from `contractEntry(chainId).token` (NOT `tokensForChain`); staking address from `stakingAddress(chainId)`. `readStakePosition` reads `stakes`, `earned`, `aprBps`, `totalStaked`, `rewardPoolRemaining` in parallel; `stakes` returns a tuple — take `[0]` for `staked`.

The embedded writers MUST reuse the `mint.ts` embedded pattern EXACTLY — INCLUDING the post-broadcast receipt wait + revert check (finding #5). `mint.ts` awaits `waitForTransactionReceipt` and throws when `receipt.status !== "success"`; `writeEmbedded` MUST do the same so approve/stake/unstake/claim only "succeed" after CONFIRMATION, never on a reverted-but-broadcast tx. Factor a shared private helper:
```ts
async function writeEmbedded(
  chainId: number,
  to: `0x${string}`,
  abi: typeof stakingAbi | typeof erc20ApproveAbi,
  functionName: string,
  args: readonly unknown[],
): Promise<`0x${string}`> {
  const client = publicClientFor(chainId);
  const data = encodeFunctionData({ abi, functionName, args } as never);
  return withEvmSigner(async (account: Account) => {
    await client.simulateContract({ account, address: to, abi, functionName, args } as never); // dry-run ONLY
    const [nonce, fees] = await Promise.all([
      client.getTransactionCount({ address: account.address, blockTag: "pending" }),
      client.estimateFeesPerGas(),
    ]);
    const gas = await client.estimateGas({ account: account.address, to, value: 0n, data });
    if (!account.signTransaction) throw new Error("Signer cannot sign transactions.");
    const serializedTransaction = await account.signTransaction({
      chainId, nonce, to, value: 0n, data, gas,
      maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      type: "eip1559",
    });
    const txHash = await client.sendRawTransaction({ serializedTransaction });
    // Post-broadcast confirmation — MATCHES mint.ts. Do NOT drop this: a reverted
    // tx still broadcasts, and returning its hash as "success" is a correctness bug.
    const receipt = await client.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      throw new Error(`${functionName} transaction reverted.`);
    }
    return txHash;
  });
}
```
`approveCryptEmbedded` → `writeEmbedded(chainId, token, erc20ApproveAbi, "approve", [stakingAddress(chainId), amount])`. `stakeEmbedded`/`unstakeEmbedded` → `stakingAbi, "stake"|"unstake", [amount]`. `claimEmbedded` → `stakingAbi, "claim", []`.

**TDD steps:**

1. [ ] RED — `staking.test.ts` mocks the RPC transport (mock `@/lib/wallet/services/evmClients` `publicClientFor` and `@/lib/wallet/embedded/session` `withEvmSigner`, mirroring `send.test.ts` — READ `send.test.ts` for the exact mock shape). Assert:
   - `readStakePosition` maps the 5 reads into `StakePosition` (tuple `[0]` → `staked`).
   - `stakingAvailable` is `false` when `token` or `staking` is unregistered, `true` when both set.
   - The embedded approve→stake→claim path records ONLY `eth_call` (simulate) / `eth_estimateGas` / `eth_getTransactionCount` / `eth_sendRawTransaction` and NEVER `eth_sendTransaction` / `personal_sign` / `eth_sign` / `eth_accounts`. (Capture methods via the mocked transport, mirroring the `mint-e2e` capture assertions.)
   - `approveCryptEmbedded` encodes `approve(stakingAddress, amount)` with the EXACT `amount` (decode the calldata and assert the amount arg — never `2n**256n-1n`).
   - **Receipt gating (finding #5):** each embedded writer awaits `waitForTransactionReceipt` AFTER `sendRawTransaction`; when the mocked receipt has `status: "reverted"`, the writer THROWS (does not return the hash); when `status: "success"`, it returns the hash. Assert `waitForTransactionReceipt` is invoked with the broadcast hash.
2. [ ] GREEN — implement `stakingAbi.ts` then `staking.ts`.
3. [ ] `pnpm test lib/wallet/services/staking.test.ts` — green.

---

### Task 3 — Portfolio / balances aggregator

**Files:**
- NEW `lib/wallet/services/portfolio.ts`
- NEW `lib/wallet/services/portfolio.test.ts`

READ FIRST: `lib/wallet/services/balances.ts` (`evmBalances`, `Balance`), `config/tokens.ts`, `config/contracts.ts` (`token`).

**Interfaces (exact):**
```ts
import type { Balance } from "./balances";

export interface PricedAsset extends Balance {
  /** USD unit price (representative/static in Wave 6 — no live oracle). undefined = no price. */
  usdPrice?: number;
  /** balance × price; undefined when price is unknown. */
  usdValue?: number;
}

export interface Portfolio {
  assets: PricedAsset[];
  /** Sum of usdValue over assets that HAVE a price. Never NaN. */
  totalUsd: number;
}

/**
 * Reads native + registry ERC-20 balances (via evmBalances), attaches a
 * representative USD price per symbol, and sums resolvable values. $CRYPT is
 * additionally read from config/contracts.ts `token` when tokensForChain omits it
 * (placeholder). Tokens with no on-chain address are already skipped by evmBalances.
 */
export function loadPortfolio(chainId: number, owner: `0x${string}`): Promise<Portfolio>;

/** Representative static prices by symbol (clearly not a live oracle). */
export const REPRESENTATIVE_PRICES: Record<string, number>;
```

Implementation notes:
- Reuse `evmBalances(chainId, owner)` — do NOT re-fetch balances. It already skips undefined-address tokens.
- `$CRYPT`: `config/tokens.ts` has it as a placeholder (`address: undefined`), so `evmBalances` skips it. If `contractEntry(chainId).token` is defined, read its `balanceOf` via `publicClientFor` and append a `CRYPT` `Balance` (18 decimals). If undefined, omit `$CRYPT` (never NaN).
- `REPRESENTATIVE_PRICES` = `{ ETH: 3240, WETH: 3240, WBTC: 64880, BTC: 64880, USDC: 1, CRYPT: 1, SOL: 0 }` — mark in a comment these are representative, not live. NOTE: the code comment is NOT sufficient on its own — because `CRYPT: 1` (and the others) feed a real-looking `$` total, a VISIBLE disclaimer must render in the UI (Task 6, finding #8/#15). The service just supplies the numbers; the header renders the honesty label.
- `usdValue = Number(formatUnits(raw, decimals)) * usdPrice` only when `usdPrice` is defined; else leave both undefined.
- `totalUsd = assets.reduce((s,a) => s + (a.usdValue ?? 0), 0)`.

**TDD steps:**

1. [ ] RED — `portfolio.test.ts`: mock `evmBalances` to return `[native ETH, USDC]` and mock `publicClientFor` for the `$CRYPT` read. Assert: `totalUsd` sums only priced assets; a token with no `usdPrice` contributes 0 (never NaN); `$CRYPT` appended when `token` registered and omitted when not; result is deterministic.
2. [ ] GREEN — implement.
3. [ ] `pnpm test lib/wallet/services/portfolio.test.ts` — green.

---

### Task 4 — Send-confirm view model

**Files:**
- NEW `lib/wallet/services/sendView.ts`
- NEW `lib/wallet/services/sendView.test.ts`

READ FIRST: `lib/wallet/services/send.ts` (`SendPreview`, `previewEvmSend` — returns RAW base-unit strings + `token: "native" | <address>` + `feeEstimate` in wei), `config/tokens.ts` (`tokensForChain`, `TokenEntry`), `config/contracts.ts` (`contractEntry(chainId).token` — where $CRYPT actually lives), `config/chains.config.ts` (`evmEntry` for chain name via `viemChain.name`).

> ROOT-CAUSE FIX (findings #1, #2, #7). `$CRYPT` lives in `config/contracts.ts.token`, NOT `config/tokens.ts`, so any send code that resolves ERC-20 metadata from `tokensForChain` ALONE will THROW for $CRYPT ("token not found") — even though $CRYPT SEND is in Wave 6 scope (integration Test B sends it). Fix at the source: this task adds a `sendableTokens(chainId)` union helper that MUST be the single source of sendable-token metadata for the whole SEND flow — the send-confirm view model here (Task 4) AND the SendModal token picker (Task 8).

**Interfaces (exact):**
```ts
import type { SendPreview } from "./send";
import type { TokenEntry } from "@/config/tokens";

export interface SendConfirmVM {
  to: `0x${string}`;         // checksummed
  chainName: string;         // viemChain.name via evmEntry
  chainId: number;
  tokenSymbol: string;       // "ETH"/native symbol or the resolved ERC-20 symbol
  amountDisplay: string;     // formatUnits(raw, decimals) — human units
  feeDisplay: string;        // formatUnits(feeWei, 18) native units
  feeSymbol: string;         // native currency symbol
}

/**
 * The COMPLETE sendable ERC-20 set for a chain: tokensForChain(chainId) UNIONed
 * with the registered $CRYPT entry from contractEntry(chainId).token (symbol
 * "CRYPT", 18 decimals). $CRYPT is appended ONLY when `token` is set (never a
 * placeholder with address undefined), and de-duped against any CRYPT placeholder
 * already in tokensForChain. Use this EVERYWHERE the send flow needs token
 * metadata — Task 4 (this VM) and Task 8 (the picker).
 */
export function sendableTokens(chainId: number): readonly TokenEntry[];

/** Turn a raw SendPreview into a human-readable confirm view model. Throws on a bad recipient. */
export function toSendConfirmVM(preview: SendPreview): SendConfirmVM;
```

Implementation notes:
- `sendableTokens(chainId)`: start from `tokensForChain(chainId).filter((t) => t.address !== undefined)` (drop the address-less CRYPT placeholder). If `contractEntry(chainId).token` is set, append `{ symbol: "CRYPT", decimals: 18, address: contractEntry(chainId).token }`. If `contractEntry(chainId).token` is unset (unregistered chain), simply omit $CRYPT — do NOT let the throwing `stakingAddress`-style accessor throw here; read the non-throwing `contractEntry(...).token` directly (finding #14 graceful degradation). De-dupe by lowercased address.
- `toSendConfirmVM` token resolution: if `preview.token === "native"`, use `evmEntry(chainId).viemChain.nativeCurrency` (symbol + decimals). Else find the token in **`sendableTokens(chainId)`** (NOT `tokensForChain` alone) by address (case-insensitive) → its `symbol`+`decimals`. This is what makes the confirm render for $CRYPT. Throw a clear error if still not found.
- `to`: `getAddress(preview.to)` (throws on invalid checksum/format) — this is the checksum guard the confirm UI relies on.
- `amountDisplay = formatUnits(BigInt(preview.amount), decimals)`; `feeDisplay = formatUnits(BigInt(preview.feeEstimate), 18)`; `feeSymbol` = native symbol.

**TDD steps:**

1. [ ] RED — `sendView.test.ts`: for a native `SendPreview` (`token:"native"`, `amount:"1000000000000000000"`, `feeEstimate:"210000000000000"`) assert `amountDisplay==="1"`, `feeDisplay` formatted, `tokenSymbol` = native. For a USDC preview (address, 6 decimals, `amount:"1000000"`) assert `amountDisplay==="1"`, `tokenSymbol==="USDC"`. **For a $CRYPT preview (address = a mocked `contractEntry(chainId).token`, 18 decimals) assert `toSendConfirmVM` resolves `tokenSymbol==="CRYPT"` and does NOT throw** — the regression guard for findings #1/#7. Assert `sendableTokens(chainId)` INCLUDES a `CRYPT` entry when `contractEntry(chainId).token` is mocked-set and OMITS it when unset (no throw). Assert an invalid `to` throws; assert `to` is returned checksummed.
2. [ ] GREEN — implement `sendableTokens` first, then `toSendConfirmVM` on top of it.
3. [ ] `pnpm test lib/wallet/services/sendView.test.ts` — green.

---

### Task 5 — Honest chain-stats reader

**Files:**
- NEW `lib/wallet/services/chainStats.ts`
- NEW `lib/wallet/services/chainStats.test.ts`

READ FIRST: `lib/wallet/services/evmClients.ts` (`publicClientFor`), `config/chains.config.ts` (`evmEntry`: `chainId`, `viemChain.name`, `explorer`).

**Interfaces (exact):**
```ts
export interface ChainStats {
  chainId: number;
  chainName: string;          // evmEntry(chainId).viemChain.name
  blockNumber: bigint;        // live getBlockNumber()
  gasMaxFeePerGasWei: bigint; // estimateFeesPerGas().maxFeePerGas — real
  explorerBase: string;       // evmEntry(chainId).explorer
  /** Values the mockup fabricated (validators/TPS/finality) are NOT modeled here. */
  representativeNote: "Validators, TPS, and finality are not measurable on this network and are omitted.";
}

export function readChainStats(chainId: number): Promise<ChainStats>;
```

Implementation: read `getBlockNumber()` + `estimateFeesPerGas()` in parallel via `publicClientFor(chainId)`; pull `chainName`/`explorerBase` from `evmEntry(chainId)`. Do NOT invent validators/TPS/finality — the type carries a fixed `representativeNote` string documenting the omission.

**TDD steps:**

1. [ ] RED — `chainStats.test.ts`: mock `publicClientFor` (`getBlockNumber → 123n`, `estimateFeesPerGas → { maxFeePerGas: 1_000_000_000n }`) and assert the mapped struct. Assert `representativeNote` is present and NO `validators`/`tps`/`finality` fields exist (`expect(stats).not.toHaveProperty("validators")`).
2. [ ] GREEN — implement.
3. [ ] `pnpm test lib/wallet/services/chainStats.test.ts` — green.

---

### Task 6 — Screen shell, portfolio header, token list, chain-stats panel

**Files:**
- NEW `app/dashboard/wallet/page.tsx`
- NEW `components/wallet/WalletChainApp.tsx`
- NEW `components/wallet/WalletChainApp.test.tsx`
- NEW `components/wallet/PortfolioHeader.tsx`
- NEW `components/wallet/TokenList.tsx`
- NEW `components/wallet/ChainStatsPanel.tsx`

READ FIRST: `app/dashboard/layout.tsx` (session guard + shell), `app/wallet/page.tsx` (AppProviders mount pattern), `components/wallet/WalletApp.tsx` (locked/unlocked/loading view machine + `getAccounts`/`loadPublicAccounts`/`isUnlocked`/`startAutoLock`), the mockup `WalletScreen` in `dash-holdings.jsx` (hero, token grid, activity, right-rail stats/stake/token cards), `components/ui/{Card,StatTile,LiveNumber}.tsx`, `styles/tokens.css`.

`app/dashboard/wallet/page.tsx` — Server Component; does NOT import `lib/wallet`; mounts the client island inside `AppProviders` (mirror `app/wallet/page.tsx`). It inherits `app/dashboard/layout.tsx`'s session guard automatically.

`WalletChainApp.tsx` (`"use client"`) — the orchestrator. Reuse the view machine from `WalletApp.tsx` (`loading | create | locked | unlocked`, `loadPublicAccounts`, `startAutoLock`). It resolves the active `chainId` from `activeChain().primaryChainId`, loads `loadPortfolio`, `readChainStats`, `readStakePosition` (guarded by `stakingAvailable`), `readPassportStatus`, and `evmHistory`, then renders `PortfolioHeader` + `TokenList` + `PassportAssetCard` + `ActivityLedger` (left column) and `ChainStatsPanel` + `StakePanel` (right rail). All read failures degrade gracefully (empty/error states, never a thrown render). STAKE/UNSTAKE/CLAIM/SEND buttons are unlock-gated: when locked, open `UnlockWalletModal` (reuse `components/wallet/UnlockWalletModal.tsx`).

`PortfolioHeader.tsx` — hero: `totalUsd` (formatted `$` with grouping), the checksummed EVM address (truncated `slice(0,22)+"…"+slice(-10)`) with a COPY button, and the action buttons `SEND / RECEIVE / SWAP / STAKE / BRIDGE`. **Rendered representative-price disclaimer (finding #8/#15):** directly next to/under the `$` total, render a visible label such as "Representative prices — not a live oracle" (small subdued text). This MUST be in the DOM, not just a code comment on `REPRESENTATIVE_PRICES` — the total is derived from static prices ($CRYPT=1 etc.) and must not read as a real market valuation. Port the mockup's hero styling using design-system tokens (`--navy`/`--gold`/`--card`), NOT the mockup's fabricated "CR-L2 · CHAIN ID 7331 · BLOCK 21 408 932" chrome — show the REAL `chainName` + live `blockNumber` from `ChainStats` instead. STAKE button is disabled when `!stakingAvailable(chainId)`.

`TokenList.tsx` — renders `PricedAsset[]` as `AssetRow`s (icon, symbol/name, formatted balance, representative price, USD value). Only resolvable tokens (the aggregator already excludes undefined-address ones). Do NOT render the passport here.

`ChainStatsPanel.tsx` — renders `ChainStats`: chain name, live block number (`LiveNumber` is fine as a cosmetic ticker BUT the base MUST be the real `blockNumber`), real gas (`formatUnits(gasMaxFeePerGasWei, 9)` gwei), an explorer link. Render the `representativeNote` verbatim where the mockup showed validators/TPS/finality — do NOT show fabricated 128 validators / 4821 TPS / instant-BFT as live.

**TDD steps:**

1. [ ] RED — `WalletChainApp.test.tsx` (jsdom, React Testing Library; mock the service modules): assert the loading state renders, the locked state shows an Unlock affordance, and a populated state (mocked portfolio + stats) renders the total, at least one token row, and the real chain name (not "CR-L2"/"7331"). Assert the STAKE button is disabled when `stakingAvailable` is mocked `false`. **Assert the rendered representative-price disclaimer appears near the total (finding #8) — e.g. `getByText(/representative prices/i)`.** Assert that when the passport/staking address accessors throw (unregistered chain), the screen still renders (graceful cards, no crash — finding #14).
2. [ ] GREEN — implement `page.tsx`, `WalletChainApp.tsx`, `PortfolioHeader.tsx`, `TokenList.tsx`, `ChainStatsPanel.tsx`.
3. [ ] `pnpm test components/wallet/WalletChainApp.test.tsx` — green. Verify CSP still passes (no new external origins; QR is `data:`; reads go through `/api/*`).

---

### Task 7 — RECEIVE (address + QR + copy)

**Files:**
- NEW `components/wallet/ReceiveModal.tsx`
- Test: extend `components/wallet/WalletChainApp.test.tsx` (or a focused `ReceiveModal.test.tsx`).

READ FIRST: `lib/wallet/receive.ts` (`receiveQrDataUrl`), `components/wallet/WalletApp.tsx` (existing QR render + `getAddress`/`getAccounts` usage).

`ReceiveModal.tsx` (`"use client"`) — shows the checksummed EVM address (`getAddress`), a COPY button (`navigator.clipboard.writeText`), and the QR image via `receiveQrDataUrl(address)` (a `data:` URL; CSP `img-src 'self' data:` already covers it). No send affordance. Reuse the modal chrome pattern from `UnlockWalletModal.tsx` / `WalletApp.tsx`.

**TDD steps:**

1. [ ] RED — assert the modal renders a checksummed address, a QR `<img data-testid="receive-qr">` (mock `receiveQrDataUrl` → a data URL), and COPY calls `navigator.clipboard.writeText` with the checksummed address.
2. [ ] GREEN — implement + wire the RECEIVE button in `PortfolioHeader`/`WalletChainApp`.
3. [ ] `pnpm test` for the receive spec — green.

---

### Task 8 — SEND with explicit confirm modal

**Files:**
- NEW `components/wallet/SendModal.tsx`
- NEW/extend `components/wallet/SendModal.test.tsx`

READ FIRST: `lib/wallet/services/send.ts` (`previewEvmSend`, `sendEvm`, `EvmSendRequest`), `lib/wallet/services/sendView.ts` (Task 4), `config/tokens.ts`, `lib/wallet/embedded/session.ts` (unlock gating).

`SendModal.tsx` (`"use client"`) — two-phase:
1. **Form:** token picker built from `sendableTokens(chainId)` (Task 4 — native + resolvable ERC-20s **INCLUDING $CRYPT** from `contractEntry(chainId).token`, NEVER the passport). Do NOT build the picker from `tokensForChain` alone — that omits $CRYPT and Wave 6 requires $CRYPT SEND (integration Test B). Then recipient input + amount input. On submit, parse the amount to base units (`parseUnits(amount, decimals)`), build `EvmSendRequest` (for $CRYPT, `token = contractEntry(chainId).token`), call `previewEvmSend(req, from)` → `SendPreview` → `toSendConfirmVM(preview)`. Validate + checksum the recipient (`getAddress`) BEFORE enabling "Review"; a bad address disables the button + shows an inline error. If `contractEntry(chainId).token` is unregistered on the active chain, simply omit $CRYPT from the picker (graceful — finding #14), never throw.
2. **Confirm:** render the `SendConfirmVM` human-readably — to (checksummed), amount + tokenSymbol, chainName, fee + feeSymbol. Only on the explicit "Confirm & sign" click call `sendEvm(req)` (unlock-gated — if `!isUnlocked()`, open `UnlockWalletModal` first). Show the resulting tx hash + explorer link.

Never echo raw base-unit strings in the confirm; always go through `toSendConfirmVM`.

**TDD steps:**

1. [ ] RED — `SendModal.test.tsx` (mock `previewEvmSend`/`sendEvm`, mock `sendableTokens`/`contractEntry`): assert an invalid recipient disables Review; a valid flow shows a confirm with formatted amount + fee + chain name (not raw wei); "Confirm & sign" calls `sendEvm` exactly once with the correct `EvmSendRequest`; the passport is NOT in the token picker. **Assert $CRYPT IS in the picker when `contractEntry(chainId).token` is mocked-set, and selecting it produces a confirm with `tokenSymbol==="CRYPT"`** (finding #2). Assert the picker gracefully omits $CRYPT (no throw) when `token` is unregistered.
2. [ ] GREEN — implement + wire the SEND button.
3. [ ] `pnpm test components/wallet/SendModal.test.tsx` — green.

---

### Task 9 — STAKE / UNSTAKE / CLAIM panel

**Files:**
- NEW `components/wallet/StakePanel.tsx`
- NEW `components/wallet/StakePanel.test.tsx`

READ FIRST: `lib/wallet/services/staking.ts` (Task 2), `contracts/src/CryptStaking.sol` (the `claim()` cap note), `components/wallet/UnlockWalletModal.tsx`.

`StakePanel.tsx` (`"use client"`) — right-rail card. Hidden/disabled entirely when `!stakingAvailable(chainId)`; the availability probe MUST be caught, never allowed to throw (finding #14 — on the default testnet env `stakingAddress`/`token` are unregistered). Shows from `readStakePosition`: `staked` ($CRYPT, 18 dec), `earned`, `aprBps/100` %, and `totalStaked` (TVL). Actions:
- **STAKE:** amount input → read `readCryptAllowance`; if allowance < amount, show a DISTINCT approve confirm (spender = staking address, EXACT amount, 18 dec) → `approveCryptEmbedded(chainId, amount)`. **TOCTOU ordering (finding #6):** `approveCryptEmbedded` MUST fully resolve — i.e. its `waitForTransactionReceipt` has CONFIRMED the approve (finding #5) — BEFORE the stake step simulates or sends. Do NOT fire approve and stake concurrently or optimistically: `stakeEmbedded`'s `simulateContract` dry-run reads the on-chain allowance and will REVERT on a stale (pre-approve) allowance. So: `await approveCryptEmbedded(...)` (confirmed) → THEN show the stake confirm (amount + contract + chain + fee) → `stakeEmbedded(chainId, amount)`. If allowance already covers, SKIP approve. Offer a max-approve toggle ONLY as an explicit, clearly-labeled opt-in (default OFF).
- **UNSTAKE:** amount input → confirm → `unstakeEmbedded`.
- **CLAIM:** confirm that states the payout is "up to `earned`, capped by the reward pool (`rewardPoolRemaining`)" — do NOT promise the full `earned`. → `claimEmbedded`.
All actions unlock-gated (open `UnlockWalletModal` when locked). Hidden/disabled entirely when `!stakingAvailable(chainId)` (probe caught, never thrown — finding #14).

**TDD steps:**

1. [ ] RED — `StakePanel.test.tsx` (mock `staking.ts`): assert APR renders as `aprBps/100` %; when allowance ≥ amount the approve step is SKIPPED and only `stakeEmbedded` is called; when allowance < amount, `approveCryptEmbedded` is called with the EXACT amount BEFORE `stakeEmbedded`, **AND `approveCryptEmbedded` fully RESOLVES before `stakeEmbedded` is invoked (finding #6 TOCTOU — e.g. make the `approveCryptEmbedded` mock a deferred promise and assert `stakeEmbedded` is NOT called until it resolves)**; the CLAIM confirm text mentions the reward-pool cap and does NOT promise full earned; max-approve defaults OFF; the whole panel is disabled when `stakingAvailable` is false (and renders a graceful "staking unavailable" state rather than throwing when the address accessors would throw — finding #14).
2. [ ] GREEN — implement + wire the STAKE button (opens/scrolls to the panel).
3. [ ] `pnpm test components/wallet/StakePanel.test.tsx` — green.

---

### Task 10 — SWAP / BRIDGE (labeled TESTNET-MOCK) + passport card + activity ledger

**Files:**
- NEW `components/wallet/SwapBridgeModal.tsx`
- NEW `components/wallet/PassportAssetCard.tsx`
- NEW `components/wallet/ActivityLedger.tsx`
- Tests: `components/wallet/SwapBridgeModal.test.tsx`, `components/wallet/PassportAssetCard.test.tsx`, `components/wallet/ActivityLedger.test.tsx`

READ FIRST: `lib/wallet/services/swap.ts` (`getSwapQuote`, `MockQuote`), `lib/passport/client.ts` (`readPassportStatus`, `PassportStatus`), `lib/wallet/services/history.ts` (`evmHistory`, `TxRow`).

`SwapBridgeModal.tsx` — from/to token pickers + amount → `getSwapQuote(from, to, amount)` → render `MockQuote` (`estOut`) behind a prominent, non-dismissible "TESTNET MOCK · SIMULATED — no funds move" banner. NO execution button (no signer path). On mainnet `getSwapQuote` throws — catch and show "swap/bridge lands in a later wave". Reuse the same component for the BRIDGE action.

`PassportAssetCard.tsx` — DISTINCT component (NOT `AssetRow`). Reads `readPassportStatus(chainId, evmAddress)`; when a citizen, renders the SBT (tokenId / citizen number) with a "SOULBOUND · NON-TRANSFERABLE" badge and NO send/transfer affordance. When not a citizen, a subdued "No passport minted" state linking to `/dashboard/mint`. **Graceful degradation (finding #14):** on the default testnet env `passportAddress(84532)` is an unregistered placeholder and `readPassportStatus` (which resolves it) THROWS. Catch that "not deployed / unregistered" throw and render a subdued "Passport unavailable on this network" state — NEVER let it crash the screen.

`ActivityLedger.tsx` — renders `evmHistory(chainId, address)` (`TxRow[]`) as the on-chain activity log (block/time, direction in/out, counterparty, value, explorer link). Empty state when no rows. Do NOT fabricate the mockup's demo rows.

**TDD steps:**

1. [ ] RED — SwapBridge: assert the TESTNET-MOCK banner renders, the mock `estOut` shows, and there is NO execute/sign button. Passport: a citizen shows a non-transferable badge and NO transfer control; a non-citizen shows the mint link; **when `readPassportStatus` throws an "unregistered/not deployed" error, the card renders a graceful "Passport unavailable" state and does NOT throw (finding #14)**. Activity: rows render with correct direction; empty state when none.
2. [ ] GREEN — implement all three + wire SWAP/BRIDGE buttons and place the passport card + ledger in `WalletChainApp`.
3. [ ] `pnpm test` for the three specs — green.

---

### Task 11 — LOCAL-ANVIL integration test (fund → approve → stake → readback + token SEND)

**Files:**
- EDIT `test/integration/anvil-harness.ts`
- NEW `test/integration/wallet-e2e.test.ts`

READ FIRST: `test/integration/anvil-harness.ts` (current shape: spawns anvil, runs `Deploy.s.sol` with anvil key #0, emits addresses, returns `{ passport, token, admin, stop }`), `test/integration/mint-e2e.test.ts` (the in-process `/api/rpc/31337` fetch capture + `vi.mock` of `withEvmSigner` + method assertions; note its `publicCode` helper uses a DIRECT anvil viem client for out-of-band ops — the same pattern needed for `evm_increaseTime`), `contracts/script/Deploy.s.sol` (`configure` moves the ENTIRE genesis 100M `INITIAL_SUPPLY` admin→treasury via `d.token.transfer(treasury, balanceOf(admin))`, so **admin holds 0 $CRYPT after configure**; the TREASURY holds the 100M; admin has `DEFAULT_ADMIN_ROLE` on the token + `REWARDS_ADMIN_ROLE` on staking; `MINTER_ROLE` was granted to staking/distributor, NOT admin).

**Harness edits (`anvil-harness.ts`):**
- After `emit-contract-addresses.mjs`, ALSO parse the `CryptStaking` **and `CryptTreasury`** CREATE addresses from the broadcast and add `staking: Address` (and `treasury: Address`) to `AnvilDeployment`.
- **Funding — prefer the LESS-PRIVILEGED treasury-genesis path (finding #9), not grant-MINTER-then-mint.** The likely-security `$CRYPT` should be sourced from the 100M genesis already sitting in the treasury rather than expanding supply via a self-granted `MINTER_ROLE`. Expose a harness helper:
  ```ts
  // amounts are EXPLICIT and independently sufficient — no shared-N double-spend.
  fundCryptAndRewards(recipient: Address, stakeAmount: bigint, rewardAmount: bigint): void
  ```
  It funds the test wallet's stake AND the reward pool from SEPARATE draws so neither starves the other (fixes finding #3 — the old "mint N, then transfer stake AND fund rewards from the same N without N >= stake + rewards" double-spend that made `fundRewards` revert in `beforeAll`):
  1. Move `stakeAmount + rewardAmount` out of the treasury to `admin` (a single treasury draw sized to cover BOTH). The treasury holds 100M ≫ any test amount, so this cannot underflow. `CryptTreasury.disburse(token, to, amount)` is gated by `GOVERNANCE_ROLE` (not `DEFAULT_ADMIN_ROLE`), but admin holds `DEFAULT_ADMIN_ROLE` on the treasury (constructor grant) which is the OZ admin of all roles, so LOCAL-only: `cast send treasury "grantRole(bytes32,address)" GOVERNANCE_ROLE admin` (compute `GOVERNANCE_ROLE` = `Roles.GOVERNANCE_ROLE`) then `cast send treasury "disburse(address,address,uint256)" token admin (stakeAmount + rewardAmount)`. This MOVES existing genesis $CRYPT — it does NOT expand supply, which is why it is the less-privileged path (finding #9): `CryptToken.mint`'s own LEGAL comments warn that minting expands a likely-security token's supply. (Fallback, ONLY if the treasury disburse path is impractical on local: grant-`MINTER_ROLE`-to-admin then `mint(admin, stakeAmount + rewardAmount)`, respecting `MAX_SUPPLY`; document the fallback inline as the second-choice path.)
  2. `cast send token "transfer(address,uint256)" recipient stakeAmount` (admin → test wallet).
  3. `cast send token "approve(address,uint256)" staking rewardAmount` then `cast send staking "fundRewards(uint256)" rewardAmount` (admin has `REWARDS_ADMIN_ROLE`; the approve covers EXACTLY `rewardAmount`, so `fundRewards`'s `safeTransferFrom` cannot revert).
  Pick concrete, obviously-sufficient constants in the test, e.g. `stakeAmount = 1_000e18`, `rewardAmount = 10_000e18` — assert nothing relies on `stakeAmount === rewardAmount` and that the admin balance after step 1 is `>= stakeAmount + rewardAmount` before steps 2–3. Use anvil key #0 (`ADMIN_PK`) for all admin ops — LOCAL/THROWAWAY only.

**`wallet-e2e.test.ts`** (mirror `mint-e2e.test.ts` structure exactly):
- `// @vitest-environment node`; set `NEXT_PUBLIC_CHAIN_ENV=local`, `NEXT_PUBLIC_APP_URL`, `RPC_ANVIL` before app imports.
- `vi.mock("@/lib/wallet/embedded/session")` with a hoisted `signerHolder` yielding the test wallet's anvil account (reuse key #8 as the test wallet, like the mint applicant).
- Spy `globalThis.fetch` → route `/api/rpc/31337` in-process to the real `app/api/rpc/[chain]/route` POST handler; capture every JSON-RPC `method` into `rpcMethods`.
- `beforeAll`: `startAnvilWithContracts([])`; then `deployment.fundCryptAndRewards(wallet, stakeAmount, rewardAmount)` with EXPLICIT sufficient constants (`stakeAmount = 1_000e18`, `rewardAmount = 10_000e18`) so the stake funding and the reward-pool funding are drawn separately and `fundRewards` cannot revert (finding #3). `wallet` = anvil key #8 (the test wallet).
- Test A — **approve → stake → readback**:
  1. `readStakePosition(31337, wallet).staked` is `0n`; `readCryptAllowance` is `0n`.
  2. `approveCryptEmbedded(31337, stakeAmount)`; assert allowance now ≥ stakeAmount.
  3. `stakeEmbedded(31337, stakeAmount)`; assert `readStakePosition(...).staked === stakeAmount` and `totalStaked` increased. (`approve` fully confirms — via `writeEmbedded`'s receipt wait, finding #5 — before `stake` simulates, matching the StakePanel TOCTOU ordering, finding #6.)
  4. Advance time to accrue rewards, then assert `earned(wallet) > 0n`. **CRITICAL (finding #4):** `evm_increaseTime` / `evm_mine` are NOT in the RPC allowlist (`lib/rpc/allowlist.ts` — only standard `eth_*` read/broadcast methods) and the `/api/rpc/31337` proxy will REJECT them. So issue them via a DIRECT anvil viem client — `createTestClient({ chain: foundry, mode: "anvil", transport: http("http://127.0.0.1:8545") })` (or a raw JSON-RPC `fetch` to `127.0.0.1:8545`) — NOT `publicClientFor(31337)` and NOT any `/api/rpc/*` route. This is the same out-of-band direct-client pattern `mint-e2e.test.ts`'s `publicCode` helper already uses for setup. Do the same for any anvil-only cheatcode. The `earned` read afterward goes back through the app's normal `readStakePosition` path.
  5. Assert `rpcMethods` contains `eth_sendRawTransaction`, does NOT contain `eth_sendTransaction` / `personal_sign` / `eth_sign` / `eth_accounts`.
- Test B — **$CRYPT token SEND confirms on-chain** (the on-chain regression proof for findings #1/#2 — send $CRYPT, resolved from `contractEntry(31337).token`, NOT `tokensForChain`):
  1. Resolve `cryptAddr = contractEntry(31337).token` (the emitted anvil $CRYPT). Build the confirm VM through `toSendConfirmVM(previewEvmSend({ chainId:31337, to:<anvil #1>, amount, token: cryptAddr }, wallet))` and assert it does NOT throw and yields `tokenSymbol==="CRYPT"` (proves the `sendableTokens` union resolves $CRYPT end-to-end).
  2. `sendEvm({ chainId:31337, to:<anvil #1>, amount, token: cryptAddr })`; `waitForTransactionReceipt` → `status === "success"`.
  3. Assert recipient $CRYPT balance increased; assert no `eth_sendTransaction` in `rpcMethods`.
- `afterAll`: restore mocks, `deployment.stop()`, and `git checkout -- config/contracts.ts` (mirror `mint-e2e.test.ts` cleanup) so the emitted anvil address never pollutes git.

**TDD steps:**

1. [ ] RED — write `wallet-e2e.test.ts` (it fails until the harness emits `staking` + funds are provided).
2. [ ] GREEN — edit `anvil-harness.ts` (emit `staking` + `treasury` addresses; add the `fundCryptAndRewards` helper that draws stake + rewards separately, treasury-genesis path).
3. [ ] `pnpm test:integration` — the wallet-e2e suite passes; confirm the existing `mint-e2e` still passes. (Skips gracefully when Foundry is absent, via `foundryAvailable()`.)

---

### Task 12 — Playwright screen-state specs

**Files:**
- NEW `e2e/wallet-screen.spec.ts`

READ FIRST: `e2e/wallet.spec.ts`, `e2e/wallet-csp.spec.ts` (existing patterns: how the embedded wallet is created/unlocked in a browser without a real chain; how reads are stubbed/routed).

Cover the screen STATES (not on-chain execution — that's Task 11's job):
- Loading state renders.
- Locked vs unlocked (Unlock affordance present when locked; actions gated).
- Empty portfolio (funded-with-nothing wallet) renders `$0.00` total without NaN, WITH the visible "representative prices — not a live oracle" disclaimer near the total (finding #8).
- RECEIVE shows a checksummed address + a QR `<img>`.
- SEND opens the confirm modal with human-readable to/amount/token/chain/fee (assert NOT raw wei).
- SWAP/BRIDGE shows the TESTNET-MOCK banner and has NO execute button.
- Chain-stats panel shows the real chain name (NOT "CR-L2 / 7331") and the representative-note for validators/TPS.
- Graceful degradation (finding #14): on the default testnet env where passport/staking/token are unregistered, the passport card renders "Passport unavailable", the stake panel is disabled/hidden, and $CRYPT is absent from the send picker — with NO crashed/blank screen.

**TDD steps:**

1. [ ] Write the spec; stub network reads (`page.route` on `/api/rpc/*` + `/api/history/*`) to deterministic fixtures so states render without a live chain.
2. [ ] `pnpm e2e e2e/wallet-screen.spec.ts` — green.

---

### Task 13 — Close-out & acceptance checklist (spec §9, Wave 6)

**Files:** none (verification + a short note in the PR/commit body).

Verify each acceptance item and check it off:

- [ ] Real balances + history render for a funded wallet (Task 3, 6, 10; proven on anvil in Task 11).
- [ ] A SEND confirms on-chain (Task 11 Test B) and every SEND shows an explicit human-readable confirm (Task 4, 8).
- [ ] RECEIVE shows a checksummed address + QR (Task 7).
- [ ] STAKE/UNSTAKE work against `CryptStaking`; staked balance goes up (Task 9; proven on anvil in Task 11 Test A).
- [ ] `$CRYPT` SEND works — it is in the send picker and its confirm renders (resolved via `sendableTokens`/`contractEntry.token`, not `tokensForChain`); proven on anvil in Task 11 Test B (findings #1, #2).
- [ ] Every embedded write awaits its receipt and throws on revert (`writeEmbedded` matches `mint.ts` — finding #5); STAKE awaits the CONFIRMED approve before simulating stake (TOCTOU — finding #6).
- [ ] Swap/bridge are flagged TESTNET-MOCK with no execution (Task 10).
- [ ] Every contract write (APPROVE/STAKE/UNSTAKE/CLAIM) shows an explicit confirm; approve is exact-amount + distinct; CLAIM confirm honors the reward-pool cap (Task 2, 9).
- [ ] Chain stats are honest — real chainId/block/gas/explorer; fabricated validators/TPS/finality omitted or marked representative (Task 5, 6).
- [ ] Representative-price disclaimer RENDERS in the UI near the total, not only a code comment (findings #8/#15; Task 3, 6).
- [ ] Graceful degradation on an unregistered chain — passport/stake/$CRYPT-send cards render empty/unavailable states, never crash (finding #14; Task 6, 9, 10).
- [ ] Portfolio total sums only resolvable tokens, never NaN (Task 3).
- [ ] NO `eth_sendTransaction`/`personal_sign`/`eth_sign` on any embedded path — asserted in unit (Task 2) AND over-the-wire on anvil (Task 11).
- [ ] Integration funding uses the treasury-genesis path with explicit sufficient amounts (no shared-N double-spend; `fundRewards` cannot revert) — findings #3, #9 (Task 11).
- [ ] Anvil-only cheatcodes (`evm_increaseTime`/`evm_mine`) go through a DIRECT anvil client, never the allowlisted `/api/rpc` proxy (finding #4; Task 11).
- [ ] Nothing hardcodes an address; `stakingAddress` throws when unregistered; emit script writes staking (Task 1).
- [ ] ALL prior tests green: 206 app + 165 forge + the mint integration test, PLUS the new wallet unit + integration + e2e specs.
- [ ] CSP passes (no new external origins; QR `data:`; reads via `/api/*`).
- [ ] Run `pnpm test && pnpm test:integration && pnpm e2e && (cd contracts && forge test)` — all green.

Commit each task separately with the `Co-Authored-By` trailer. Do NOT deploy to or transact on any real network at any point.
