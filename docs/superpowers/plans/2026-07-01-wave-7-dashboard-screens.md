# CryptRepublic Wave 7 — Remaining Dashboard Screens (Home / Governance / Treasury / Holdings / Population / Embassies) — Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL — before executing any task below, invoke `superpowers:test-driven-development` and `superpowers:executing-plans`. Every task is TDD: write the failing test FIRST (RED), then the implementation (GREEN), then run the stated command and confirm green. Do NOT skip the RED step. Keep ALL prior tests green (Wave 1–6 app + forge + integration + e2e). Commit each task separately with the `Co-Authored-By` trailer.

## Goal

Port the **6 remaining citizen dashboard screens** from the static mockups (`dash-home.jsx`, `dash-gov-treasury.jsx`, `dash-holdings.jsx`, `dash-population-embassies.jsx`) into real Next.js App Router routes, wired to REAL on-chain contracts (`CryptGovernance` §6.4, `CryptTreasury` §6.5, `DividendDistributor` §6.6, `CryptRepublicPassport`, `CryptToken`, `CryptStaking`) and a REAL backend (Prisma models + `/api/*` routes). The 6 screens:

1. **Citizen home** (§7.5) — `app/dashboard/page.tsx`
2. **Constitution & votes / Governance** (§7.8) — `app/dashboard/governance/page.tsx` + `castVote` write
3. **Treasury** (§7.9) — `app/dashboard/treasury/page.tsx` (read-only; STAKE links to `/dashboard/wallet`)
4. **Sovereign Holdings / dividends** (§7.10) — `app/dashboard/holdings/page.tsx` + `claim` write + LEGAL flag
5. **Population / census** (§7.11) — `app/dashboard/population/page.tsx` (read-only, public)
6. **Embassies** (§7.12) — `app/dashboard/embassies/page.tsx` (+ `[code]/page.tsx`) + propose-embassy write

Wave 7 ALSO builds the **dashboard SHELL** (Sidebar + Topbar + MobileNavDrawer + session/citizen context) which is NOT yet ported — it exists only in `Dashboard.html`. The current `app/dashboard/layout.tsx` is an 8-line auth guard; Wave 7 wraps its `{children}` in the shell while KEEPING the guard.

Build + validate on **local anvil only** (chainId 31337 → `127.0.0.1:8545`). Base Sepolia / mainnet is a documented USER step (§8.3). The assistant NEVER deploys or moves real funds.

## Architecture

- **Routes.** Each screen is a Server Component `page.tsx` under `app/dashboard/<route>/` that mounts a `"use client"` island (mirrors `app/dashboard/wallet/page.tsx` → `<WalletChainApp/>`). Server pages do NOT import `lib/wallet` client-only modules. All 6 pages inherit the shell + auth guard from `app/dashboard/layout.tsx`.
- **On-chain reads.** Browser reads route through `publicClientFor(chainId)` → `/api/rpc/<id>` (CSP-safe, already built). Server-side reads (API routes, event-log queries) go through a NEW `lib/*/serverReads.ts` per contract mirroring `lib/passport/serverReads.ts` (`createPublicClient` + `serverRpcUrl`). The RPC allowlist already permits `eth_call` / `eth_getLogs` / `eth_estimateGas` / `eth_sendRawTransaction` — **no new RPC methods needed**.
- **On-chain writes.** `castVote`, dividend `claim`/`claimMany`, and `propose` are USER-signed, non-custodial. EMBEDDED path reuses the FROZEN `writeEmbedded` pattern from `lib/wallet/services/staking.ts` VERBATIM: `simulateContract` (eth_call dry-run) → `withEvmSigner` → `account.signTransaction({type:"eip1559"})` → `client.sendRawTransaction` → `waitForTransactionReceipt` → THROW if `status !== "success"`. EXTERNAL path uses wagmi `writeContract` (the only legit `writeContract`; mirrors `lib/passport/mint.ts` `submitMintExternal`). NEVER `eth_sendTransaction` / `personal_sign` / `eth_sign` / `eth_accounts` on embedded. The server NEVER signs or holds keys/seeds.
- **Votes are keyed by passport `tokenId`, not address.** `castVote(proposalId, tokenId, support)` requires `passport.ownerOf(tokenId) == msg.sender`. The UI resolves the citizen's `tokenId` (from `readPassportStatus` → `CitizenMinted` log) BEFORE voting.
- **Off-chain-by-nature content** (asset catalog, embassy directory, city geo/coords, constitution/doctrine text, proposal rich-text/title/tag, dissent comments, treasury allocation targets) is served from Prisma via `/api/*`. Anything trustless (tallies, proposal state, claimable, treasury balances, citizen count, dividend/disbursement history) reads from chain.
- **Honesty (§7.13).** On a FRESH testnet there are 0 proposals / 0 dividend epochs / near-0 treasury. On-chain-derived sections render honest empty/zero states (mirror Wave 6 graceful degradation), NOT the mockup's fabricated numbers. Mockup L2 chrome (`CR-L2` / `CHAIN ID 7331` / validators / TPS / "block 21 408 932") is replaced with the real active chain name / block / gas / explorer from a `useChainInfo` hook.

## Tech Stack

Next.js 15 App Router + TypeScript strict (no `any`; unused vars prefixed `_`), viem 2.54, wagmi 2.19, `@tanstack/react-query`, the government-issue design system (`styles/tokens.css` + `components/ui/*`), Prisma (SQLite dev), Vitest (unit + `vitest.integration.config.ts` for anvil), Playwright (`e2e/`), Foundry (local anvil). Package manager: **pnpm**. Prettier enforced. Per-task commits with a `Co-Authored-By` trailer.

---

## Global Constraints (NON-NEGOTIABLE — copy into working memory)

1. **Non-custodial; server never signs / never holds keys.** All embedded writes = the FROZEN `writeEmbedded` pattern (`staking.ts`): `simulateContract` → `withEvmSigner` → `account.signTransaction({...type:"eip1559"})` → `sendRawTransaction` → `waitForTransactionReceipt` → throw when `status !== "success"`. NEVER `eth_sendTransaction` / `writeContract` on embedded; NEVER `personal_sign` / `eth_sign` / `eth_accounts`. EXTERNAL writes = wagmi `writeContract` only.
2. **Reads via the existing proxy.** Browser: `publicClientFor(chainId)` → `/api/rpc/<id>`. Server: a `serverReads` helper via `serverRpcUrl`. NO new RPC methods (`eth_call`/`eth_getLogs`/`eth_estimateGas`/`eth_sendRawTransaction` already allowlisted).
3. **Votes keyed by passport `tokenId`.** Resolve the citizen `tokenId` (via `readPassportStatus`) before `castVote`. `castVote` requires the caller to own the tokenId (enforced on-chain); weight is 1 (one passport = one vote).
4. **Server-side authorization on EVERY mutation route.** `requireSession(req)` + `isAllowedOrigin(req)` + a Zod `.strict()` schema (unknown keys rejected). Citizen-gated OFF-CHAIN content mutations (post a proposal comment, propose-embassy off-chain content) verify passport ownership ON-CHAIN server-side via `readHasPassportServer` — NEVER trust a client `isCitizen` flag. On-chain actions (vote/claim/propose) are enforced by the contract itself.
5. **Honesty / no fabricated data (§7.13).** Trustless → chain (governance tallies via `getVotes`, proposal state via `state()`, dividend claimable via `claimable()`, treasury balance via `balanceOf`, citizen/census count via `totalCitizens()` / `CitizenMinted` logs, dividend history via `DividendClaimed` logs, disbursements via `Disbursed` logs). Off-chain-by-nature → Prisma. A FRESH testnet has 0 proposals / 0 epochs / near-0 treasury → on-chain sections render honest empty/zero states, NOT mockup numbers. Mockup L2 chrome (`CR-L2` / `7331` / validators / TPS / "block 21 408 932") is replaced with the REAL active chain name / block / gas / explorer.
6. **DIVIDENDS legal flag.** Surface the `// LEGAL:` marker in code AND a VISIBLE in-UI note (asserted by a test) that dividends are likely a regulated security (§7.10 + §10.1). The contracts already carry `// LEGAL:` markers (`CryptTreasury.sol`, `DividendDistributor.sol`).
7. **Testnet honesty tags.** Render `TESTNET` / `SIMULATED` where money moves or data is mocked.
8. **No secret columns.** New Prisma models must NOT add `privateKey` / `seedPhrase` / `mnemonic` / `plaintextPassword` / `passwordPlain` / `secretKey`. `scripts/guard-no-secret-columns.sh` (`pnpm guard:secrets`) MUST stay green.
9. **Per-screen state matrix (§7.13).** loading (skeleton `Card`s), empty (in-voice copy), error (per-card retry, NEVER a blank screen), and not-yet-citizen vs citizen (reads allowed; writes disabled with a mint nudge; passport/dividend/vote screens show mint-first empty states).
10. **Local-anvil-only boundary.** Build + validate on local anvil (31337). Never deploy to or transact on a real network; never hold/request a real key. Base Sepolia / mainnet is a documented USER step.
11. **Graceful degradation on an unregistered chain.** On the default testnet env, `governanceAddress(84532)` / `treasuryAddress(84532)` / `distributorAddress(84532)` are unregistered placeholders whose throwing accessors WILL throw. Every card that touches one MUST catch the "not deployed / unregistered" throw and render a graceful empty/unavailable state, NEVER crash the screen (mirror Wave 6 finding #14; see `safeStakingAvailable` in `WalletChainApp.tsx`). Prefer non-throwing probes (`contractEntry(chainId).governance` directly) where availability is being tested.
12. **Reuse existing infra VERBATIM.** `writeEmbedded` (`staking.ts`), `publicClientFor`/`evmEntry`, `serverRpcUrl`, `readPassportStatus`/`readHasPassportServer`, `requireSession`/`isAllowedOrigin`, `json`/`badRequest`/`forbidden`/`unauthorized`, the emit script (already emits passport/token/staking), the anvil harness (already emits treasury + has `fundCryptAndRewards`), and the Wave-6 write-UI state machine (`StakePanel.tsx`). READ the actual files and match exact signatures — do not re-derive them.

---

## Exact contract signatures (from `contracts/src/*.sol` — reference precisely)

**`CryptGovernance`** — `enum State{Pending,Active,Defeated,Queued,Succeeded,Executed,Cancelled}` (NOTE: the real on-chain enum has **`Queued`** between `Defeated` and `Succeeded` — a passed-but-still-delayed proposal is `Queued`); `enum Vote{None,For,Against,Abstain}`; `proposals(uint256)->(address proposer,uint64 start,uint64 end,uint256 snapshotCitizens,uint256 forVotes,uint256 againstVotes,uint256 abstainVotes,bool executed,bool cancelled,bytes32 descriptionHash,address target,uint256 value,bytes callData)`; `proposalCount()->uint256`; `getVotes(uint256)->(uint256 forVotes,uint256 againstVotes,uint256 abstainVotes,uint256 snapshotCitizens)` (prefer this over the full struct getter — the dynamic `callData` member is expensive/stack-heavy off-chain); `state(uint256)->State`; `voteByPassport(uint256 proposalId,uint256 tokenId)->Vote`; `quorumBps()->uint16`; `votingPeriod()->uint256`; `minCitizensForProposal()->uint256`; `propose(address target,uint256 value,bytes callData,bytes32 descriptionHash)->uint256` (requires `isCitizen` + `totalCitizens >= minCitizensForProposal`); `castVote(uint256 proposalId,uint256 tokenId,Vote support)` (requires window active, `ownerOf(tokenId)==msg.sender`, not-yet-voted, `support!=None`); `execute(uint256)`; `cancel(uint256)`. Events: `ProposalCreated(uint256 indexed proposalId,address indexed proposer,address target,bytes32 descriptionHash)`, `VoteCast(uint256 indexed proposalId,uint256 indexed tokenId,address indexed voter,Vote support)`, `ProposalExecuted(uint256 indexed proposalId)`, `ProposalCancelled(uint256 indexed proposalId)`.

**`CryptTreasury`** — `GOVERNANCE_ROLE()->bytes32` (`keccak256("GOVERNANCE_ROLE")`); `crypt()->address` (immutable IERC20); `balanceOf(address token)->uint256` (`token==address(0)` => ETH balance); `allocationBps(bytes32)->uint16`; `assetWhitelist(address)->bool`; `totalAllocationBps()->uint16`; `disburse(address token,address to,uint256 amount)` onlyGOVERNANCE; `fundDividends(address distributor,uint256 amount)->uint256 epochId` onlyGOVERNANCE. Events: `Disbursed(address indexed token,address indexed to,uint256 amount)`, `DividendsFunded(address indexed distributor,uint256 amount,uint256 indexed epochId)`, `AllocationSet(bytes32 indexed bucket,uint16 bps)`, `AssetWhitelisted(address indexed token,bool ok)`, `Received(address indexed from,uint256 amount)`.

**`DividendDistributor`** — `FUNDER_ROLE()->bytes32`; `passport()`/`crypt()` immutables; `epochs(uint256)->(uint256 amount,uint256 snapshotCitizens,uint256 perCitizen,uint64 openedAt,bool open)`; `currentEpoch()->uint256`; `claimed(uint256 epochId,uint256 tokenId)->bool`; `claimable(uint256 epochId,uint256 tokenId)->uint256`; `openEpoch(uint256 amount)->uint256 epochId` onlyFUNDER (PULLS `amount` from the caller via `safeTransferFrom` — caller must `approve` first); `claim(uint256 epochId,uint256 tokenId)` nonReentrant (requires `open`, `0 < tokenId <= snapshotCitizens`, `ownerOf(tokenId)==msg.sender`, `!claimed`); `claimMany(uint256 epochId,uint256[] tokenIds)` nonReentrant. Events: `EpochOpened(uint256 indexed epochId,uint256 amount,uint256 snapshotCitizens,uint256 perCitizen)`, `DividendClaimed(uint256 indexed epochId,uint256 indexed tokenId,address indexed to,uint256 amount)`.

**`CryptRepublicPassport`** (reuse `lib/passport/abi.ts`) — `totalCitizens()->uint256`, `hasPassport(address)->bool`, `isCitizen(address)->bool`, `ownerOf(uint256)->address`, `balanceOf(address)->uint256`, event `CitizenMinted(uint256 indexed tokenId,address indexed citizen,bytes32 nameHash,uint64 mintBlock)`.

**Deploy wiring (from `contracts/script/Deploy.s.sol` — LOCAL facts for the harness):** `governance` has `GOVERNANCE_ROLE` on `treasury`; `treasury` AND `admin` (anvil key #0) both have `FUNDER_ROLE` on `distributor`; `admin` has `PASSPORT_ADMIN_ROLE` + `GENESIS_ATTESTOR_ROLE` on passport (can `genesisMint`/`adminMint`); `governance.setTargetAllowed(treasury, true)`; governance params on anvil: `votingPeriod=3 days`, `quorumBps=2000`, `executionDelay=2 days`, `minCitizensForProposal=3`; staking APR `1180` bps.

---

## File Structure (new/edited)

```
app/
  dashboard/
    layout.tsx                              # EDIT — wrap children in the shell (keep guard)
    page.tsx                                # NEW — Citizen home (B1)
    governance/page.tsx + GovernanceApp.tsx # NEW (B2)
    treasury/page.tsx   + TreasuryApp.tsx   # NEW (B3)
    holdings/page.tsx   + HoldingsApp.tsx   # NEW (B4)
    population/page.tsx + PopulationApp.tsx # NEW (B5)
    embassies/page.tsx  + EmbassiesApp.tsx  # NEW (B6)
    embassies/[code]/page.tsx + EmbassyDetail.tsx # NEW (B6)
  api/
    citizen/obligations/route.ts            # NEW (A5)
    governance/proposals/route.ts           # NEW (A5)
    governance/proposals/[id]/route.ts      # NEW (A5)
    governance/proposals/[id]/comments/route.ts # NEW (A5)
    treasury/allocations/route.ts           # NEW (A5)
    treasury/flows/route.ts                 # NEW (A5)
    treasury/summary/route.ts               # NEW (A5)
    holdings/assets/route.ts                # NEW (A5)
    holdings/dividends/route.ts             # NEW (A5)
    population/census/route.ts              # NEW (A5)
    embassies/route.ts                      # NEW (A5)
    embassies/[code]/route.ts               # NEW (A5)
    embassies/proposals/route.ts            # NEW (A5)
    constitution/route.ts                   # NEW (A5)
    stats/summary/route.ts, activity/route.ts, census/route.ts, inductions/route.ts # NEW (A5)
components/
  shell/
    DashboardShell.tsx  + .test.tsx         # NEW (A1)
    Sidebar.tsx, Topbar.tsx, MobileNavDrawer.tsx, Seal (reuse), NavIcon.tsx # NEW (A1)
    SessionCitizenProvider.tsx              # NEW (A1)
  ui/
    TxButton.tsx        + .test.tsx         # NEW (A4)
    Spark.tsx           + .test.tsx         # NEW (A4)
    Ledger.tsx (table primitive)            # NEW (A4)
    Modal.tsx           + .test.tsx         # NEW (A4)
  governance/*, treasury/*, holdings/*, population/*, embassies/* # NEW (B1–B6)
lib/
  hooks/useChainInfo.ts + .test.ts          # NEW (A1)
  governance/{abi.ts, client.ts, serverReads.ts, write.ts, write.test.ts, client.test.ts} # NEW (A3)
  treasury/{abi.ts, client.ts, serverReads.ts, client.test.ts} # NEW (A3)
  dividends/{abi.ts, client.ts, serverReads.ts, write.ts, write.test.ts, client.test.ts} # NEW (A3)
  validation/dashboard.ts + .test.ts        # NEW (A5) — Zod .strict schemas
config/
  contracts.ts                              # EDIT — add governance?/treasury?/distributor? + accessors
scripts/
  emit-contract-addresses.mjs               # EDIT — also emit governance/treasury/distributor
prisma/
  schema.prisma                             # EDIT — new off-chain-content models
  seed.ts                                   # NEW — migrate mockup arrays to seeds
  migrations/<ts>_wave7_dashboard/          # NEW — migration
test/
  integration/
    anvil-harness.ts                        # EDIT — emit governance/distributor; helpers
    governance-dividends-e2e.test.ts        # NEW (C1)
e2e/
  dashboard-screens.spec.ts                 # NEW (C2)
```

---

# GROUP A — FOUNDATION

---

## Task A1 — Dashboard shell (Sidebar + Topbar + MobileNavDrawer + session/citizen context + `useChainInfo`)

**Files:**
- NEW `lib/hooks/useChainInfo.ts` + `lib/hooks/useChainInfo.test.ts`
- NEW `components/shell/SessionCitizenProvider.tsx`
- NEW `components/shell/NavIcon.tsx`
- NEW `components/shell/Sidebar.tsx`
- NEW `components/shell/Topbar.tsx`
- NEW `components/shell/MobileNavDrawer.tsx`
- NEW `components/shell/DashboardShell.tsx` + `components/shell/DashboardShell.test.tsx`
- EDIT `app/dashboard/layout.tsx`

**READ FIRST:** `Dashboard.html` (lines 126–354 — `Seal`, `Wordmark`, `NavIcon`, `Sidebar`, `Topbar`, `App` shell, responsive CSS lines 19–48), `app/dashboard/layout.tsx` (the current 8-line guard), spec §7.3 + §7.13, `styles/tokens.css` (`.wrap`/`.kicker`/`.btn`/`.pillar` + the `@media` breakpoints), `components/ui/Seal.tsx` (reuse the octagonal seal), `components/ui/LiveNumber.tsx`, `lib/config/chain.ts` (`activeChain`), `lib/wallet/services/chainStats.ts` (`readChainStats`/`ChainStats`), `lib/passport/client.ts` (`readPassportStatus`), `components/wallet/WalletChainApp.tsx` (client-island + graceful-read pattern to mirror).

**Interfaces (exact):**
```ts
// lib/hooks/useChainInfo.ts
export interface ChainInfo {
  chainId: number;
  chainName: string;   // evmEntry(chainId).viemChain.name — NOT "CR-L2"/"7331"
  blockNumber: bigint | null;
  gasMaxFeePerGasWei: bigint | null;
  explorerBase: string | null;
  online: boolean;     // false when the read fails (renders "chain offline")
}
/** Polls readChainStats(activeChain().primaryChainId) every ~12s; degrades gracefully (never throws in render). */
export function useChainInfo(): ChainInfo;

// components/shell/SessionCitizenProvider.tsx
export interface CitizenContext {
  address: `0x${string}` | null;   // embedded/external EVM address (may be null: wallet not created)
  isCitizen: boolean;
  tokenId: bigint | null;          // resolved passport tokenId (for votes/claims) — null if not a citizen
  loading: boolean;
  refresh: () => void;
}
export function useCitizen(): CitizenContext;
export function SessionCitizenProvider({ children }: { children: React.ReactNode }): JSX.Element;

// components/shell/DashboardShell.tsx
export function DashboardShell({ children }: { children: React.ReactNode }): JSX.Element;
```

Implementation notes:
- **`SessionCitizenProvider`** ("use client") resolves the EVM address from `loadPublicAccounts()` (reuse the `hasVault`/`isUnlocked` pattern from `WalletChainApp.tsx`) then calls `readPassportStatus(chainId, address)` in a `try/catch` → sets `{ isCitizen, tokenId }`. On an unregistered chain (`passportAddress` throws) it catches and yields `{ isCitizen:false, tokenId:null }` (constraint #11). Exposes `useCitizen()`.
- **`Sidebar`** ports `Dashboard.html` `Sidebar`: nav items `home` / `governance` / `treasury` / `population` / `passport` / `holdings` / `embassies` / `wallet` (use `NavIcon` ported from `Dashboard.html` lines 170–184; reuse `components/ui/Seal.tsx` for the wordmark), the "MINT A PASSPORT" button (→ `/dashboard/mint`), and the bottom **Citizen card** reading `useCitizen()` (name/№/city from `useSession` + citizen state; "APPLICANT" state when `!isCitizen`). Active item derived from `usePathname()`. The governance nav badge = open-proposal count (from `/api/governance/proposals?status=open` — 0 on a fresh chain, so NO hardcoded `14`); the holdings `$` badge shows only when the citizen has an unclaimed dividend (from `/api/citizen/obligations`). Use `next/link`, NOT the mockup's `goto(id)` state machine.
- **`Topbar`** ports the title/subtitle-per-route map but the subtitles are LIVE, not fabricated: chain pill + block number from `useChainInfo()` (NOT "CHAIN ONLINE" static + "block 21 408 932"); a "← Site" link to `/`. Titles keyed by pathname. The mockup's hardcoded "QUORUM 73%" / "14:22 UTC" are replaced by the real UTC clock and OMITTED where not derivable.
- **`MobileNavDrawer`** — at `≤1024px` the sidebar becomes a slide-in drawer (burger toggle in `Topbar`); port the responsive CSS from `Dashboard.html` (`.cr-sidebar`/`.cr-backdrop`/`.cr-burger` + the `@media (max-width:1024px/860px/760px)` rules) into a shell CSS module or `styles/tokens.css`. `.cr-hide-sm` hides topbar meta at `≤860px`; two-column grids collapse at `≤760px`.
- **`DashboardShell`** composes `SessionCitizenProvider` > grid(`Sidebar` | `main`(`Topbar` + `{children}`)) + `MobileNavDrawer`. EXCLUDE the mockup's `TweaksUI`/`useTweaks` (dev-only, §7 note).
- **`app/dashboard/layout.tsx`**: keep `getSession()`/`redirect("/auth")`; wrap `{children}` in `<DashboardShell>`.

**TDD steps:**
1. [ ] RED — `useChainInfo.test.ts` (mock `readChainStats`): asserts it maps `{chainId,chainName,blockNumber,gasMaxFeePerGasWei,explorerBase, online:true}`; on a rejected read → `{online:false, blockNumber:null}` (no throw). `DashboardShell.test.tsx` (jsdom + RTL; mock `readPassportStatus`, `readChainStats`, wallet session): asserts the 8 nav items render with correct `href`s; the "MINT A PASSPORT" link points to `/dashboard/mint`; the Topbar shows the REAL chain name (NOT `/CR-L2|7331/`) and a live block; the Citizen card shows an "APPLICANT" state when `isCitizen` is false; the burger toggles the drawer; and when the passport accessor throws (unregistered chain) the shell still renders (graceful, no crash — constraint #11).
2. [ ] GREEN — implement the hook, provider, `NavIcon`, `Sidebar`, `Topbar`, `MobileNavDrawer`, `DashboardShell`; edit `layout.tsx`.
3. [ ] Run `pnpm test lib/hooks/useChainInfo.test.ts components/shell/DashboardShell.test.tsx` — green. Verify CSP still passes (no new external origins; fonts already handled by Wave 1).
4. [ ] Commit (with `Co-Authored-By` trailer).

---

## Task A2 — Prisma models + migration + seed (off-chain content)

**Files:**
- EDIT `prisma/schema.prisma`
- NEW `prisma/seed.ts`
- EDIT `package.json` — add `"db:seed": "tsx prisma/seed.ts"` (and Prisma `"seed"` hook) — READ the existing `scripts` block first; add `tsx` to devDeps if absent.
- NEW migration `prisma/migrations/<ts>_wave7_dashboard/`

**READ FIRST:** `prisma/schema.prisma` (existing models + the no-secrets INVARIANT comment + the `// DIVERGENCE:` convention + String-enum convention), `scripts/guard-no-secret-columns.sh` (what column names trip it), the mockup arrays to migrate — `dash-holdings.jsx` `ASSETS` (lines 13–38), `dash-population-embassies.jsx` `CITIES` (9–22) + `EMB` (230–240) + Top-cities (106–113), `dash-gov-treasury.jsx` `ALLOC` (177–183) + `AMENDMENTS` (10–16) + dissent (131–134), `dash-holdings.jsx` doctrine text (196–200), `lib/db.ts`.

**New models (ALL PUBLIC content — no secret columns; String-enum convention):**

```prisma
/// Off-chain rich content for an on-chain CryptGovernance proposal. Linked to the
/// on-chain proposalId; tallies + state ALWAYS read from chain, never here.
model GovernanceProposalContent {
  id              String   @id @default(cuid())
  chainId         Int
  proposalId      String   // on-chain proposalId (stringified uint256)
  title           String
  tag             String   // PROCEDURAL|CULTURAL|FISCAL|CIVIC|TECHNICAL (union)
  body            String   // rich text / markdown
  descriptionHash String?  // 0x bytes32 — MUST match the on-chain proposal.descriptionHash
  createdAt       DateTime @default(now())
  comments        ProposalComment[]
  @@unique([chainId, proposalId])
  @@index([chainId, tag])
}

/// A dissent/discussion comment on a proposal (the "Dissent on the floor" thread).
model ProposalComment {
  id            String   @id @default(cuid())
  proposalRef   GovernanceProposalContent @relation(fields: [proposalContentId], references: [id], onDelete: Cascade)
  proposalContentId String
  authorAddress String   // checksummed EVM address (citizen; verified on-chain at write time)
  citizenTokenId String? // resolved tokenId (display "Citizen №…")
  body          String
  upvotes       Int      @default(0)
  createdAt     DateTime @default(now())
  @@index([proposalContentId])
}

/// Sovereign-holdings asset register (the mockup ASSETS array). Off-chain by nature.
model AssetCatalogEntry {
  id             String   @id @default(cuid())
  ref            String   @unique // "RE-001" etc.
  kind           String   // re|ip|eq|tr
  name           String
  location       String
  valueUsd       BigInt   // USD cents or whole USD — pick one and document; use whole USD
  yieldBps       Int      // 480 = 4.8%
  annualYieldUsd BigInt
  status         String
  acquiredAt     String   // freeform ("2024.11.04" / "ongoing")
  @@index([kind])
}

/// Embassy directory (the mockup EMB array). Off-chain by nature.
model EmbassyDirectory {
  code         String   @id // "LIS"
  name         String
  neighborhood String
  hours        String
  foundedAt    String
  brandColor   String
  city         String
  country      String
}

/// Per-city census node — coords for the map + top-cities. See population-count note below.
model CityCensus {
  code      String  @id // "LIS"
  name      String
  lat       Float
  long      Float
  hasEmbassy Boolean @default(false)
  // Seeded snapshot count — SUPPLEMENTED, and where possible SUPERSEDED, by live
  // aggregation of CitizenProfile.domicileCity (see note). Never presented as live
  // unless it is actually derived live.
  seededCount Int   @default(0)
}

/// Treasury allocation TARGETS (the mockup ALLOC array) — governance-ratified intent,
/// NOT live balances. Live balances read from CryptTreasury.balanceOf.
model TreasuryAllocation {
  id       String @id @default(cuid())
  bucket   String @unique // "embassy_ops" — matches an on-chain allocationBps bucket key when set
  label    String
  targetBps Int   // 3800 = 38%
  color    String
}

/// Constitution / doctrine text (preamble, Article IV doctrine, etc.).
model ConstitutionText {
  id        String @id @default(cuid())
  key       String @unique // "preamble" | "doctrine_art_iv" | "dividend_legal_note"
  title     String
  body      String
  citation  String? // "CONSTITUTION ART. IV §1 · RATIFIED MMXXVI"
}
```

**Population-count honesty decision (be explicit in the seed + API):** the true trustless census count is `CryptRepublicPassport.totalCitizens()` — the total citizen bar/hero uses THAT (live). Per-city breakdown is NOT on-chain (the passport stores a hashed `domicile`, not a plaintext city). So per-city counts come from **live aggregation of self-declared `CitizenshipApplication.domicileCity`** (Wave 2 model) where citizens exist; on a fresh chain that is ~0, so the map/top-cities render an honest empty/low state. `CityCensus.seededCount` provides coords + a labeled `SEEDED SNAPSHOT` figure ONLY as demonstrative geography (tagged `SEEDED` in the UI), never merged into the live total. Document this in `prisma/seed.ts` and the `/api/population/census` route.

Seed (`prisma/seed.ts`): migrate `ASSETS` → `AssetCatalogEntry` (convert `val`→`valueUsd`, `yld`→`yieldBps` = round(yld*100), `ann`→`annualYieldUsd`); `EMB` → `EmbassyDirectory` + `CITIES` → `CityCensus` (join by code; `hasEmbassy` from `EMB` presence; `seededCount` from `CITIES.pop`); `ALLOC` → `TreasuryAllocation` (`pct`→`targetBps`); doctrine + preamble + a `dividend_legal_note` → `ConstitutionText`. Do NOT seed governance proposal content or comments (those are created against real on-chain proposalIds; on a fresh chain there are none). Seed idempotently (`upsert`).

**Scrub fabricated on-chain provenance from the seeded catalog strings (constraint #5 / §7.13 — CR-L2 chrome + false on-chain claims must NOT ride along inside seeded content).** The migration must not copy the `name`/`loc`/`status` strings verbatim: those strings assert on-chain provenance that does not exist on the real chain (e.g. `RE-001..007 status "OWNED · TITLED ON CHAIN"` for off-chain real estate; `EQ-001 name "Validator Pool §14 — CryptRepublic L2"` / `loc "Chain · CR-L2"` / `status "STAKED · 16% NETWORK"`). When seeding `AssetCatalogEntry`, drop or genericize any `CR-L2` / `CryptRepublic L2` / `TITLED ON CHAIN` / `16% NETWORK` token in `name`/`loc`/`status` (e.g. status `OWNED · TITLED ON CHAIN` → `OWNED (demonstrative)`, `STAKED · 16% NETWORK` → `STAKED (demonstrative)`; `loc "Chain · CR-L2"` → a neutral off-chain descriptor; strip `CryptRepublic L2` from names) so the seeded register never claims on-chain title/provenance for these off-chain demonstrative assets. This is the same scrub applied to the `useChainInfo` chain-telemetry surface, extended to seeded content.

**TDD steps:**
1. [ ] RED — `prisma/seed.test.ts` (`@vitest-environment node`): run the seed against the dev DB, then assert counts (`AssetCatalogEntry` = 17 — 7 real-estate `RE-001..007` + 4 IP `IP-001..004` + 3 equity `EQ-001..003` + 3 treasury `TR-001..003`; `EmbassyDirectory` = 9, `CityCensus` = 12, `TreasuryAllocation` = 5, `ConstitutionText` ≥ 3) and a spot check (e.g. `AssetCatalogEntry` `RE-001` `valueUsd === 28_400_000n`, `yieldBps === 480`). ALSO assert the provenance scrub: NO seeded `AssetCatalogEntry` (`name`/`loc`/`status`) matches `/CR-L2|CryptRepublic L2|TITLED ON CHAIN/` (query all rows, assert none match the regex). Re-running is idempotent (counts unchanged).
2. [ ] GREEN — add the models to `schema.prisma`; `pnpm prisma migrate dev --name wave7_dashboard`; `pnpm db:generate`; write `prisma/seed.ts`; run it.
3. [ ] Run `pnpm guard:secrets` (MUST stay green — no `privateKey`/`seedPhrase`/`mnemonic`/`plaintextPassword`/`secretKey` columns), then `pnpm test prisma/seed.test.ts`.
4. [ ] Commit.

---

## Task A3 — Contract client layer (ABIs + read clients + serverReads + embedded writes + registry accessors + emit script)

**Files:**
- NEW `lib/governance/abi.ts`, `lib/treasury/abi.ts`, `lib/dividends/abi.ts`
- NEW `lib/governance/client.ts` + `.test.ts`, `lib/treasury/client.ts` + `.test.ts`, `lib/dividends/client.ts` + `.test.ts`
- NEW `lib/governance/serverReads.ts`, `lib/treasury/serverReads.ts`, `lib/dividends/serverReads.ts`
- NEW `lib/governance/write.ts` + `.test.ts` (castVote + propose), `lib/dividends/write.ts` + `.test.ts` (claim + claimMany)
- EDIT `config/contracts.ts` — add `governance?`/`treasury?`/`distributor?` + throwing accessors
- EDIT `scripts/emit-contract-addresses.mjs` — also emit governance/treasury/distributor

**READ FIRST:** the three contract sources (`CryptGovernance.sol`, `CryptTreasury.sol`, `DividendDistributor.sol`) + `contracts/src/lib/Roles.sol`; `lib/passport/abi.ts` (the `parseAbi` FROZEN-comment convention); `lib/passport/client.ts` + `lib/passport/serverReads.ts` (the browser vs server read split to mirror EXACTLY); `lib/wallet/services/staking.ts` (the FROZEN `writeEmbedded` helper — COPY its shape verbatim); `lib/passport/mint.ts` (`submitMintExternal` — the wagmi external path); `config/contracts.ts` (the `passportAddress`/`stakingAddress` accessor shape); `scripts/emit-contract-addresses.mjs` (already emits passport/token/staking — add three more `findAddress` calls).

**ABIs (`parseAbi`, byte-match the sources):**
```ts
// lib/governance/abi.ts — FROZEN, byte-matches CryptGovernance.sol external surface
export const governanceAbi = parseAbi([
  "function proposalCount() view returns (uint256)",
  "function getVotes(uint256 proposalId) view returns (uint256 forVotes, uint256 againstVotes, uint256 abstainVotes, uint256 snapshotCitizens)",
  "function state(uint256 proposalId) view returns (uint8)", // State enum
  "function voteByPassport(uint256 proposalId, uint256 tokenId) view returns (uint8)", // Vote enum
  "function quorumBps() view returns (uint16)",
  "function votingPeriod() view returns (uint256)",
  "function minCitizensForProposal() view returns (uint256)",
  "function proposals(uint256) view returns (address proposer, uint64 start, uint64 end, uint256 snapshotCitizens, uint256 forVotes, uint256 againstVotes, uint256 abstainVotes, bool executed, bool cancelled, bytes32 descriptionHash, address target, uint256 value, bytes callData)",
  "function propose(address target, uint256 value, bytes callData, bytes32 descriptionHash) returns (uint256 proposalId)",
  "function castVote(uint256 proposalId, uint256 tokenId, uint8 support)",
  "event ProposalCreated(uint256 indexed proposalId, address indexed proposer, address target, bytes32 descriptionHash)",
  "event VoteCast(uint256 indexed proposalId, uint256 indexed tokenId, address indexed voter, uint8 support)",
]);
export const VOTE = { None: 0, For: 1, Against: 2, Abstain: 3 } as const;
export const PROPOSAL_STATE = ["Pending","Active","Defeated","Queued","Succeeded","Executed","Cancelled"] as const;

// lib/treasury/abi.ts — FROZEN
export const treasuryAbi = parseAbi([
  "function balanceOf(address token) view returns (uint256)",
  "function allocationBps(bytes32 bucket) view returns (uint16)",
  "function totalAllocationBps() view returns (uint16)",
  "function assetWhitelist(address token) view returns (bool)",
  "event Disbursed(address indexed token, address indexed to, uint256 amount)",
  "event DividendsFunded(address indexed distributor, uint256 amount, uint256 indexed epochId)",
]);

// lib/dividends/abi.ts — FROZEN
export const dividendsAbi = parseAbi([
  "function currentEpoch() view returns (uint256)",
  "function epochs(uint256) view returns (uint256 amount, uint256 snapshotCitizens, uint256 perCitizen, uint64 openedAt, bool open)",
  "function claimable(uint256 epochId, uint256 tokenId) view returns (uint256)",
  "function claimed(uint256 epochId, uint256 tokenId) view returns (bool)",
  "function claim(uint256 epochId, uint256 tokenId)",
  "function claimMany(uint256 epochId, uint256[] tokenIds)",
  "event EpochOpened(uint256 indexed epochId, uint256 amount, uint256 snapshotCitizens, uint256 perCitizen)",
  "event DividendClaimed(uint256 indexed epochId, uint256 indexed tokenId, address indexed to, uint256 amount)",
]);
```

**`config/contracts.ts` additions (mirror `passportAddress`/`stakingAddress`):**
```ts
export interface ContractEntry {
  passport?: `0x${string}`; token?: `0x${string}`; staking?: `0x${string}`;
  governance?: `0x${string}`;   // NEW
  treasury?: `0x${string}`;     // NEW
  distributor?: `0x${string}`;  // NEW
}
export function governanceAddress(chainId: number): `0x${string}`; // throws when unregistered
export function treasuryAddress(chainId: number): `0x${string}`;   // throws when unregistered
export function distributorAddress(chainId: number): `0x${string}`;// throws when unregistered
// Non-throwing availability probes (constraint #11):
export function governanceAvailable(chainId: number): boolean;     // Boolean(contractEntry(chainId).governance)
export function treasuryAvailable(chainId: number): boolean;
export function distributorAvailable(chainId: number): boolean;
```

**Read clients** (`lib/*/client.ts`, `"client-only"`, mirror `lib/passport/client.ts`): every read via `publicClientFor(chainId)`.
```ts
// lib/governance/client.ts
export interface ProposalTally { forVotes: bigint; againstVotes: bigint; abstainVotes: bigint; snapshotCitizens: bigint; }
export interface OnchainProposal { proposalId: bigint; state: string; tally: ProposalTally; start: bigint; end: bigint; proposer: `0x${string}`; descriptionHash: `0x${string}`; }
export function readProposalCount(chainId: number): Promise<bigint>;
export function readProposal(chainId: number, proposalId: bigint): Promise<OnchainProposal>; // getVotes + state + proposals()
export function readMyVote(chainId: number, proposalId: bigint, tokenId: bigint): Promise<number>; // Vote enum
export function readGovernanceParams(chainId: number): Promise<{ quorumBps: number; votingPeriod: bigint; minCitizensForProposal: bigint }>;

// lib/treasury/client.ts
export interface TreasuryReserves { cryptWei: bigint; ethWei: bigint; }
export function readTreasuryReserves(chainId: number): Promise<TreasuryReserves>; // balanceOf(crypt) + balanceOf(address0)
export function readDisbursements(chainId: number): Promise<Disbursement[]>; // getLogs(Disbursed) → {token,to,amount,blockNumber,txHash}

// lib/dividends/client.ts
export interface EpochInfo { epochId: bigint; amount: bigint; snapshotCitizens: bigint; perCitizen: bigint; openedAt: bigint; open: boolean; }
export function readCurrentEpoch(chainId: number): Promise<bigint>;
export function readEpoch(chainId: number, epochId: bigint): Promise<EpochInfo>;
export function readClaimable(chainId: number, epochId: bigint, tokenId: bigint): Promise<bigint>;
export function readDividendHistory(chainId: number, tokenId: bigint): Promise<DividendClaim[]>; // getLogs(DividendClaimed, {tokenId})
```

**serverReads** (`lib/*/serverReads.ts`, `"server-only"`, mirror `lib/passport/serverReads.ts`): the SAME reads via `createPublicClient({transport: http(serverRpcUrl(chainId))})` for the API routes (route handlers can't import `client-only` modules). Include `readProposalCountServer`, `readProposalServer`, `readMyVoteServer` (`voteByPassport(proposalId, tokenId)`), `readGovernanceParamServer` (proposer/descriptionHash via `proposals(proposalId)` for the propose-embassy binding, Task B6), `readTreasuryReservesServer`, `readDisbursementsServer`, `readCurrentEpochServer`, `readEpochServer`, `readClaimableServer` (`claimable(epochId, tokenId)`), `readDividendHistoryServer`, and reuse `readHasPassportServer` from `lib/passport/serverReads.ts` for citizen-gated writes.

**Server-side passport `tokenId` resolver (REQUIRED — `/api/citizen/obligations` and the propose-embassy binding cannot resolve `tokenId` otherwise).** `lib/passport/client.ts` `readPassportStatus` (the only existing tokenId resolver via the `CitizenMinted` log query, lines 88–137) is `import "client-only"` at line 1, so a route handler literally cannot import it. Add a NEW server-only resolver to `lib/passport/serverReads.ts` that MIRRORS `readPassportStatus`'s `CitizenMinted`-log query but via `createPublicClient(serverRpcUrl(chainId))` (same shape as the existing `readHasPassportServer`):
```ts
// lib/passport/serverReads.ts (NEW — mirrors readPassportStatus's CitizenMinted-log path, server-side)
export interface PassportStatusServer { isCitizen: boolean; tokenId: bigint | null; }
export function readPassportStatusServer(chainId: number, who: Address): Promise<PassportStatusServer>;
```
It reuses the SAME `getLogs({ event: CitizenMinted, args:{ citizen: who }, fromBlock: 0n })` → `logs[0].args.tokenId` logic (returning `{ isCitizen:false, tokenId:null }` when there is no matching log, defensively — never throwing). **List `readPassportStatusServer` in this A3 serverReads inventory** so the obligations route (A5) and the propose-embassy binding (B6) can resolve `tokenId` server-side.

**Writes** (`lib/*/write.ts`, `"client-only"`) — COPY the FROZEN `writeEmbedded` helper from `staking.ts` VERBATIM (simulate → withEvmSigner → sign eip1559 → sendRawTransaction → **waitForTransactionReceipt → throw on non-success**). Add an EXTERNAL wagmi path mirroring `submitMintExternal`.
```ts
// lib/governance/write.ts
export function castVoteEmbedded(chainId: number, proposalId: bigint, tokenId: bigint, support: number): Promise<`0x${string}`>;
export function castVoteExternal(walletClient: WalletClient, chainId: number, proposalId: bigint, tokenId: bigint, support: number): Promise<`0x${string}`>;
export function proposeEmbedded(chainId: number, target: `0x${string}`, value: bigint, callData: `0x${string}`, descriptionHash: `0x${string}`): Promise<{ txHash: `0x${string}`; proposalId: bigint }>; // parse ProposalCreated
export function proposeExternal(walletClient: WalletClient, chainId: number, target: `0x${string}`, value: bigint, callData: `0x${string}`, descriptionHash: `0x${string}`): Promise<{ txHash: `0x${string}`; proposalId: bigint }>;

// lib/dividends/write.ts
export function claimDividendEmbedded(chainId: number, epochId: bigint, tokenId: bigint): Promise<`0x${string}`>;
export function claimDividendExternal(walletClient: WalletClient, chainId: number, epochId: bigint, tokenId: bigint): Promise<`0x${string}`>;
export function claimManyEmbedded(chainId: number, epochId: bigint, tokenIds: bigint[]): Promise<`0x${string}`>;
```
For signalling proposals (propose-embassy off-chain content, Task B6), `target=treasuryAddress` is disallowed unless a real payload exists — for a pure off-chain-content proposal use `target=0x0`, `value=0`, `callData=0x`, and a real `descriptionHash` (the on-chain record is signalling; `execute` reverts `EmptyPayload` by design, which is correct for signalling).

**emit script (`scripts/emit-contract-addresses.mjs`):** add `const governance = findAddress("CryptGovernance");`, `const treasury = findAddress("CryptTreasury");`, `const distributor = findAddress("DividendDistributor");` and push `governance:`/`treasury:`/`distributor:` into `entryFields` when present (mirror the existing `if (token) entryFields.push(...)` / `if (staking) ...` blocks) + `console.log` lines. Do NOT change the single-line-replace regex.

**TDD steps:**
1. [ ] RED — add `config/contracts.test.ts` cases: `governanceAddress`/`treasuryAddress`/`distributorAddress` throw when unregistered; the `*Available` probes return false; `contractEntry(99999)` is `{}`. `lib/passport/serverReads.test.ts` (mock `createPublicClient`): `readPassportStatusServer` returns `{ isCitizen:true, tokenId }` from a matching `CitizenMinted` log and `{ isCitizen:false, tokenId:null }` (no throw) when no log matches — mirroring `readPassportStatus`. `lib/governance/client.test.ts` (mock `publicClientFor`): `readProposal` maps `getVotes` + `state` into `OnchainProposal` with the correct `PROPOSAL_STATE[state]` label; `readProposalCount` returns the bigint. `lib/dividends/client.test.ts`: `readEpoch` maps the 5-tuple; `readClaimable` returns the bigint. `lib/treasury/client.test.ts`: `readTreasuryReserves` reads `balanceOf(crypt)` + `balanceOf(0x0)`. `lib/governance/write.test.ts` + `lib/dividends/write.test.ts` (mock `publicClientFor` + `withEvmSigner`, mirroring `staking.test.ts`): assert the embedded path records ONLY `eth_call`/`eth_estimateGas`/`eth_getTransactionCount`/`eth_sendRawTransaction` and NEVER `eth_sendTransaction`/`personal_sign`/`eth_sign`/`eth_accounts`; `castVoteEmbedded` encodes `castVote(proposalId, tokenId, support)` with the exact args (decode calldata); each embedded writer awaits `waitForTransactionReceipt` and THROWS when the mocked receipt is `reverted`, returns the hash when `success`.
2. [ ] GREEN — implement ABIs, accessors, clients, serverReads, writes; edit the emit script.
3. [ ] Run `pnpm test config/contracts.test.ts lib/governance lib/treasury lib/dividends` — green. Eyeball the emit-script diff (its correctness is proven by C1's integration run).
4. [ ] Commit.

---

## Task A4 — Shared UI: `<TxButton>`, `<Spark>`, `<Ledger>`, `<Modal>`

**Files:**
- NEW `components/ui/TxButton.tsx` + `components/ui/TxButton.test.tsx`
- NEW `components/ui/Spark.tsx` + `components/ui/Spark.test.tsx`
- NEW `components/ui/Ledger.tsx`
- NEW `components/ui/Modal.tsx` + `components/ui/Modal.test.tsx`

**READ FIRST:** `components/wallet/StakePanel.tsx` (the idle → busy → txHash → error state machine to standardize + its `data-testid` conventions), `components/wallet/UnlockWalletModal.tsx` (modal chrome pattern), `components/wallet/SwapBridgeModal.tsx` (the TESTNET-MOCK banner), `lib/wallet/services/staking.ts` (`writeEmbedded` receipt-wait semantics `<TxButton>` must reflect), spec §7.13 (`TxButton` four states + `TESTNET`/`SIMULATED`), `styles/tokens.css` (`.btn`/`.btn-primary`/`.pillar`/`.wrap`), the mockup `Spark` (`dash-holdings.jsx` lines 381–403) and the treasury spark (`dash-gov-treasury.jsx` 158–230).

**`<TxButton>` (exact):**
```ts
export type TxState = "idle" | "pending" | "mining" | "success" | "error";
export interface TxButtonProps {
  label: string;
  /** Runs the write; resolves with a tx hash. Throws on revert (writeEmbedded already throws). */
  onRun: () => Promise<`0x${string}`>;
  /** Unlock gate for the EMBEDDED path (return false → gate opened, do not run). */
  requireReady?: () => boolean;
  explorerBase?: string | null;   // for the success explorer link
  onSuccess?: (hash: `0x${string}`) => void; // refresh reads
  disabled?: boolean;
  disabledReason?: string;         // e.g. "Mint your passport to participate"
  testnet?: boolean;               // renders a TESTNET tag
  simulated?: boolean;             // renders a SIMULATED tag
  confirm?: React.ReactNode;       // optional human-readable confirm shown before onRun
}
```
State machine: `idle` → (confirm, if provided) → `pending` (wallet signature) → `mining` (spinner + "submitting…"; the returned hash is available once `sendRawTransaction` resolves inside `onRun`) → `success` (✓ + explorer link + calls `onSuccess`) OR `error` (revert reason surfaced via `role="alert"`). For the embedded path, `requireReady()` gates before `pending`; for external, the caller passes a connect+correct-chain gate. Renders `TESTNET`/`SIMULATED` chips when the flags are set. Do NOT invent a signing path — `onRun` is always the caller's `*Embedded`/`*External` writer.

**`<Spark>`** — a pure SVG sparkline from a `readonly number[]` (extract the mockup `Spark`); NO random data generation baked in (callers pass a real series or an explicit representative one). Accepts `points`, `color`, `bg`, `width`, `height`. Renders an empty/flat state for `[]`.

**`<Ledger>`** — a generic table primitive: `columns: {key,label,align?}[]` + `rows`, an empty-state slot, and the mono/uppercase header styling from the mockups' ledgers (governance disbursements / holdings register / activity). Reused by B2/B3/B4.

**`<Modal>`** — the modal wrapper (backdrop + focus trap + Close button) extracted from `UnlockWalletModal`; reused by B2 (cast-vote), B4 (claim), B6 (propose-embassy).

**TDD steps:**
1. [ ] RED — `TxButton.test.tsx`: idle click with `requireReady`→false opens the gate and does NOT call `onRun`; a resolving `onRun` transitions to `success` and renders the explorer link + calls `onSuccess`; a rejecting `onRun` renders the revert message in `role="alert"` and NEVER shows success; `disabled` renders `disabledReason`; `testnet`/`simulated` render their chips. `Spark.test.tsx`: renders a `<path>` for a non-empty series and an empty state for `[]`. `Modal.test.tsx`: renders children, Close fires `onClose`, Escape closes.
2. [ ] GREEN — implement all four.
3. [ ] Run `pnpm test components/ui/TxButton.test.tsx components/ui/Spark.test.tsx components/ui/Modal.test.tsx` — green.
4. [ ] Commit.

---

## Task A5 — API routes (Zod `.strict` + session + `isAllowedOrigin` on mutations; on-chain verify where citizen-gated)

**Files:** NEW route files under `app/api/*` (listed in File Structure) + a `.test.ts` beside EACH mutation route and at least one representative GET test per contract-backed route; NEW `lib/validation/dashboard.ts` + `.test.ts`.

**READ FIRST:** `app/api/applications/attest/route.ts` + `app/api/applications/attest/route.test.ts` (the EXACT mutation-route shape to copy: `isAllowedOrigin` → `requireSession` (catch `Response`) → `req.json()` → `schema.safeParse` → prisma; and the node-env test with `origin`/`cookieToken` helpers, 403/401/400/happy-path cases); `lib/auth/guard.ts` (`requireSession`/`getSessionFromRequest`), `lib/auth/csrf.ts` (`isAllowedOrigin`), `lib/http/responses.ts` (`json`/`badRequest`/`forbidden`/`unauthorized`), `lib/applications/applicant.ts` (`resolveApplicantAddress(userId)` — the canonical verified-`LinkedWallet` resolver reused VERBATIM by both citizen-gated POSTs and by `/api/citizen/obligations`; constraint #12), `lib/passport/serverReads.ts` (`readHasPassportServer` for citizen-gating off-chain writes; `readPassportStatusServer` for server-side `tokenId` resolution — Task A3), `lib/validation/mint.ts` (the Zod `.strict()` convention), `lib/db.ts`, and the Task A3 `serverReads` modules.

**Route table (method · Zod schema (mutations) · auth · data source):**

| Route | Method | Auth | Data source |
|---|---|---|---|
| `/api/citizen/obligations` | GET | session | FIRST `resolveApplicantAddress(userId)` → `readPassportStatusServer(chainId, address)` → `tokenId` (server-side; skip the chain reads and return an empty obligations set when `address==null` or not a citizen), THEN chain: unvoted OPEN proposals (`readMyVoteServer`=`voteByPassport` per open id) + pending witness (DB) + unclaimed dividend (`readClaimableServer(currentEpoch, tokenId)`) |
| `/api/governance/proposals` | GET (`?status=open\|all`) | session | MERGE on-chain (`proposalCount`, per-id `getVotes`+`state`) with DB `GovernanceProposalContent` (title/tag/body). Fresh chain → `[]`. |
| `/api/governance/proposals/[id]` | GET | session | chain (tally+state) + DB content |
| `/api/governance/proposals/[id]/comments` | GET / **POST** | session (+ **on-chain citizen check** on POST) | DB `ProposalComment` |
| `/api/treasury/allocations` | GET | session | DB `TreasuryAllocation` (targets) + on-chain `allocationBps` when set |
| `/api/treasury/flows` | GET | session | chain: `Disbursed` logs (EXECUTED); DB-labeled PENDING/PROPOSED where applicable |
| `/api/treasury/summary` | GET | session | chain: `readTreasuryReserves` (honest: real balances, ~0 on fresh chain) |
| `/api/holdings/assets` | GET | session | DB `AssetCatalogEntry` + computed composition/totals |
| `/api/holdings/dividends` | GET | session | chain: `DividendClaimed` logs for the caller's tokenId |
| `/api/population/census` | GET | (public-readable) session | chain `totalCitizens()` (live total) + live aggregation of `CitizenshipApplication.domicileCity` + DB `CityCensus` (coords + SEEDED snapshot, tagged) |
| `/api/embassies` | GET | session | DB `EmbassyDirectory` |
| `/api/embassies/[code]` | GET | session | DB + live per-city citizen count (see A2 note) |
| `/api/embassies/proposals` | **POST** | session (+ **on-chain citizen check**) | DB (off-chain content for a proposed embassy; the on-chain `propose` tx is signed client-side, its id posted here) |
| `/api/constitution` | GET | session | DB `ConstitutionText` |
| `/api/stats/summary` | GET | (public) | chain `totalCitizens()` |
| `/api/stats/activity` | GET | session | chain events (CitizenMinted / VoteCast / Disbursed / DividendClaimed) block-sorted |
| `/api/stats/census` | GET | session | chain `CitizenMinted` logs (24h delta) |
| `/api/stats/inductions` | GET | session | chain `CitizenMinted` logs (recent) |

**Mutation rules (constraint #4 + #12):** EVERY POST calls `isAllowedOrigin(req)` (→ `forbidden()`) + `requireSession(req)` (catch the thrown `Response`) + a Zod `.strict()` schema (→ `badRequest()`). The two citizen-gated OFF-CHAIN writes (`POST /governance/proposals/[id]/comments`, `POST /embassies/proposals`) MUST resolve the caller's verified EVM address by calling the canonical existing helper **`resolveApplicantAddress(userId)` from `lib/applications/applicant.ts` VERBATIM** (it already `findFirst`s a `LinkedWallet` where `chain==="EVM"` AND `verifiedAt != null` and returns the checksummed address — do NOT re-derive this, and do NOT trust a client-supplied address or a stale `application.applicantAddress` bound at witness-request time), then call `readHasPassportServer(chainId, resolvedAddress)`. Reject with `forbidden()` if `resolveApplicantAddress` returns `null` OR `readHasPassportServer` is false. NEVER trust a client `isCitizen` field.

**Propose-embassy authorship binding (constraint #4 + #5 honesty — `POST /embassies/proposals`).** Verifying the caller is *a* citizen is NOT sufficient: the client-supplied `proposalId` MUST be bound to the caller and to the submitted content, or any citizen could attach arbitrary off-chain content to another citizen's `proposalId` (authorship spoofing) or cite a `proposalId`/`txHash` that does not correspond to the content. So for the create path this route ALSO:
- reads the on-chain proposal server-side via `readGovernanceParamServer` (`proposals(proposalId).proposer`) and rejects with `forbidden()` unless `proposer === resolveApplicantAddress(userId)` (checksum-compared);
- computes `keccak256` of the canonical proposal content and rejects with `badRequest()` unless it equals the on-chain `proposals(proposalId).descriptionHash`.
`proposalId` (and therefore the derived `descriptionHash`) is **REQUIRED, not optional**, for the create path (see the schema note below).

`lib/validation/dashboard.ts` (Zod `.strict`, mirror `lib/validation/mint.ts`): `commentSchema` (`{ proposalId: numericString, body: string.min(1).max(2000) }`), `proposeEmbassySchema` (`{ code: string.min(2).max(8), name, neighborhood, city, country, proposalId: numericString, txHash: hex }` — **`proposalId` and `txHash` are REQUIRED, not optional**, because the route binds the off-chain content to the on-chain proposal's `proposer` + `descriptionHash`; a proposal with no on-chain id cannot pass the authorship/hash binding). No secret fields.

**TDD steps (per mutation route + one representative GET per contract source):**
1. [ ] RED — for `POST /governance/proposals/[id]/comments` and `POST /embassies/proposals` write node-env tests mirroring `attest/route.test.ts`: 403 foreign origin, 401 no session, 400 invalid body (unknown key rejected), **403 when `resolveApplicantAddress(userId)` returns `null`** (mock → null), **403 when the resolved address is NOT an on-chain citizen** (mock `readHasPassportServer` → false), happy path (mock `resolveApplicantAddress` → verified address, `readHasPassportServer` → true) persists to DB. For `POST /embassies/proposals` ADD: **403 when `readGovernanceParamServer(proposalId).proposer !== resolveApplicantAddress(userId)`** (authorship-spoof rejected), **400 when `keccak256(canonical content) !== on-chain descriptionHash`** (content/hash mismatch rejected), and **400 when `proposalId`/`txHash` are absent** (now required). For `/api/citizen/obligations` (GET), test that a session whose `resolveApplicantAddress` → null (or `readPassportStatusServer` → not a citizen) returns an empty obligations set WITHOUT hitting `voteByPassport`/`claimable`, and that a citizen (mock `readPassportStatusServer` → `{isCitizen:true, tokenId}`) resolves obligations via `readMyVoteServer`/`readClaimableServer` keyed by that `tokenId`. For a representative GET (e.g. `/api/governance/proposals`), test that a fresh chain (mock `readProposalCountServer` → 0) returns `[]` (honest empty) and that DB content merges when proposals exist.
2. [ ] GREEN — implement `lib/validation/dashboard.ts` + all routes.
3. [ ] Run `pnpm test app/api` (the new route tests) — green.
4. [ ] Commit.

---

# GROUP B — SCREENS

> Each B-task: a Server Component `page.tsx` mounting a `"use client"` island; ports the mockup layout using the design system (`components/ui/*` + `styles/tokens.css`, squared corners, Archivo/IBM Plex Mono, navy/blue/gold); wires reads (chain via `lib/*/client.ts` + `/api/*`) + writes (via `lib/*/write.ts` through `<TxButton>`); implements the FULL state matrix (loading skeleton / empty in-voice / per-card error+retry / not-yet-citizen vs citizen); and contains NO hardcoded data. Every screen replaces the mockup's fabricated block/chain chrome with `useChainInfo()`.

---

## Task B1 — Citizen home (§7.5)

**Files:** NEW `app/dashboard/page.tsx` + `components/home/CitizenHomeApp.tsx` + `.test.tsx`; NEW `components/home/{Salutation,ObligationsList,StatRow,RepublicLedger,PassportRailCard,CensusTickerCard}.tsx`.

**READ FIRST:** `dash-home.jsx` (`HomeScreen` — salutation, obligations, 4× StatTile, ledger, passport rail, events, census ticker), spec §7.5, `components/ui/{StatTile,LiveNumber,Card}.tsx`, Task A1 `useCitizen`/`useChainInfo`, Task A3 clients, Task A5 `/api/citizen/obligations` + `/api/stats/activity` + `/api/stats/summary`, `components/wallet/WalletChainApp.tsx` (client-island graceful-read pattern).

Wire: salutation from `useCitizen()` + `useChainInfo()` (real block, not "21 408 932"); `ObligationsList` from `/api/citizen/obligations` (unvoted open proposals + pending witness + unclaimed dividend — 0 obligations honestly on a fresh chain, or a single "Mint your passport" for a non-citizen); `StatRow` from real reads (vote count via `VoteCast` logs for the citizen's tokenId, `$CRYPT` balance via `CryptToken.balanceOf` + staking, activity count); `RepublicLedger` from `/api/stats/activity` (block-sorted; empty state, never the mockup's 6 demo rows); `CensusTickerCard` seeds `LiveNumber` from `totalSupply()`/`totalCitizens()`. Not-yet-citizen → "Welcome, applicant" + one "Mint your passport" obligation (§7.5).

**TDD steps:**
1. [ ] RED — `CitizenHomeApp.test.tsx` (mock clients + `/api/*` fetches + `useCitizen`): loading skeleton renders; a citizen with 0 on-chain proposals shows the honest empty obligations state (NOT fabricated "3 obligations"); a not-yet-citizen shows "Welcome, applicant" + the mint obligation; the salutation shows the REAL block (not `/21 408 932/`); a per-card fetch error renders a retry, not a blank screen.
2. [ ] GREEN — implement page + island + subcomponents.
3. [ ] Run `pnpm test components/home` — green.
4. [ ] Commit.

---

## Task B2 — Governance (§7.8) + `castVote` write (passport-gated, weight 1)

**Files:** NEW `app/dashboard/governance/page.tsx` + `components/governance/GovernanceApp.tsx` + `.test.tsx`; NEW `components/governance/{AmendmentList,AmendmentDetail,VoteTally,CastVotePanel,DissentThread}.tsx`.

**READ FIRST:** `dash-gov-treasury.jsx` (`GovernanceScreen` — list, detail, tally bar, cast panel, dissent thread), spec §7.8 + §6.4, `CryptGovernance.sol` (enum ORDER incl. `Queued`; `getVotes`; `castVote` requirements), `lib/governance/client.ts` + `lib/governance/write.ts` (Task A3), Task A5 `/api/governance/proposals` + `[id]` + `[id]/comments`, `components/ui/TxButton.tsx` + `Modal.tsx` (Task A4), `components/wallet/StakePanel.tsx` (write state machine to mirror), `lib/passport/client.ts` (`readPassportStatus` → tokenId).

Wire: `AmendmentList` + `AmendmentDetail` from `/api/governance/proposals` (DB title/tag/body) MERGED with on-chain `getVotes` + `state()` (tallies + status label from `PROPOSAL_STATE`; a fresh chain → an honest "No open amendments" empty state, NOT the mockup's 5 hardcoded amendments); `VoteTally` renders the real `forVotes/againstVotes/abstainVotes` bar + quorum from `quorumBps`×`snapshotCitizens`; `myVote` from `readMyVote(chainId, proposalId, tokenId)`. `CastVotePanel` → `<TxButton>` running `castVoteEmbedded(chainId, proposalId, tokenId, VOTE.For|Against|Abstain)` (embedded) or `castVoteExternal` — **passport-gated**: resolve `tokenId` from `useCitizen()`; when `!isCitizen`, the vote buttons are DISABLED with a "Mint your passport to participate" nudge. On success, refresh the tally and flip to "You voted". Surface `already-voted` / `voting-closed` / `not-a-citizen` revert reasons via `TxButton`'s error state. `DissentThread` from `/api/governance/proposals/[id]/comments` (GET renders; POST gated to citizens via the server on-chain check — the compose box is hidden/disabled for non-citizens).

**TDD steps:**
1. [ ] RED — `GovernanceApp.test.tsx` (mock clients + writers + `useCitizen`): a fresh chain (proposalCount 0) → the "no open amendments" empty state; a citizen sees enabled vote buttons and casting calls `castVoteEmbedded` with the correct `(proposalId, tokenId, support)`; a non-citizen sees DISABLED vote buttons + a mint nudge; after a successful vote the panel shows "You voted"; a `castVote` revert ("already voted") surfaces in the error state; the tally bar reflects the on-chain `getVotes` numbers (not hardcoded).
2. [ ] GREEN — implement.
3. [ ] Run `pnpm test components/governance` — green.
4. [ ] Commit.

---

## Task B3 — Treasury (§7.9) — read-only; STAKE links to wallet

**Files:** NEW `app/dashboard/treasury/page.tsx` + `components/treasury/TreasuryApp.tsx` + `.test.tsx`; NEW `components/treasury/{TreasuryHero,AllocationCard,MyHoldingsCard,DisbursementsLedger}.tsx`.

**READ FIRST:** `dash-gov-treasury.jsx` (`TreasuryScreen` — hero balance + spark, allocation stacked bar, your-holdings, disbursements ledger), spec §7.9 + §6.5, `lib/treasury/client.ts` (Task A3), Task A5 `/api/treasury/summary` + `/api/treasury/allocations` + `/api/treasury/flows`, `components/ui/{Spark,Ledger}.tsx` (Task A4), `lib/wallet/services/staking.ts` (for `MyHoldingsCard` stake read).

Wire: `TreasuryHero` reserve = `readTreasuryReserves` (real `$CRYPT` + ETH balances; honest near-0 on a fresh chain — NOT "$14.20M"); the spark uses a real series from `/api/treasury/summary` history where available, else renders an explicitly-labeled "representative" flat/empty series (constraint #5 — no fabricated growth chart presented as live). `AllocationCard` = `/api/treasury/allocations` TARGETS (governance-ratified intent, tagged as targets not live splits) overlaid with on-chain `allocationBps` when set. `MyHoldingsCard` = `CryptToken.balanceOf(user)` + staking stake + voting weight (1 if citizen). `DisbursementsLedger` = `/api/treasury/flows` (`Disbursed` logs → EXECUTED; DB-labeled PENDING/PROPOSED; empty state on a fresh chain). **Read-only:** the only write affordance is a "STAKE" button that LINKS to `/dashboard/wallet` (no arbitrary treasury spend from the UI — the treasury moves only via executed governance proposals, §7.9).

**TDD steps:**
1. [ ] RED — `TreasuryApp.test.tsx`: a fresh chain shows honest near-zero reserves (NOT "$14.20M") and an empty disbursements ledger; allocation targets render tagged as targets; "STAKE" is a link to `/dashboard/wallet` (no on-chain write triggered from this screen); a treasury-read error renders a per-card retry; on an unregistered chain (treasury accessor throws) the screen still renders gracefully.
2. [ ] GREEN — implement.
3. [ ] Run `pnpm test components/treasury` — green.
4. [ ] Commit.

---

## Task B4 — Sovereign Holdings / dividends (§7.10) + `claim` write + LEGAL flag

**Files:** NEW `app/dashboard/holdings/page.tsx` + `components/holdings/HoldingsApp.tsx` + `.test.tsx`; NEW `components/holdings/{HoldingsHero,DividendClaimPanel,CompositionCard,AssetRegisterTable,DividendHistoryCard,DoctrineCard}.tsx`.

**READ FIRST:** `dash-holdings.jsx` (`HoldingsScreen` — hero AUM + claim panel, composition, asset register with All/RE/IP/EQ/TR filters, dividend history, doctrine card), spec §7.10 + §6.6 + §10.1, `DividendDistributor.sol` (`claimable`/`claim`/`epochs`/`currentEpoch` + the `// LEGAL:` markers), `lib/dividends/client.ts` + `lib/dividends/write.ts` (Task A3), Task A5 `/api/holdings/assets` + `/api/holdings/dividends` + `/api/constitution`, `components/ui/{TxButton,Ledger}.tsx`, `lib/passport/client.ts` (tokenId).

Wire: `HoldingsHero` total AUM + composition COMPUTED from `/api/holdings/assets` (the seeded `AssetCatalogEntry` register — off-chain by nature). **Honesty (constraint #5 / §7.13 — do NOT present the fabricated ~$477M seed total as the republic's real AUM).** The seeded register sums to a fabricated multi-hundred-million valuation; surface it EXACTLY as B3 treats its treasury spark and B5 treats `seededCount` — i.e. the AUM hero + composition MUST carry a VISIBLE `SEEDED` / `DEMONSTRATIVE` tag (asserted by a test) marking the figure as a representative off-chain register, NOT a live on-chain valuation; OR, on a fresh chain with an empty register, render an honest empty/placeholder AUM. NEVER render an untagged "TOTAL ASSETS UNDER REPUBLIC" headline derived from seed values as if it were real. `AssetRegisterTable` with the All/Real-estate/Patents-&-IP/Equity/Crypto filters from the catalog (with the scrubbed provenance strings from A2). `DividendClaimPanel` claimable = `readClaimable(chainId, currentEpoch, tokenId)` (CONTRACT accrual, NOT the mockup's `annualYield/citizenN/4` math); "CLAIM DIVIDEND →" → `<TxButton>` running `claimDividendEmbedded(chainId, currentEpoch, tokenId)` — DISABLED when `claimable == 0` or `!isCitizen` (not-yet-citizen → "Mint your passport to receive dividends", §7.10). On a fresh chain `currentEpoch == 0` → honest "No dividend epoch is open yet" state. `DividendHistoryCard` = `/api/holdings/dividends` (`DividendClaimed` logs for the tokenId; empty state — NOT the mockup's 5 fake quarters). `DoctrineCard` = `/api/constitution`. **LEGAL flag (constraint #6):** render a VISIBLE `// LEGAL:` note ("Dividends are likely a regulated security — see disclosures") near the claim panel AND keep the `// LEGAL:` code comment; assert the visible note in the test. Render a `TESTNET` tag on the claim button.

**TDD steps:**
1. [ ] RED — `HoldingsApp.test.tsx`: the asset register renders from the catalog with working kind filters; **the AUM hero + composition carry a visible `SEEDED`/`DEMONSTRATIVE` tag and the total is NOT presented as a live on-chain valuation** (assert the tag renders alongside the AUM figure, i.e. the fabricated ~$477M is never shown untagged as the republic's real holdings); a fresh chain (`currentEpoch` 0 / `claimable` 0) shows the honest "no epoch open" empty state and a DISABLED claim button; a citizen with `claimable > 0` (mocked) enables claim, and clicking calls `claimDividendEmbedded(chainId, epochId, tokenId)`; a non-citizen sees "Mint your passport to receive dividends"; the visible LEGAL dividend note renders (`getByText(/regulated security/i)`); dividend history renders from `DividendClaimed` logs (empty state when none).
2. [ ] GREEN — implement.
3. [ ] Run `pnpm test components/holdings` — green.
4. [ ] Commit.

---

## Task B5 — Population / census (§7.11) — read-only public

**Files:** NEW `app/dashboard/population/page.tsx` + `components/population/PopulationApp.tsx` + `.test.tsx`; NEW `components/population/{CensusHero,WorldMap,TopCitiesCard,RecentInductionsCard}.tsx`.

**READ FIRST:** `dash-population-embassies.jsx` (`PopulationScreen` — census hero + LiveNumber, dotted world map with sqrt-scaled pins, top cities, recent inductions), spec §7.11, Task A5 `/api/population/census` + `/api/stats/census` + `/api/stats/inductions`, `components/ui/LiveNumber.tsx`, the A2 population-count honesty note.

Wire: `CensusHero` total = live `totalCitizens()` (LiveNumber reseed) + 24h delta from `/api/stats/census`; the hero's countries/embassies/participation are derived where real, OMITTED or tagged `SEEDED` where only demonstrative. `WorldMap` pins from `/api/population/census` (per-city coords from `CityCensus`; pin radius `sqrt(count)`-scaled). Per-city COUNTS come from live `CitizenshipApplication.domicileCity` aggregation where citizens exist (near-0 on a fresh chain → honest low/empty map), with the seeded snapshot shown behind a `SEEDED SNAPSHOT` tag ONLY as demonstrative geography (never merged into the live total). `TopCitiesCard` from the same source. `RecentInductionsCard` from `/api/stats/inductions` (`CitizenMinted` logs; empty state on a fresh chain — NOT the mockup's 6 fake inductions). Read-only, fully viewable by not-yet-citizens.

**TDD steps:**
1. [ ] RED — `PopulationApp.test.tsx`: the hero shows the live `totalCitizens()` count (reseeded LiveNumber), NOT a hardcoded `48 392`; the map renders pins from the census API with sqrt-scaled radii; seeded counts are tagged `SEEDED` and NOT summed into the live total; recent inductions render from `CitizenMinted` logs with an empty state when none; the screen renders for a not-yet-citizen (public).
2. [ ] GREEN — implement.
3. [ ] Run `pnpm test components/population` — green.
4. [ ] Commit.

---

## Task B6 — Embassies (§7.12) + propose-embassy (gated to citizens)

**Files:** NEW `app/dashboard/embassies/page.tsx` + `components/embassies/EmbassiesApp.tsx` + `.test.tsx`; NEW `app/dashboard/embassies/[code]/page.tsx` + `components/embassies/EmbassyDetail.tsx` + `.test.tsx`; NEW `components/embassies/{EmbassiesHero,EmbassyCard,ProposeEmbassyModal}.tsx`.

**READ FIRST:** `dash-population-embassies.jsx` (`EmbassiesScreen` — hero + "PROPOSE AN EMBASSY →" + 3-col `EmbassyCard` grid), spec §7.12 + §6.4, Task A5 `/api/embassies` + `[code]` + `/api/embassies/proposals`, `lib/governance/write.ts` (`proposeEmbedded`/`proposeExternal`), `components/ui/{TxButton,Modal}.tsx`, `lib/passport/client.ts` (isCitizen gate).

Wire: `EmbassiesHero` + `EmbassyCard` grid from `/api/embassies` (the seeded `EmbassyDirectory`; per-card citizen count from live domicile aggregation via `/api/embassies/[code]`, honestly low/0 on a fresh chain — NOT the mockup's `cit`/`events` fabrications). `[code]/page.tsx` → `EmbassyDetail` (directory info + live citizen count + events). "PROPOSE AN EMBASSY →" opens `ProposeEmbassyModal` — **gated to citizens** (`useCitizen()`; non-citizen → disabled + mint nudge): it (1) submits the on-chain signalling `propose(0x0, 0, 0x, descriptionHash)` via `<TxButton>` → `proposeEmbedded` (returns `proposalId`), THEN (2) POSTs the off-chain content PLUS the returned `proposalId`/`txHash` to `/api/embassies/proposals`. `descriptionHash` = keccak256 of the canonical proposal text so it matches the on-chain record (honesty). The server does NOT merely re-verify the caller is *a* citizen — it BINDS the content to the caller and to the on-chain proposal (constraint #4): it resolves the caller via `resolveApplicantAddress(userId)`, checks `readHasPassportServer`, then reads the on-chain proposal server-side (`readGovernanceParamServer(proposalId).proposer`) and rejects unless `proposer === resolvedAddress`, AND recomputes `keccak256(canonical content)` and rejects unless it equals the on-chain `proposals(proposalId).descriptionHash`. This prevents a citizen from attaching content to another citizen's `proposalId` or citing a `proposalId`/`txHash` that does not correspond to the content.

**TDD steps:**
1. [ ] RED — `EmbassiesApp.test.tsx`: the grid renders from `/api/embassies` (seeded directory), per-card counts honest (0 on fresh chain); "PROPOSE AN EMBASSY" is DISABLED with a mint nudge for a non-citizen; for a citizen it opens the modal, and submitting calls `proposeEmbedded` FIRST and then POSTs the returned `proposalId`/`txHash` (plus the canonical content whose `keccak256` equals the `descriptionHash`) to `/api/embassies/proposals`; a card links to `/dashboard/embassies/[code]`. `EmbassyDetail.test.tsx`: renders directory info + live citizen count for a code, and a not-found state for an unknown code. The server-side authorship/hash binding (proposer===caller; `keccak256(content)`===on-chain `descriptionHash`; `proposalId` required) is asserted in the A5 route test.
2. [ ] GREEN — implement both pages + island + detail + modal.
3. [ ] Run `pnpm test components/embassies` — green.
4. [ ] Commit.

---

# GROUP C — VERIFICATION

---

## Task C1 — Local-anvil integration test (governance vote + dividend claim on real contracts)

**Files:**
- EDIT `test/integration/anvil-harness.ts`
- NEW `test/integration/governance-dividends-e2e.test.ts`

**READ FIRST:** `test/integration/anvil-harness.ts` (current shape: emits `passport`/`token`/`staking`/`treasury`; `fundCryptAndRewards` treasury-genesis draw; the `castSend` cast helper; `AnvilDeployment` type), `test/integration/wallet-e2e.test.ts` (the EXACT structure to mirror: `process.env.NEXT_PUBLIC_CHAIN_ENV="local"` before imports; hoisted `signerHolder` + `vi.mock("@/lib/wallet/embedded/session")`; the in-process `/api/rpc/31337` fetch capture into `rpcMethods`; the DIRECT anvil `createTestClient` for cheatcodes; `afterAll` `git checkout -- config/contracts.ts`), `contracts/script/Deploy.s.sol` (governance/distributor role wiring: admin has `FUNDER_ROLE` on distributor, `GENESIS_ATTESTOR_ROLE` on passport; governance params `votingPeriod=3 days`, `quorumBps=2000`, `minCitizensForProposal=3`), `CryptGovernance.sol` (`propose` needs `isCitizen` + `totalCitizens>=3`; `castVote` needs the window active + tokenId ownership), `DividendDistributor.sol` (`openEpoch` PULLS via `safeTransferFrom` — funder must `approve` first).

**Harness edits (`anvil-harness.ts`):**
- Parse the `CryptGovernance` and `DividendDistributor` CREATE addresses from the broadcast and add `governance: Address` + `distributor: Address` to `AnvilDeployment` (mirror the existing `created("CryptStaking")`/`created("CryptTreasury")` lines). (The emit script from A3 already writes them into `config/contracts.ts`.)
- Add helpers (all via the existing LOCAL-only `castSend` with anvil key #0):
  ```ts
  /** Genesis-mint N citizens to the given addresses so propose (needs totalCitizens>=3) works. Returns their tokenIds (1..N). */
  seedCitizensForGovernance(addresses: Address[]): void; // admin adminMint/genesisMint per address
  /** Create an on-chain proposal (signalling) as `proposer`; returns proposalId. proposer must be a citizen. */
  // NOTE: casting from `proposer` requires their key; for the test, mint the TEST wallet as a citizen and call propose through the APP path instead (see test below), OR use a genesis citizen whose key the harness controls.
  /** Open a dividend epoch funded from admin's $CRYPT (admin has FUNDER_ROLE): approve(distributor, amount) → openEpoch(amount). Returns epochId. Draw the amount from treasury genesis first (reuse the disburse path from fundCryptAndRewards). */
  openDividendEpoch(amount: bigint): void; // castSend(token,"approve",[distributor,amount]); castSend(distributor,"openEpoch(uint256)",[amount])
  ```
  For funding the epoch, reuse the treasury-genesis draw pattern already in `fundCryptAndRewards` (grant `GOVERNANCE_ROLE` to admin → `disburse(token, admin, amount)`) so no supply is minted (constraint #8/#9 parity). Amounts are EXPLICIT and obviously sufficient.

**`governance-dividends-e2e.test.ts`** (mirror `wallet-e2e.test.ts` exactly):
- `// @vitest-environment node`; set `NEXT_PUBLIC_CHAIN_ENV=local` + `NEXT_PUBLIC_APP_URL` + `RPC_ANVIL` BEFORE app imports.
- Hoisted `signerHolder` + `vi.mock("@/lib/wallet/embedded/session")` yielding the test wallet (anvil key #8), with `isUnlocked: () => true`, `getAccounts: () => ({ evm: signer.address })`.
- Spy `globalThis.fetch` → route `/api/rpc/31337` in-process to the real `app/api/rpc/[chain]/route` POST handler; capture every JSON-RPC `method` into `rpcMethods`.
- Direct anvil `createPublicClient` + `createTestClient` for out-of-band setup/assertions + cheatcodes (constraint: cheatcodes NEVER go through `/api/rpc` — the allowlist rejects them).
- `beforeAll`: `startAnvilWithContracts([])`; genesis-mint the TEST wallet (key #8) + at least 2 more addresses as citizens (so `totalCitizens >= minCitizensForProposal=3` and the test wallet OWNS a tokenId to vote/claim with); `vi.resetModules()`; import the app modules (`governance` client+write, `dividends` client+write, `contracts`, `rpcRoute`); wire the fetch spy; inject the signer.
- **Test A — governance propose + castVote + tally readback:**
  1. Resolve the test wallet's `tokenId` via `readPassportStatus(31337, wallet)`.
  2. Create a proposal through the APP path: `proposeEmbedded(31337, 0x0, 0n, "0x", descriptionHash)` (the test wallet is a citizen; `totalCitizens>=3`); capture `proposalId`.
  3. `readProposal(31337, proposalId)` → state `Active`, tally all 0.
  4. `castVoteEmbedded(31337, proposalId, tokenId, VOTE.For)`; then `readProposal` → `forVotes === 1n`; `readMyVote(31337, proposalId, tokenId) === VOTE.For`.
  5. Assert `rpcMethods` contains `eth_sendRawTransaction`, and NEVER `eth_sendTransaction`/`personal_sign`/`eth_sign`/`eth_accounts`/`evm_increaseTime`/`evm_mine`.
- **Test B — dividend openEpoch + claim + balance-up:**
  1. `deployment.openDividendEpoch(amount)` (funded from treasury genesis; admin has `FUNDER_ROLE`); `readCurrentEpoch(31337)` → `1n`; `readEpoch(...).open === true`.
  2. `readClaimable(31337, epochId, tokenId) > 0n`; record the wallet's direct `$CRYPT` balance.
  3. `claimDividendEmbedded(31337, epochId, tokenId)`; `waitForTransactionReceipt` (direct client) → `success`.
  4. Assert `claimed(epochId, tokenId) === true` (via a client read) and the wallet's `$CRYPT` balance increased by `perCitizen`; a second claim reverts `AlreadyClaimed` (assert the throw — no double-claim).
  5. Assert no `eth_sendTransaction` in `rpcMethods`.
- `afterAll`: restore mocks, `deployment.stop()`, `git checkout -- config/contracts.ts`.

**TDD steps:**
1. [ ] RED — write `governance-dividends-e2e.test.ts` (fails until the harness emits `governance`/`distributor` and the helpers exist).
2. [ ] GREEN — edit `anvil-harness.ts` (emit `governance`+`distributor`; add `seedCitizensForGovernance` + `openDividendEpoch`; reuse the treasury-genesis draw).
3. [ ] Run `pnpm test:integration` — the new suite passes AND the existing `mint-e2e` + `wallet-e2e` still pass. (Skips gracefully when Foundry is absent via `foundryAvailable()`.)
4. [ ] Commit.

---

## Task C2 — Playwright screen-state specs

**Files:** NEW `e2e/dashboard-screens.spec.ts`

**READ FIRST:** `e2e/wallet-screen.spec.ts` (the EXACT pattern: `stubReads` on `/api/rpc/**` + `/api/history/**` with canned JSON-RPC results; the `register` + `createVault` helpers; the default-env = Base Sepolia 84532 where contracts are unregistered → graceful-degradation coverage; `data-testid` assertions), `e2e/mint.spec.ts` (register helper), the DashboardShell + B1–B6 `data-testid`s.

Cover each of the 6 screens rendering UNDER THE REAL SHELL with stubbed reads, asserting the state matrix + honesty tags:
- Shell: the sidebar nav (8 items) renders; the Topbar shows the REAL chain name (assert NOT `/CR-L2|7331/`) + a live block; the burger opens the mobile drawer at a mobile viewport.
- Home: honest empty obligations for a fresh chain; not-yet-citizen → "Welcome, applicant".
- Governance: "no open amendments" empty state on a fresh chain; vote buttons DISABLED with a mint nudge for a non-citizen (no on-chain execution asserted here — that's C1).
- Treasury: honest near-zero reserves (NOT "$14.20M"); "STAKE" is a link to `/dashboard/wallet`; empty disbursements ledger.
- Holdings: asset register renders from the (seeded) catalog with working filters; the AUM hero + composition carry a visible `SEEDED`/`DEMONSTRATIVE` tag and the fabricated ~$477M total is NOT presented as a live on-chain valuation; the seeded register contains no `/CR-L2|TITLED ON CHAIN/` provenance strings; "no dividend epoch open" empty state + DISABLED claim on a fresh chain; the visible LEGAL dividend note is present; `TESTNET` tag on claim.
- Population: live-count hero (not `48 392`); seeded pins tagged `SEEDED`; empty recent-inductions state.
- Embassies: grid from the seeded directory; "PROPOSE AN EMBASSY" disabled with a mint nudge for a non-citizen.
- Graceful degradation (constraint #11): on the unregistered default testnet chain, governance/treasury/holdings cards render "unavailable"/empty states with NO crashed/blank screen.

**TDD steps:**
1. [ ] Write the spec; stub `/api/rpc/**` + `/api/*` reads via `page.route` to deterministic fixtures so states render without a live chain (extend `wallet-screen.spec.ts`'s `stubReads` with governance/treasury/holdings/population/embassies API stubs).
2. [ ] Run `pnpm e2e e2e/dashboard-screens.spec.ts` — green.
3. [ ] Commit.

---

## Task C3 — Close-out & acceptance checklist (spec §9, Wave 7)

**Files:** none (verification + a short note in the PR/commit body).

Verify each acceptance item and check it off:

- [ ] **No hardcoded mock data on any of the 6 screens** (B1–B6): tallies/state/claimable/treasury balance/census count/dividend+disbursement history all read from chain; catalogs/directory/allocations/constitution/comments from Prisma; block/chain/gas/explorer from `useChainInfo()` (constraints #5, #12; §7.13).
- [ ] **Dashboard shell** ported (Sidebar + Topbar + MobileNavDrawer + session/citizen context) and wired into `layout.tsx` with the auth guard preserved; responsive per §7.3 breakpoints (Task A1).
- [ ] **Vote cast on-chain; one-citizen-one-vote enforced** — `castVote(proposalId, tokenId, support)`, weight 1, passport-gated, proven on anvil (Task B2, C1 Test A).
- [ ] **Dividend claim works with no double-claim** — `claim(epochId, tokenId)`; second claim reverts `AlreadyClaimed`; balance up by `perCitizen`; proven on anvil (Task B4, C1 Test B).
- [ ] **Treasury/holdings/population reflect live chain + DB**; treasury is read-only (no arbitrary spend; STAKE links to wallet) (Task B3, B4, B5).
- [ ] **Off-chain catalogs served from Prisma** — asset catalog, embassy directory, city census, allocation targets, constitution, proposal content + comments (Task A2, A5).
- [ ] **Every write goes through `<TxButton>`** (idle→pending→mining→success/error) via the FROZEN `writeEmbedded` (or wagmi external) path; NO `eth_sendTransaction`/`personal_sign`/`eth_sign`/`eth_accounts` on embedded — asserted in unit (A3) AND over-the-wire on anvil (C1) (constraints #1, #2).
- [ ] **Server never signs/holds keys**; every mutation route has `requireSession` + `isAllowedOrigin` + a Zod `.strict()` schema; citizen-gated off-chain writes resolve the caller via `resolveApplicantAddress(userId)` (verified `LinkedWallet`, reused VERBATIM — constraint #12) then verify passport ownership on-chain via `readHasPassportServer`; `POST /embassies/proposals` ALSO binds the content to the on-chain proposal (`proposals(proposalId).proposer===caller` + `keccak256(content)===descriptionHash`, `proposalId` required) — no authorship spoofing (constraint #4; Task A5, B6).
- [ ] **Honest empty/zero states** on a fresh testnet (0 proposals / 0 epochs / near-0 treasury / near-0 census); mockup L2 chrome (`CR-L2`/`7331`/validators/TPS/"block 21 408 932") replaced with real chain labels; seeded content (asset catalog) is scrubbed of fabricated on-chain provenance (`CR-L2`/`TITLED ON CHAIN`/`16% NETWORK`) and the Holdings AUM/composition carries a visible `SEEDED`/`DEMONSTRATIVE` tag — the fabricated ~$477M total is NEVER shown as a live on-chain valuation (constraint #5; §7.13; Task A2, B4).
- [ ] **Dividend LEGAL flag** surfaced in code (`// LEGAL:`) AND visibly in-UI (constraint #6; Task B4).
- [ ] **Testnet honesty tags** (`TESTNET`/`SIMULATED`) where money moves/is mocked (constraint #7).
- [ ] **Per-screen state matrix** — loading / empty / per-card error+retry / not-yet-citizen vs citizen — on all 6 screens (constraint #9; §7.13; asserted in B1–B6 + C2).
- [ ] **Graceful degradation** on an unregistered chain — governance/treasury/holdings/dividend/vote cards render empty/unavailable, never crash (constraint #11; Task A1, B2–B4, C2).
- [ ] **No secret columns** — `pnpm guard:secrets` green; new Prisma models add none (constraint #8; Task A2).
- [ ] **Nothing hardcodes an address** — `governanceAddress`/`treasuryAddress`/`distributorAddress` throw when unregistered; the emit script writes all three (Task A3).
- [ ] **Local-anvil-only** — no real deploy/transaction; Base Sepolia/mainnet is a documented USER step (constraint #10).
- [ ] **ALL prior tests green** — Wave 1–6 app + forge + `mint-e2e` + `wallet-e2e`, PLUS the new Wave 7 unit + integration + e2e specs.
- [ ] **CSP passes** — no new external origins; reads via `/api/*`.
- [ ] Run the FULL gate: `pnpm guard:secrets && pnpm format:check && pnpm typecheck && pnpm lint && pnpm test && pnpm test:integration && pnpm e2e && (cd contracts && forge test) && pnpm build` — all green.

Commit each task separately with the `Co-Authored-By` trailer. Do NOT deploy to or transact on any real network at any point.

---

## Post-review addenda (reviewer MINOR findings — honor during the build)

The adversarial review (4 dimensions) applied all blocker + major findings above. Three **minor** findings are recorded here to honor during implementation:

1. **Use `totalCitizens()`, never `totalSupply()`.** `CryptRepublicPassport` is a plain ERC-721 (NOT `ERC721Enumerable`) and `lib/passport/abi.ts` exposes only `totalCitizens()`. Any task text (e.g. B1 census ticker, and the §7.5/§7.10/§7.11 spec prose) that says "`totalSupply()`" MUST read `totalCitizens()` instead — a `totalSupply()` call would revert. The live citizen/census count is always `totalCitizens()`.
2. **Census aggregation counts only MINTED citizens.** Per-city population from `CitizenshipApplication.domicileCity` (Task A2/B5) MUST filter to rows with a resolved on-chain citizenship — `citizenTokenId != null` (equivalently `sealedAt != null`) — so DRAFT/ATTESTED applicants who never minted are NOT counted as population. The self-declared aggregate is still tagged `SEEDED`/`SELF-DECLARED` and is NEVER merged into the trustless `totalCitizens()` headline.
3. **External-write anvil coverage is embedded-path only.** C1 proves the EMBEDDED write path (`castVoteEmbedded`/`claimDividendEmbedded`) over-the-wire on anvil; the EXTERNAL wagmi path (`*External`) is covered by A3 unit tests only (same posture as Wave 6 `wallet-e2e`). Where C3 says a write is "asserted over-the-wire on anvil (C1)", read it as the embedded path; do not claim the external path is anvil-proven.
