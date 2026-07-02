# CryptRepublic Wave 9 — Admin Panel (capstone): role-gated back office + audit log + content CRUD + feature flags + PREPARED (never-signed) on-chain admin actions — Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL — before executing any task below, invoke `superpowers:test-driven-development` and `superpowers:executing-plans`. Every task is TDD: write the failing test FIRST (RED), then the implementation (GREEN), then run the stated command and confirm green. Do NOT skip the RED step. Keep ALL prior tests green (398 unit + 11 integration + 22 e2e + 165 forge as of Wave 8 close-out, v0.8.0). Commit each task separately with the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.

## Goal

Wave 9 (spec §9 Wave 9 row + the user's Admin Panel requirement) delivers an **admin-only, role-gated back office with a complete audit trail**:

1. **User / citizen management** — list + search, per-user detail (sessions, linked wallets, application summary), session revocation, suspend/unsuspend, KYC status.
2. **Citizenship-application review** — list by status, detail incl. witness signatures, set `kycStatus`, add a review note. **Off-chain-honest:** admin can NEVER fake chain state — `SEALED` remains chain-derived; `citizenTokenId`/`sealTxHash`/`status` are not admin-editable beyond what the forward-only state machine allows (which for admin is: nothing).
3. **Content management** for the DB-served content (the FIRST write path besides the seed): `AssetCatalogEntry`, `EmbassyDirectory`, `CityCensus`, `TreasuryAllocation`, `ConstitutionText`, `GovernanceProposalContent` + `ProposalComment` moderation (delete, body preserved in the audit row).
4. **Feature flags** — minimal + real: a `FeatureFlag` model, admin CRUD, a public `GET /api/flags`, a `lib/flags` helper with per-flag declared defaults, and EXACTLY ONE wired low-risk consumer (the population world-map card) proving the plumbing end-to-end.
5. **PREPARED on-chain admin actions** — role grants/revokes, dividend-epoch open (2-tx approve+openEpoch batch), treasury actions, token pause/unpause, and contract params — encoded as `{to, value, data, chainId, decoded}` + a Safe Transaction Builder JSON export for the USER's Safe/multisig to sign. **NON-CUSTODIAL, absolutely: the panel NEVER holds keys, signs, or broadcasts an admin action.** The anvil integration proof signs with the anvil throwaway key INSIDE THE TEST only.
6. **Audit log** — a new `AuditLog` model; EVERY admin mutation writes its audit row IN THE SAME `prisma.$transaction` as the mutation, through a serializer allowlist that can never emit `passwordHash`/`tokenHash`. A read-only admin audit viewer (filter + paginate).
7. **Docs** — README nav + wave table, ARCHITECTURE admin section, MAINNET_HANDOFF (the panel prepares Safe txs; the grant-admin bootstrap runbook).

ACCEPTANCE (spec Wave 9 row): admin role + guarded routes enforced (non-admins redirected/403); every mutation authorized + audit-logged; user/application/content CRUD works and is test-covered; NON-CUSTODIAL (prepares, never signs/moves funds); full app + contract suites stay green.

Build + validate on **local anvil only** (chainId 31337). Never a real network, never a real key.

## Architecture

- **Route group.** `app/admin/*` with its own server-guarded `layout.tsx` (session → `/auth`; non-admin → `/dashboard`). Screens are Server Component `page.tsx` files mounting `"use client"` islands (mirrors `app/dashboard/*`). A thin **`AdminShell`** (NOT `DashboardShell` — decision + rationale in C1) reuses `shell.module.css`, `NavIcon`, `Seal`, and the Topbar patterns with admin nav items, an `ADMIN` badge, and a "← Back to dashboard" link.
- **Authorization.** `User.role` (String union `USER|ADMIN`, default `USER`). `requireAdmin(req)` in `lib/auth/guard.ts` extends `requireSession` and throws `forbidden()` for non-admins. Every `/api/admin/*` MUTATION runs the Wave-8 guard stack verbatim: `isAllowedOrigin` → `requireAdmin` → `rateLimit` (per-admin key) → Zod `.strict()` → business → prisma(+audit in one transaction) → `json`. GETs run `requireAdmin` (+ rate limit on the log-scanning chain reads); same-origin GETs are exempt from the origin check per the documented CSRF posture (`lib/auth/csrf.ts:3–10`).
- **No self-promotion.** NO API may set or change `role` — not even an admin (v1). Bootstrap is the documented CLI `scripts/grant-admin.ts` (`pnpm admin:grant <email>`), operator-run with DB access, audited with `actorLabel: "cli"`.
- **Suspend ≠ lockout.** `User.suspendedAt` (DateTime?) is distinct from the login-lockout `lockedUntil`. Suspend = set `suspendedAt` + `revokeAllForUser(userId)` in ONE transaction (+ audit). Enforcement is a single choke point: `validateSessionToken` returns `null` when `user.suspendedAt` is set (kills getSession / getSessionFromRequest / requireSession / requireAdmin at once), plus login-time checks in BOTH session-creating routes — password login (`app/api/auth/login/route.ts`) AND SIWE verify (`app/api/auth/siwe/verify/route.ts`, before `createSession`) — each returning the enumeration-resistant `genericAuthError()` so a suspended user can mint no fresh session by either path.
- **Chain layer.** `lib/admin/abis.ts` + `lib/admin/roles.ts` + `lib/admin/prepare.ts` are **environment-NEUTRAL pure modules** (no `"server-only"`/`"client-only"`, no RPC) so the browser composer, node unit tests, AND the D1 anvil test all import them. `lib/admin/serverReads.ts` is `"server-only"` and mirrors `lib/passport/serverReads.ts` (`createPublicClient` + `serverRpcUrl`). Role membership is reconstructed from `RoleGranted`/`RoleRevoked` logs (`eth_getLogs` — already allowlisted; **no new RPC methods**) and CONFIRMED via `hasRole`. The composer receives contract ADDRESSES from `/api/admin/chain/params` (server-resolved), never from the client-side throwing accessors — this keeps 84532 graceful AND makes the composer e2e-stubbable.
- **Prepared, never signed.** `prepare*` functions return `{chainId, to, value, data, decoded}` (or a 2-tx `PreparedBatch` for approve+openEpoch / approve+fundRewards) + `safeTxBuilderJson(batch)`. The UI renders them in a `PreparedActionCard` (copy calldata / download Safe JSON / explicit "PREPARED FOR YOUR SAFE — THIS PANEL NEVER SIGNS" label). NO `TxButton`, NO `withEvmSigner`, NO `sendRawTransaction`/`sendTransaction`, NO `eth_sendTransaction`, NO `createWalletClient`/`privateKeyToAccount`, NO wagmi, and NO imports of the repo's existing signing wrappers (`lib/wallet/**`, `lib/governance/write`, `lib/dividends/write`, `lib/passport/mint`) anywhere in `lib/admin/**`, `app/admin/**`, `app/api/admin/**`, `components/admin/**` — enforced by a static guard test (A3): a case-insensitive token scan PLUS an import-boundary scan (importing a wrapper that signs internally contains zero signing tokens — the boundary scan is what closes that hole).
- **Treasury honesty.** `GOVERNANCE_ROLE` on `CryptTreasury` is held by the **Governance CONTRACT** (Deploy.s.sol:50) — an EOA/Safe does NOT hold it by default. The honest admin path for `disburse`/`fundDividends` is a **governance proposal**: the panel prepares the FULL proposal payload (`{target: treasury, value: 0, callData, description, descriptionHash}` — `propose()` takes FOUR args incl. `descriptionHash`, CryptGovernance.sol:106–111 — PLUS the encoded `propose()` calldata addressed to the Governance contract as the copyable artifact), labeled with BOTH submission prerequisites: the proposer must be a CITIZEN wallet (`propose()` reverts `NotCitizen` for non-passport-holders, sol:112 — a Safe cannot submit unless the Safe itself holds a passport) and the `descriptionHash` must bind a `GovernanceProposalContent` row per the app's body↔hash convention (constraint #7). Never a direct Safe tx.

## Tech Stack

Next.js 15 App Router + TypeScript strict, viem 2.54, Prisma (SQLite dev), Zod 4 `.strict()`, the government-issue design system (`styles/tokens.css` + `components/ui/*`), Vitest (unit + `vitest.integration.config.ts` for anvil), Playwright (`e2e/`, prod-build webServer), Foundry (local anvil). Package manager: **pnpm**. Prettier enforced. Per-task commits with the `Co-Authored-By` trailer.

---

## Global Constraints (NON-NEGOTIABLE — copy into working memory)

1. **NON-CUSTODIAL, absolutely.** The panel PREPARES `{to, value, data, chainId, decoded}` (+ Safe Transaction Builder JSON export / copy) and NEVER signs or broadcasts an admin action — no `withEvmSigner`, no `sendRawTransaction`, no `sendTransaction`, no `signTransaction`, no `eth_sendTransaction`, no `signTypedData`/`signMessage`, no `createWalletClient`/`privateKeyToAccount`/`mnemonicToAccount`/`hdKeyToAccount`, no wagmi (`writeContract`/`useWriteContract`/`useSendTransaction` — tokens matched case-insensitively), AND no import of the repo's signing wrappers (`@/lib/wallet` any subpath, `@/lib/governance/write`, `@/lib/dividends/write`, `@/lib/passport/mint`, `wagmi`) anywhere in the admin surface (`lib/admin/**`, `app/admin/**`, `app/api/admin/**`, `components/admin/**`); a static guard test (A3) enforces BOTH the token list and the import boundary. The UI states it explicitly ("PREPARED FOR YOUR SAFE — THIS PANEL NEVER SIGNS", test-asserted). The D1 anvil proof signs with the anvil THROWAWAY admin key INSIDE THE TEST (mirroring `test/integration/anvil-harness.ts` patterns), never via panel code.
2. **AUTHORIZATION.** `User.role` String `@default("USER")`, union `USER|ADMIN` in `lib/auth/types.ts` (mirroring `KYC_STATUSES`). `requireAdmin(req)` in `lib/auth/guard.ts` extends `requireSession` and throws `forbidden()` for non-admins. EVERY `/api/admin/*` mutation: `isAllowedOrigin` → `requireAdmin` → `rateLimit` (per-admin userId key, NEVER IP) → Zod `.strict()` → business → prisma; every `/api/admin/*` GET: `requireAdmin` (chain GETs also rate-limited — they scan logs). The `/admin` layout server-guards (unauthenticated → `/auth`; non-admin → `/dashboard`). NO API sets/changes `role` (no self-promotion; the admin cannot promote via the panel either in v1) — bootstrap is `scripts/grant-admin.ts` (`pnpm admin:grant <email>`), audited with actor `"cli"`.
3. **AUDIT LOG.** New `AuditLog` model (id, actorUserId nullable-for-cli, actorLabel, action, targetType, targetId, beforeJson?, afterJson?, ipHash?, userAgent?, createdAt; indexes on actorUserId/action/createdAt). EVERY admin mutation writes its audit row IN THE SAME `prisma.$transaction` as the mutation via `writeAudit(tx, …)`. before/after NEVER contain `passwordHash`/`tokenHash` or any secret-adjacent column — an explicit per-targetType serializer ALLOWLIST (`lib/admin/audit.ts`), test-proven; `pnpm guard:secrets` stays green. Admin UI includes a read-only audit viewer (filter by action/actor, paginated).
4. **NO SECRET EXPOSURE.** Admin user endpoints select-allowlist fields explicitly — NEVER `passwordHash`, NEVER `Session.tokenHash` (session rows expose only `id`/`userAgent`/`ipHash`/`createdAt`/`expiresAt`). Route tests assert the serialized response contains neither key.
5. **SUSPEND.** `User.suspendedAt` (DateTime?) — distinct from the lockout `lockedUntil`. Suspend = set `suspendedAt` + `revokeAllForUser(userId)` in ONE transaction (+ audit). Enforcement with minimal invasiveness and ZERO regression to existing auth tests: (a) `validateSessionToken` (`lib/auth/session.ts:28–42`) returns `null` when `user.suspendedAt` is set — the single choke point behind `getSession`/`getSessionFromRequest`/`requireSession`; (b) BOTH session-creating login routes reject suspended users with the enumeration-resistant `genericAuthError()`: the password login route (`app/api/auth/login/route.ts`, placed with the `isLocked` check) AND the SIWE verify route (`app/api/auth/siwe/verify/route.ts` — after `verifySiwe` resolves the user, BEFORE `createSession`; it already imports `genericAuthError`). Without (b)-SIWE a suspended user with a linked wallet keeps minting fresh (inert) Session rows that become VALID the moment an admin unsuspends. Unsuspend clears it (+ audit). Existing tests create users with `suspendedAt` null → unaffected.
6. **APPLICATION REVIEW is off-chain-honest.** Admin can view applications + witness signatures, set `kycStatus`, and add a `reviewNote` — admin CANNOT fake chain state: no editing `citizenTokenId`/`sealTxHash`/`status` (the `.strict()` review schema accepts ONLY `kycStatus?` + `reviewNote?`; a POST containing `status`/`citizenTokenId`/`sealTxHash` is 400 by strictness — explicitly test-asserted). SEALED remains chain-derived (the client-cache columns stay labeled non-authoritative). `CitizenshipApplication` gains `reviewNote String?`.
7. **CONTENT CRUD honesty.** Admin edits keep the Wave-7 honesty invariants: the UI `SEEDED`/`DEMONSTRATIVE` tags are UI-level and STAY; a validation guard rejects fabricated on-chain provenance in asset content — `name`/`location`/`status` matching `/CR-L2|CryptRepublic L2|TITLED ON CHAIN/i` → 400 (mirrors the A2-Wave-7 seed scrub); `TreasuryAllocation` edits enforce `sum(targetBps) <= 10000` across all rows post-edit (mirrors `CryptTreasury.setAllocation`'s `AllocationOverflow` rule at `CryptTreasury.sol:79–85`); `GovernanceProposalContent.body` is IMMUTABLE via admin when `descriptionHash != null` (editing it would falsify the on-chain hash binding — title/tag remain editable); comment moderation = DELETE with the deleted `body` preserved in `beforeJson`.
8. **FEATURE FLAGS minimal + real.** `FeatureFlag` model (key id, enabled, description?, updatedAt), admin CRUD (+audit), public `GET /api/flags` (no auth, `Cache-Control: no-store` — test-pinned in B2; D2 station 5's flip-and-revisit depends on it), `lib/flags` helpers with per-flag DECLARED defaults (missing row/failed fetch → the declared default; undeclared key → false; never throws). Wire EXACTLY ONE low-risk consumer: **`population_world_map` (declared default `true`) gating the population world-map card** — chosen because it is read-only presentational, not money-moving, not write-gating, and default-true means zero behavior change for every existing test/spec until an admin flips it. NOT the BTC send, NOT anything money-moving. `e2e/dashboard-screens.spec.ts` gains an `/api/flags → { flags: {} }` stub so its map assertions stay deterministic regardless of DB flag state (its stubs-are-deterministic charter).
9. **ZERO regressions + the HARD e2e registration budget.** 398 unit + 11 integration + 22 e2e + 165 forge stay green (counts grow, never shrink). The e2e registration budget is HARD (< 10 per run; currently 9): the admin e2e spec registers NOBODY via `/api/auth/register` — it bootstraps its users via DIRECT prisma (`new PrismaClient` from `@prisma/client` with an ABSOLUTE `file:` datasource URL — NOT `@/lib/db`, whose `"server-only"` import throws outside Next; the webServer `pnpm build && pnpm start` shares `prisma/dev.db`) using a precomputed known Argon2id hash + `role: "ADMIN"`, then LOGS IN via `POST /api/auth/login` (limit 20/15min per IP; grep-verified unused by every other spec — re-verify before writing). Registrations stay at 9; the spec header documents the ledger.
10. **Admin UI.** `/admin` route group with its own layout guard; a thin `AdminShell` variant (decision justified in C1) reusing the design system + `shell.module.css` + `NavIcon`/`Seal`; ADMIN badge + "back to dashboard" link. Screens: Overview (counts + recent audit), Users (list/search/detail: sessions revoke, suspend/unsuspend, kycStatus), Applications (list by status, detail incl. witness sigs, kycStatus + note), Content (tabbed CRUD for the 6 model groups + comment moderation), Flags, Chain Actions (per-contract current params + role topology from logs + the prepared-tx composer with validation mirrors — quorum ≤ 10000, witnesses ≤ 10, apr ≤ 50000, minCitizens ≥ 1, allocation-sum ≤ 10000, epoch approve+open 2-tx batch — and the Safe JSON export), Audit viewer. Each screen implements the Wave-7 state matrix (loading skeleton / empty in-voice / per-card error+retry) and the Wave-8 a11y patterns (labels, focus, contrast tokens).
11. **Reuse infra VERBATIM.** Guard stack (`requireSession`/`isAllowedOrigin`/`rateLimit`/`__resetRateLimit`), response helpers (`json`/`badRequest`/`forbidden`/`unauthorized`/`tooManyRequests`/`genericAuthError`), Zod `.strict()` convention (`lib/validation/*`), the serverReads pattern (`serverClient` via `serverRpcUrl` — `lib/passport/serverReads.ts:22–28`), `revokeSessionToken`/`revokeAllForUser` (`lib/auth/session.ts:44–50`), the `Ledger`/`Modal` UI primitives, and the route-test pattern (`test/applications-route.test.ts` — prisma-seeded users + `createSession(userId)` + hand-built `Request` objects; NO HTTP registration in unit tests). **NO `TxButton` for prepared actions** — prepared actions are not transactions the panel sends; build the distinct `PreparedActionCard`. READ the actual files and match exact signatures — do not re-derive them.
12. **Process.** Per-task commits with the trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. TDD RED-first. Docs updates (README nav + wave table, ARCHITECTURE admin section, MAINNET_HANDOFF: panel-prepares-Safe-txs + grant-admin bootstrap runbook) land in D3. Local anvil only; never deploy to or transact on a real network. `pnpm format:check` green on every new file (Prettier covers .md).

---

## Verified ground truth (re-verify before editing)

**Auth / DB.**

- `User` (prisma/schema.prisma:13–27): id, email?, passwordHash?, name?, kycStatus (String union), failedLoginCount, lockedUntil?, timestamps — **NO `role`, NO `suspendedAt`**. `Session` (:29–41): tokenHash unique, userId, userAgent?, ipHash?, createdAt, expiresAt.
- `lib/auth/session.ts` — `SESSION_COOKIE = "cr_session"`, `createSession(userId, opts?)`, `validateSessionToken(token)` (:28–42 — includes `user`; expiry-checks + deletes stale; **the suspend choke point goes here**), `revokeSessionToken(token)` (:44), `revokeAllForUser(userId)` (:48) — suspend-ready.
- `lib/auth/guard.ts` — `getSession()` (Server Components, next/headers), `getSessionFromRequest(req)`, `requireSession(req)` throws `unauthorized()`. **NO `requireAdmin`.**
- `lib/auth/types.ts` — `KYC_STATUSES`/`KycStatus` (the union convention to mirror for `USER_ROLES`/`UserRole`). CAUTION: its `APPLICATION_STATUSES` (`DRAFT|SUBMITTED|APPROVED|REJECTED|MINTED`) is STALE — the REAL forward-only machine is `lib/applications/state.ts` (`DRAFT → ATTESTED → OATH_ACCEPTED → WITNESSED → SEALED`). Admin application filtering uses `AppStatus` from `lib/applications/state.ts`; do NOT "fix" the stale union in this wave (out of scope; note the divergence).
- `app/api/auth/login/route.ts` — `isAllowedOrigin` → `rateLimit("login:"+xff, 20, 15min)` → `loginSchema` → lookup → DUMMY_HASH timing-equalized verify → `isLocked` → `genericAuthError()` on every failure (enumeration-resistant). The suspend check slots in next to `isLocked(user)`.
- `app/api/auth/siwe/verify/route.ts` — the SECOND session-creating path: `verifySiwe(message, signature)` resolves the FULL prisma user (`lib/auth/siwe.ts:90–103`, `include: { user: true }` — so `result.user.suspendedAt` is available) then calls `createSession(result.user.id)` with NO suspend check today; the route already imports `genericAuthError`. The suspend rejection slots in between: `if (result.user.suspendedAt) return genericAuthError();`. Suite: `test/siwe-routes.test.ts`.
- `lib/auth/csrf.ts:3–10` — documented posture: SameSite=Lax cookie + `isAllowedOrigin` on EVERY state-changing (POST) route; **same-origin GETs are exempt** (GET fetches may carry neither Origin nor Referer — do NOT origin-gate GETs).
- `lib/auth/ratelimit.ts` — in-memory `rateLimit(key, limit, windowMs)` + `__resetRateLimit()`; per-user keys per Wave 8 B1. `lib/http/responses.ts` — `json`/`badRequest`/`forbidden`/`unauthorized`/`tooManyRequests`/`genericAuthError`/`withSessionCookie`.
- Wave-8 guard-stack reference routes (copy the EXACT shape): `app/api/embassies/proposals/route.ts` and `app/api/governance/proposals/[id]/comments/route.ts` — `isAllowedOrigin` → `requireSession` (catch `Response`) → `rateLimit` per-user → `req.json()` try/catch → `schema.safeParse` → business → prisma → `json`.
- Route-test pattern: `test/applications-route.test.ts` — `// @vitest-environment node`, `prisma.user.create` + `createSession(userId)`, hand-built `Request` with `cookie`/`origin` headers, 401/403/400/happy cases, `afterAll` cleanup. `__resetRateLimit()` `beforeEach` where a suite fires more authed mutations than a limit allows (Wave-8 B1 regression guard).
- `lib/auth/password.ts` — `hashPassword`, `verifyPassword`, `DUMMY_HASH` (@node-rs/argon2, Argon2id encoded string).
- Content models (schema.prisma:120–216, seeded by `prisma/seed.ts`, **no write path besides the seed — admin CRUD is the FIRST writer**): `AssetCatalogEntry` (ref unique; valueUsd/annualYieldUsd are **BigInt** — JSON-serialize as strings), `EmbassyDirectory` (code @id), `CityCensus` (code @id, seededCount), `TreasuryAllocation` (bucket unique, targetBps), `ConstitutionText` (key unique), `GovernanceProposalContent` (chainId+proposalId unique; citizen writer exists: propose-embassy), `ProposalComment` (citizen POST exists).
- `CitizenshipApplication` — forward-only status machine + kycStatus + CLIENT-CACHE `sealTxHash`/`citizenTokenId` (NOT authoritative — chain is) + `witnessSignatures` relation (PUBLIC data).
- `scripts/guard-no-secret-columns.sh` — trips on `privateKey|seedPhrase|mnemonic|plaintextPassword|passwordPlain|secretKey` in the schema; new models must not add any.
- Prisma env loading under `tsx`: `prisma/seed.ts` runs via `pnpm db:seed` (tsx) and resolves `DATABASE_URL` — `scripts/grant-admin.ts` mirrors its import pattern exactly.

**On-chain admin surface (exact, verified against `contracts/src/*.sol`).**

- **CryptToken** — `mint(address to, uint256 amount)` onlyRole(MINTER_ROLE), reverts `CapExceeded` when `totalSupply()+amount > MAX_SUPPLY` (:33–36); `pause()`/`unpause()` onlyRole(PAUSER_ROLE) (:38–44); getters `paused()`, `MAX_SUPPLY()`, `totalSupply()`; ERC20 `approve(address,uint256)` (needed for the epoch/fundRewards batches).
- **CryptRepublicPassport** — `genesisMint(address to, bytes32 nameHash, bytes32 motto, bytes32 domicile)` onlyRole(GENESIS_ATTESTOR_ROLE) (:114); `adminMint(...)` same signature onlyRole(PASSPORT_ADMIN_ROLE) (:122); `setRequiredWitnesses(uint8 n)` — `require(n <= 10, "witnesses>10")` (:213–216); `setBaseURI(string)` (:219); `setBurnEnabled(bool)` (:224) — all PASSPORT_ADMIN_ROLE; getters `requiredWitnesses() → uint8`, `burnEnabled() → bool`.
- **CryptGovernance** — `setVotingPeriod(uint256)` (:201); `setQuorumBps(uint16)` — `require(bps <= 10_000, "quorum>100%")` (:206–209); `setExecutionDelay(uint256)` (:212); `setMinCitizensForProposal(uint256)` — `require(minCitizens >= 1, "minCitizens<1")` (:217–220); `setTargetAllowed(address,bool)` (:223) — all DEFAULT_ADMIN_ROLE; getters `votingPeriod()`, `quorumBps()`, `executionDelay()`, `minCitizensForProposal()`, `targetAllowed(address)`. **`propose(address target, uint256 value, bytes callData, bytes32 descriptionHash)` takes FOUR args (:106–111) and reverts `NotCitizen` unless `passport.isCitizen(msg.sender)` (:112)** — the treasury proposal payloads must carry a descriptionHash (binding convention: `keccak256(stringToHex(description))`, matching `EmbassiesApp.tsx:223`) and can only be SUBMITTED by a citizen wallet.
- **CryptTreasury** — `disburse(address token, address to, uint256 amount)` (:47–49) + `fundDividends(address distributor, uint256 amount)` (:66–68) both onlyRole(GOVERNANCE_ROLE) — **held by the Governance CONTRACT** (Deploy.s.sol:50), so the honest admin path is a GOVERNANCE PROPOSAL payload, never a direct Safe tx; `setAllocation(bytes32 bucket, uint16 bps)` — `totalAllocationBps - allocationBps[bucket] + bps <= 10_000` else `AllocationOverflow` (:79–85) + `setAssetWhitelist(address,bool)` (:87) both DEFAULT_ADMIN_ROLE; getters `allocationBps(bytes32)`, `totalAllocationBps()`, `assetWhitelist(address)`.
- **DividendDistributor** — `openEpoch(uint256 amount)` onlyRole(FUNDER_ROLE) nonReentrant (:63–65): PULLS `amount` via `safeTransferFrom(msg.sender, …)` — the FUNDER must `approve(distributor, amount)` FIRST (a prepared epoch is a **2-tx batch**: token.approve + distributor.openEpoch); reverts `NoCitizens` when `totalCitizens() == 0`; getters `currentEpoch()`, `epochs(uint256)`.
- **CryptStaking** — `setApr(uint16 bps)` — `require(bps <= 50_000, "apr>500%")`, prospective-only (accumulator checkpoint) (:122–126); `fundRewards(uint256 amount)` — `safeTransferFrom` pull, requires prior approve (:128–131) — both REWARDS_ADMIN_ROLE; getters `aprBps()` (uint16), `totalStaked()`, `rewardPoolRemaining()`.
- **AccessControl (all six inherit; NOT enumerable):** `grantRole(bytes32,address)`, `revokeRole(bytes32,address)`, `renounceRole(bytes32,address)`, `hasRole(bytes32,address) → bool`, `getRoleAdmin(bytes32) → bytes32`; events `RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)` / `RoleRevoked(...)`. Membership MUST be reconstructed from the two event streams via `eth_getLogs` (allowlisted at `lib/rpc/allowlist.ts:24`) then CONFIRMED with `hasRole` per current holder.
- **Roles (contracts/src/lib/Roles.sol):** `GENESIS_ATTESTOR_ROLE`, `PASSPORT_ADMIN_ROLE`, `MINTER_ROLE`, `PAUSER_ROLE`, `GOVERNANCE_ROLE`, `FUNDER_ROLE`, `REWARDS_ADMIN_ROLE` — each `keccak256("<NAME>")`; `DEFAULT_ADMIN_ROLE` = `bytes32(0)`.
- **Deploy wiring (contracts/script/Deploy.s.sol:47–57, LOCAL facts):** token MINTER → distributor + staking, PAUSER → admin; treasury GOVERNANCE_ROLE → governance contract; distributor FUNDER_ROLE → treasury AND admin; staking REWARDS_ADMIN → admin; passport PASSPORT_ADMIN + GENESIS_ATTESTOR → admin; DEFAULT_ADMIN_ROLE → admin on all six; `governance.setTargetAllowed(treasury, true)`.

**App chain layer.**

- App-side admin ABIs are **MISSING** for all of the above — `lib/{passport,governance,treasury,dividends}/abi.ts` cover user paths only (FROZEN; do not edit them — admin ABIs are a separate self-contained module).
- `encodeFunctionData` pattern: `lib/governance/write.ts:30`. `parseAbi` FROZEN-comment convention: `lib/passport/abi.ts`.
- serverReads pattern to mirror: `lib/passport/serverReads.ts:22–28` (`serverClient` = `createPublicClient({chain: evmEntry(chainId).viemChain, transport: http(serverRpcUrl(chainId))})`); log-scan pattern `:66–84` (`getAbiItem` + `getLogs fromBlock: 0n`).
- `config/contracts.ts` — throwing accessors `passportAddress`/`stakingAddress`/`governanceAddress`/`treasuryAddress`/`distributorAddress` + non-throwing `*Available` probes + `contractEntry(chainId)` (returns `{}` unknown). `tokenAddress`? — verify: the token address accessor exists (`contractEntry(chainId).token`); add a `tokenAddress`/`tokenAvailable` pair ONLY if missing (grep first).
- RPC allowlist (`lib/rpc/allowlist.ts:10–27`) already permits `eth_call`/`eth_getLogs`/`eth_getBlockByNumber`/… — **NO new methods needed**. `serverRpcUrl(31337)` defaults to `http://127.0.0.1:8545`.
- Anvil harness (`test/integration/anvil-harness.ts`): `startAnvilWithContracts(seedCitizens)`, `AnvilDeployment` exposes all six addresses + `admin: {address, privateKey}` (anvil key #0, LOCAL/THROWAWAY), `seedCitizensForGovernance`, `openDividendEpoch`, `fundCryptAndRewards` (treasury-genesis draw: self-grant GOVERNANCE_ROLE → `disburse` — never mints), `castSend` LOCAL-only cast helper, `foundryAvailable()` skip, `afterAll` `git checkout -- config/contracts.ts`.

**Safe export target.** Safe Transaction Builder JSON batch format: `{ version: "1.0", chainId: "<decimal string>", createdAt: <ms>, meta: { name, description }, transactions: [{ to, value, data }] }` — the panel emits this for import into the Safe web app's Transaction Builder. (No Safe SDK dependency; a plain JSON file. Document in-UI that the USER imports it into their Safe.)

**E2E / flags interplay.**

- `playwright.config.ts` — webServer `pnpm build && pnpm start` on :3000, `reuseExistingServer: !CI`; specs run in node and CAN import `@prisma/client` directly (construct `new PrismaClient({ datasources: { db: { url: "file:" + <absolute path to prisma/dev.db> } } })` — SQLite relative URLs resolve against the schema, so use an ABSOLUTE path; never import `@/lib/db`, its `"server-only"` marker throws outside Next).
- Registration ledger (Wave 8, Constraint #5): 9 per full run — auth.spec 1 + mint.spec 2 + wallet-screen.spec 2 + dashboard-screens.spec 3 + critical-path.spec 1. `/api/auth/login` is POSTed by NO existing spec (grep-verified; re-verify).
- `e2e/dashboard-screens.spec.ts:437–443` asserts `world-map` + `map-pin` + `SEEDED SNAPSHOT` on `/dashboard/population` — the flag consumer's declared default `true` + the new `/api/flags → { flags: {} }` stub keep these green and deterministic (files run in PARALLEL workers; without the stub, the admin spec's live flag flip could race another worker's population visit).
- `e2e/dashboard-screens.spec.ts:465` asserts the PROPOSE AN EMBASSY button disabled — one reason the embassies button was NOT chosen as the flag consumer.
- Axe threshold + helper: `e2e/a11y.spec.ts:21–43` (ZERO critical/serious; advisory logged) — copy the helper into the admin spec (specs are standalone, no cross-spec imports).

**Docs to touch in D3:** `README.md` (wave table :101 "Admin panel (capstone) — Pending"), `docs/ARCHITECTURE.md` (§10 security posture; add an admin §11), `docs/MAINNET_HANDOFF.md` (key-custody §, gains the panel-prepares-Safe-txs + grant-admin runbook), `CHANGELOG.md` (+0.9.0), `package.json` (version).

---

## File Structure (new/edited)

```
prisma/
  schema.prisma                          # EDIT (A1) — User.role + User.suspendedAt + CitizenshipApplication.reviewNote + AuditLog + FeatureFlag
  migrations/<ts>_wave9_admin/           # NEW (A1)
lib/
  auth/types.ts                          # EDIT (A1) — USER_ROLES / UserRole union
  auth/guard.ts                          # EDIT (A1) — requireAdmin(req)
  auth/session.ts                        # EDIT (A1) — validateSessionToken suspend choke point
  admin/
    audit.ts + audit.test.ts             # NEW (A2) — writeAudit(tx,…) + serializer allowlist (env-NEUTRAL — the tsx CLI imports it)
    abis.ts                              # NEW (A3) — admin ABIs (env-neutral, FROZEN comments)
    roles.ts + roles.test.ts             # NEW (A3) — ROLE_IDS + CONTRACT_ROLES (env-neutral)
    prepare.ts + prepare.test.ts         # NEW (A3) — pure encoders + batches + safeTxBuilderJson (env-neutral)
    serverReads.ts + serverReads.test.ts # NEW (A3) — params + role topology (server-only)
  flags/
    defaults.ts + defaults.test.ts       # NEW (B2) — FLAG_DEFAULTS + flagValue (env-neutral)
    server.ts                            # NEW (B2) — flagEnabledServer (server-only, never throws)
    client.ts                            # NEW (B2) — fetchFlags + useFlag (client)
  validation/admin.ts + admin.test.ts    # NEW (B1/B2) — all Zod .strict admin schemas
app/
  api/auth/login/route.ts                # EDIT (A1) — suspended → genericAuthError()
  api/auth/siwe/verify/route.ts          # EDIT (A1) — suspended → genericAuthError() BEFORE createSession (2nd login path)
  api/flags/route.ts                     # NEW (B2) — public GET
  api/admin/
    overview/route.ts                    # NEW (B1) — counts + recent audit
    audit/route.ts                       # NEW (B1) — audit list (filter/paginate)
    users/route.ts                       # NEW (B1) — list + search
    users/[id]/route.ts                  # NEW (B1) — detail (select-allowlist)
    users/[id]/suspend/route.ts          # NEW (B1) — POST suspend / unsuspend (body {suspended: boolean})
    users/[id]/kyc/route.ts              # NEW (B1) — POST kycStatus
    users/[id]/sessions/revoke/route.ts  # NEW (B1) — POST {sessionId} | {all:true}
    applications/route.ts                # NEW (B1) — list by status
    applications/[id]/route.ts           # NEW (B1) — detail incl. witness sigs
    applications/[id]/review/route.ts    # NEW (B1) — POST {kycStatus?, reviewNote?} ONLY
    content/assets/route.ts + assets/[ref]/route.ts            # NEW (B2)
    content/embassies/route.ts + embassies/[code]/route.ts     # NEW (B2)
    content/census/route.ts + census/[code]/route.ts           # NEW (B2)
    content/allocations/route.ts + allocations/[bucket]/route.ts # NEW (B2)
    content/constitution/route.ts + constitution/[key]/route.ts # NEW (B2)
    content/proposals/route.ts + proposals/[id]/route.ts        # NEW (B2) — title/tag (+body only when descriptionHash null)
    content/comments/[id]/route.ts       # NEW (B2) — DELETE (moderation)
    flags/route.ts + flags/[key]/route.ts # NEW (B2)
    chain/params/route.ts                # NEW (B3) — server reads, graceful available:false
    chain/roles/route.ts                 # NEW (B3) — role topology from logs + hasRole confirm
  admin/
    layout.tsx                           # NEW (C1) — server guard (auth → /auth; non-admin → /dashboard)
    page.tsx + (island) AdminOverviewApp # NEW (C1)
    audit/page.tsx                       # NEW (C1)
    users/page.tsx + users/[id]/page.tsx # NEW (C2)
    applications/page.tsx + applications/[id]/page.tsx # NEW (C2)
    content/page.tsx                     # NEW (C3) — tabbed CRUD
    flags/page.tsx                       # NEW (C3)
    chain/page.tsx                       # NEW (C4)
components/
  admin/
    AdminShell.tsx + AdminShell.test.tsx # NEW (C1)
    adminNavItems.ts                     # NEW (C1)
    AdminOverviewApp.tsx + .test.tsx     # NEW (C1)
    AuditViewer.tsx + .test.tsx          # NEW (C1)
    UsersApp.tsx + .test.tsx             # NEW (C2)
    UserDetail.tsx + .test.tsx           # NEW (C2)
    ApplicationsApp.tsx + .test.tsx      # NEW (C2)
    ApplicationDetail.tsx + .test.tsx    # NEW (C2)
    ContentApp.tsx + .test.tsx           # NEW (C3)
    FlagsApp.tsx + .test.tsx             # NEW (C3)
    ChainActionsApp.tsx + .test.tsx      # NEW (C4)
    PreparedActionCard.tsx + .test.tsx   # NEW (C4)
components/population/PopulationApp.tsx  # EDIT (C3) — the ONE flag consumer (+ test update)
scripts/grant-admin.ts                   # NEW (A1) — CLI bootstrap (audited, actor "cli")
package.json                             # EDIT (A1 admin:grant script; D3 version 0.9.0)
test/
  admin-guard.test.ts                    # NEW (A1) — requireAdmin + suspend enforcement
  no-admin-signing.test.ts               # NEW (A3) — static non-custodial guard
  integration/admin-prepared-e2e.test.ts # NEW (D1)
e2e/
  admin-panel.spec.ts                    # NEW (D2) — 0 registrations, login-bootstrapped
  dashboard-screens.spec.ts              # EDIT (C3) — /api/flags stub (determinism)
docs/ (D3)
  README.md, docs/ARCHITECTURE.md, docs/MAINNET_HANDOFF.md, CHANGELOG.md
```

---

# GROUP A — FOUNDATION

---

## Task A1 — Schema (role / suspendedAt / reviewNote / AuditLog / FeatureFlag) + `requireAdmin` + suspend enforcement + `scripts/grant-admin.ts`

**Files:**

- EDIT `prisma/schema.prisma` + NEW migration `prisma/migrations/<ts>_wave9_admin/`
- EDIT `lib/auth/types.ts`, `lib/auth/guard.ts`, `lib/auth/session.ts`, `app/api/auth/login/route.ts`, `app/api/auth/siwe/verify/route.ts` (BOTH session-creating login paths get the suspend rejection)
- NEW `scripts/grant-admin.ts`; EDIT `package.json` (`"admin:grant": "tsx scripts/grant-admin.ts"`)
- NEW `test/admin-guard.test.ts`; EDIT `test/siwe-routes.test.ts` (suspended-SIWE-login case) (+ extend `test/auth-routes.test.ts` ONLY if a suspended-login case fits its structure better — read it first)

**READ FIRST:** `prisma/schema.prisma` (WHOLE — the no-secrets INVARIANT comment, String-enum convention, `// DIVERGENCE:` convention), `lib/auth/session.ts` (validateSessionToken :28–42; revokeAllForUser :48), `lib/auth/guard.ts` (requireSession shape), `lib/auth/types.ts` (KYC_STATUSES union shape to mirror), `app/api/auth/login/route.ts` (WHOLE — where `isLocked` sits; every failure is `genericAuthError()`), `app/api/auth/siwe/verify/route.ts` + `lib/auth/siwe.ts` (the SECOND session-creating path — `verifySiwe` returns the full prisma user; the check goes BEFORE `createSession`), `lib/auth/lockout.ts` (so suspend never entangles with lockout semantics), `test/auth-routes.test.ts` + `test/siwe-routes.test.ts` + `test/applications-route.test.ts` (test patterns), `prisma/seed.ts` (the tsx + PrismaClient env-loading pattern grant-admin mirrors), `scripts/guard-no-secret-columns.sh`.

**Schema additions (ALL PUBLIC data — no secret columns):**

```prisma
model User {
  // … existing fields unchanged …
  role        String    @default("USER") // UserRole union (USER|ADMIN) — lib/auth/types.ts
  suspendedAt DateTime? // admin suspension — DISTINCT from the login-lockout lockedUntil
}

model CitizenshipApplication {
  // … existing fields unchanged …
  reviewNote String? // admin review note (Wave 9) — off-chain only, never chain state
}

/// Admin audit trail (Wave 9). EVERY admin mutation writes a row IN THE SAME
/// prisma.$transaction as the mutation (lib/admin/audit.ts writeAudit). before/
/// afterJson pass a per-targetType serializer ALLOWLIST — passwordHash/tokenHash
/// can never appear. actorUserId is a plain column (no FK) so audit rows survive
/// user deletion; null actorUserId = the CLI bootstrap (actorLabel "cli").
model AuditLog {
  id          String   @id @default(cuid())
  actorUserId String?
  actorLabel  String   // "admin:<email>" | "cli"
  action      String   // dot-namespaced: "user.suspend", "content.asset.update", "flag.upsert", …
  targetType  String   // AuditTargetType union (lib/admin/audit.ts)
  targetId    String
  beforeJson  String?  // allowlist-serialized JSON snapshot (nullable for creates)
  afterJson   String?  // allowlist-serialized JSON snapshot (nullable for deletes)
  ipHash      String?  // reserved; null in v1 (no existing app ipHash convention — divergence noted)
  userAgent   String?
  createdAt   DateTime @default(now())

  @@index([actorUserId])
  @@index([action])
  @@index([createdAt])
}

/// Feature flags (Wave 9). Missing row => the per-flag DECLARED default
/// (lib/flags/defaults.ts), undeclared key => false. Public read via /api/flags.
model FeatureFlag {
  key         String   @id
  enabled     Boolean  @default(false)
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

**Types (`lib/auth/types.ts` — mirror the KYC union exactly):**

```ts
export const USER_ROLES = ["USER", "ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];
```

**Guard (`lib/auth/guard.ts`):**

```ts
/** requireSession + role gate. Throws unauthorized() (no/invalid session — incl.
 *  suspended users, nulled by validateSessionToken) or forbidden() (role !== "ADMIN"). */
export async function requireAdmin(req: Request): Promise<{ session: Session; user: User }> {
  const s = await requireSession(req); // throws unauthorized()
  if (s.user.role !== "ADMIN") throw forbidden();
  return s;
}
```

**Suspend enforcement (minimal invasiveness, single choke point):**

- `lib/auth/session.ts` `validateSessionToken`: after the expiry check, `if (user.suspendedAt) return null;` (do NOT delete the session row here — suspend already revoked all; this is defense-in-depth for any session created in a race). This one line covers `getSession`, `getSessionFromRequest`, `requireSession`, `requireAdmin`, and therefore every guarded page + API at once.
- `app/api/auth/login/route.ts`: next to the `isLocked(user)` check, `if (user.suspendedAt) return genericAuthError();` — 401 with the same generic body (enumeration-resistant; no "you are suspended" oracle on login).
- `app/api/auth/siwe/verify/route.ts`: after `verifySiwe` resolves and BEFORE `createSession`, `if (result.user.suspendedAt) return genericAuthError();` — same generic 401 (the route already imports `genericAuthError`). Both session-CREATING paths are now closed; the choke point in (a) covers session VALIDATION. Skipping this one would let a suspended wallet-linked user keep minting Session rows that turn live on unsuspend.

**`scripts/grant-admin.ts`** (mirror `prisma/seed.ts`'s tsx + PrismaClient pattern):

```ts
/** Export the core so unit tests call it directly (no process spawn). */
export async function setAdminRole(
  email: string,
  opts?: { revoke?: boolean },
): Promise<{ userId: string; role: UserRole }>;
// CLI: pnpm admin:grant <email> [--revoke]
```

Behavior: normalize the email (reuse `normalizeEmail` from `lib/validation/auth` if importable under tsx — verify; else lowercase+trim identically), find the user (exit 1 with a clear message when absent), then in ONE `prisma.$transaction`: update `role` + `writeAudit(tx, { actorUserId: null, actorLabel: "cli", action: opts?.revoke ? "user.role.revoke_admin" : "user.role.grant_admin", targetType: "USER", targetId, before, after })`. Idempotent (re-granting an ADMIN is a no-op that still audits or short-circuits — pick short-circuit-with-message, no duplicate audit noise; record the choice). NOTE: A2 delivers `writeAudit`; in A1 write the audit row with an inline allowlisted object `{ id, email, role }` and a `// TODO(A2): switch to writeAudit` — OR sequence A2 first internally; simplest is to keep A1's script writing the row through the SAME serializer by importing from `lib/admin/audit.ts` and building that file's serializer in A2 — therefore: **implement the A1 script's audit write as a plain `tx.auditLog.create` with a hand-allowlisted `{ id, email, role }` snapshot, then A2 refactors it onto `writeAudit` (A2 TDD covers the refactor).** The refactor is SAFE for the tsx CLI because `lib/admin/audit.ts` is environment-NEUTRAL — NO `"server-only"` marker (see A2 + Notes #1–2); A2's subprocess smoke test proves the CLI still executes under real tsx after the switch.

**Docs stub:** a header comment in the script (what/why/how to run, "operator with DB access only; the panel cannot promote") + one line in README's scripts list (full docs in D3).

**TDD steps:**

1. [ ] RED — `test/admin-guard.test.ts` (`// @vitest-environment node`, mirror `applications-route.test.ts` setup):
   - `requireAdmin`: no cookie → throws 401 Response; role USER → throws 403; role ADMIN → resolves `{user}`.
   - Suspend choke point: create user + session, set `suspendedAt`, then `validateSessionToken(token)` → `null` and `requireSession` → 401.
   - Login: a suspended user with the correct password → 401 with the GENERIC body (`{"error":"Invalid email or passphrase."}`); a non-suspended control user still logs in 200 (zero regression).
   - SIWE login (add to `test/siwe-routes.test.ts`, matching its existing mock/setup style): a suspended user with a VALID SIWE message+signature → 401 generic body, NO `cr_session` cookie set, and NO new Session row created; the non-suspended control case still 200 (zero regression).
   - `setAdminRole`: flips role to ADMIN, writes an `AuditLog` row with `actorLabel === "cli"` + `action === "user.role.grant_admin"`, and its `beforeJson`/`afterJson` contain NO `passwordHash` key; `--revoke` flips back with the revoke action.
2. [ ] GREEN — schema edits; `pnpm db:migrate --name wave9_admin` (additive columns — SQLite-safe); `pnpm db:generate`; types union; `requireAdmin`; the THREE suspend checks (choke point + password login + SIWE verify); the script + pnpm script.
3. [ ] Run `pnpm guard:secrets` (MUST stay green) && `pnpm test test/admin-guard.test.ts test/auth-routes.test.ts test/siwe-routes.test.ts test/applications-route.test.ts` (the neighbors that exercise sessions/BOTH logins MUST stay green) && `pnpm typecheck`.
4. [ ] Commit.

---

## Task A2 — Audit helper: `lib/admin/audit.ts` (`writeAudit(tx, …)` + per-targetType serializer allowlist)

**Files:** NEW `lib/admin/audit.ts` + `lib/admin/audit.test.ts`; EDIT `scripts/grant-admin.ts` (switch to `writeAudit`).

**READ FIRST:** `prisma/schema.prisma` (every model the admin can touch — field names for the allowlists), `lib/db.ts`, the Prisma `$transaction` interactive-client type (`Prisma.TransactionClient`), `scripts/guard-no-secret-columns.sh` (the secret-name set the tests mirror), Task A1's `AuditLog` model.

**Environment marker — `lib/admin/audit.ts` is environment-NEUTRAL (NO `"server-only"`).** It receives the transaction client as a parameter, imports only `import type { Prisma } from "@prisma/client"`, holds no secrets and no Next-only APIs — a `"server-only"` marker would buy nothing and would BREAK the tsx-run CLI: `server-only` is NOT an installed package in this repo (Next vendors it at build time; `require.resolve("server-only")` is MODULE_NOT_FOUND from the repo root), so `import "server-only"` under tsx/plain node fails at import time with ERR_MODULE_NOT_FOUND — killing `pnpm admin:grant`, the ONLY admin-bootstrap path (constraint #2). Note the trap: vitest ALIASES `server-only` to `test/empty-module.ts` (vitest.config.ts), so unit tests calling `setAdminRole` would stay green while the real CLI is dead — which is exactly why TDD step 1 below includes a subprocess smoke test that executes the CLI under REAL tsx.

**Exact interfaces:**

```ts
// lib/admin/audit.ts — environment-NEUTRAL: importable by Next route handlers AND by scripts/grant-admin.ts under tsx.
import type { Prisma } from "@prisma/client";

export type AuditTargetType =
  | "USER" | "SESSION" | "APPLICATION"
  | "ASSET" | "EMBASSY" | "CENSUS" | "ALLOCATION" | "CONSTITUTION"
  | "PROPOSAL_CONTENT" | "COMMENT" | "FLAG";

/** Per-targetType field ALLOWLIST — the ONLY keys serializeForAudit will emit.
 *  INVARIANT (test-enforced): no allowlist ever contains passwordHash, tokenHash,
 *  or any /privateKey|seedPhrase|mnemonic|plaintextPassword|passwordPlain|secretKey/i name. */
export const AUDIT_FIELD_ALLOWLIST: Record<AuditTargetType, readonly string[]> = {
  USER: ["id","email","name","role","kycStatus","suspendedAt","lockedUntil","failedLoginCount","createdAt","updatedAt"],
  SESSION: ["id","userId","userAgent","ipHash","createdAt","expiresAt"], // NEVER tokenHash
  APPLICATION: ["id","userId","status","name","domicileCity","hostCountry","motto","kycStatus","reviewNote","applicantAddress","sealTxHash","citizenTokenId","sealedAt","createdAt","updatedAt"],
  ASSET: ["id","ref","kind","name","location","valueUsd","yieldBps","annualYieldUsd","status","acquiredAt"],
  EMBASSY: ["code","name","neighborhood","hours","foundedAt","brandColor","city","country"],
  CENSUS: ["code","name","lat","long","hasEmbassy","seededCount"],
  ALLOCATION: ["id","bucket","label","targetBps","color"],
  CONSTITUTION: ["id","key","title","body","citation"],
  PROPOSAL_CONTENT: ["id","chainId","proposalId","title","tag","body","descriptionHash","createdAt"],
  COMMENT: ["id","proposalContentId","authorAddress","citizenTokenId","body","upvotes","createdAt"],
  FLAG: ["key","enabled","description","updatedAt"],
};

/** Picks ONLY allowlisted keys; BigInt → string, Date → ISO; unknown targetType THROWS. */
export function serializeForAudit(targetType: AuditTargetType, record: unknown): string;

export interface AuditEntry {
  actorUserId: string | null; // null == CLI
  actorLabel: string;         // "admin:<email>" | "cli"
  action: string;             // dot-namespaced
  targetType: AuditTargetType;
  targetId: string;
  before?: unknown;           // raw record — serialized through the allowlist
  after?: unknown;
  userAgent?: string | null;
}

/** Writes the audit row via the SAME transaction client as the mutation. */
export function writeAudit(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void>;
```

Action-name convention (document in the file header; the viewer filters on it): `user.suspend`, `user.unsuspend`, `user.kyc.set`, `user.sessions.revoke`, `user.role.grant_admin` / `user.role.revoke_admin` (cli only), `application.review`, `content.asset.create|update|delete`, `content.embassy.*`, `content.census.*`, `content.allocation.*`, `content.constitution.*`, `content.proposal.update`, `content.comment.delete`, `flag.upsert`, `flag.delete`.

**TDD steps:**

1. [ ] RED — `lib/admin/audit.test.ts`:
   - `serializeForAudit("USER", { id, email, passwordHash: "SECRET", role })` → JSON WITHOUT a `passwordHash` key (even though supplied);
   - `serializeForAudit("SESSION", { id, tokenHash: "SECRET", userAgent })` → no `tokenHash`;
   - allowlist INVARIANT: for EVERY targetType, `AUDIT_FIELD_ALLOWLIST[t]` contains no name matching `/passwordHash|tokenHash|privateKey|seedPhrase|mnemonic|plaintextPassword|passwordPlain|secretKey/i`;
   - BigInt fields (`valueUsd: 28_400_000n`) serialize as strings (no `JSON.stringify` TypeError);
   - unknown targetType throws;
   - `writeAudit` inside a real `prisma.$transaction` persists a row readable afterward with parseable before/after JSON;
   - **CLI smoke test (REAL tsx, subprocess — NOT a direct import):** seed a scratch user via prisma, then `execFileSync("pnpm", ["admin:grant", email])` (or `pnpm exec tsx scripts/grant-admin.ts <email>`); assert exit 0, the user's `role === "ADMIN"` in prisma, and the `user.role.grant_admin` audit row exists. This is the ONLY gate that can catch a `server-only`/module-resolution regression in the CLI's import graph — the vitest `server-only` alias masks it for every in-process test. Mark it with a comment saying exactly that.
2. [ ] GREEN — implement (audit.ts stays env-NEUTRAL — no `"server-only"` marker, see above); refactor `scripts/grant-admin.ts` onto `writeAudit` (its A1 test keeps passing — the actorLabel/action assertions are implementation-agnostic).
3. [ ] Run `pnpm test lib/admin/audit.test.ts test/admin-guard.test.ts` — green (includes the tsx subprocess smoke). `pnpm guard:secrets` green.
4. [ ] Commit.

---

## Task A3 — Admin chain layer: ABIs + roles + pure prepare encoders + Safe JSON + serverReads (params & role topology) + the static non-custodial guard

**Files:**

- NEW `lib/admin/abis.ts`, `lib/admin/roles.ts` + `roles.test.ts`, `lib/admin/prepare.ts` + `prepare.test.ts`, `lib/admin/serverReads.ts` + `serverReads.test.ts`
- NEW `test/no-admin-signing.test.ts`
- EDIT `config/contracts.ts` ONLY if `tokenAddress`/`tokenAvailable` accessors are missing (grep first; mirror `passportAddress` exactly if adding)

**READ FIRST:** the six contract sources (the exact signatures + require strings in "Verified ground truth" — re-read them), `contracts/src/lib/Roles.sol`, `contracts/script/Deploy.s.sol:40–58`, `lib/passport/abi.ts` (parseAbi FROZEN convention), `lib/passport/serverReads.ts` (serverClient + getLogs patterns to mirror EXACTLY), `lib/governance/write.ts:30` (encodeFunctionData usage), `config/contracts.ts` (accessors + probes), `lib/rpc/allowlist.ts`, `test/no-server-wallet-import.test.ts` (the static-guard test pattern to mirror), viem `decodeFunctionData` (for round-trip tests).

**`lib/admin/abis.ts`** (env-NEUTRAL — no server-only/client-only; `parseAbi`; FROZEN comments byte-matching the .sol surfaces). One module, per-contract exports:

```ts
export const accessControlAbi = parseAbi([
  "function grantRole(bytes32 role, address account)",
  "function revokeRole(bytes32 role, address account)",
  "function renounceRole(bytes32 role, address callerConfirmation)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function getRoleAdmin(bytes32 role) view returns (bytes32)",
  "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)",
  "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)",
]);
export const adminTokenAbi = parseAbi([
  "function mint(address to, uint256 amount)",
  "function pause()", "function unpause()",
  "function paused() view returns (bool)",
  "function MAX_SUPPLY() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);
export const adminPassportAbi = parseAbi([
  "function genesisMint(address to, bytes32 nameHash, bytes32 motto, bytes32 domicile)",
  "function adminMint(address to, bytes32 nameHash, bytes32 motto, bytes32 domicile)",
  "function setRequiredWitnesses(uint8 n)",
  "function setBaseURI(string uri)",
  "function setBurnEnabled(bool enabled)",
  "function requiredWitnesses() view returns (uint8)",
  "function burnEnabled() view returns (bool)",
]);
export const adminGovernanceAbi = parseAbi([
  "function propose(address target, uint256 value, bytes callData, bytes32 descriptionHash) returns (uint256 proposalId)", // for the treasury proposal payloads' propose() artifact
  "function setVotingPeriod(uint256 period)",
  "function setQuorumBps(uint16 bps)",
  "function setExecutionDelay(uint256 delay)",
  "function setMinCitizensForProposal(uint256 minCitizens)",
  "function setTargetAllowed(address target, bool ok)",
  "function votingPeriod() view returns (uint256)",
  "function quorumBps() view returns (uint16)",
  "function executionDelay() view returns (uint256)",
  "function minCitizensForProposal() view returns (uint256)",
  "function targetAllowed(address) view returns (bool)",
]);
export const adminTreasuryAbi = parseAbi([
  "function disburse(address token, address to, uint256 amount)",
  "function fundDividends(address distributor, uint256 amount)",
  "function setAllocation(bytes32 bucket, uint16 bps)",
  "function setAssetWhitelist(address token, bool ok)",
  "function allocationBps(bytes32 bucket) view returns (uint16)",
  "function totalAllocationBps() view returns (uint16)",
  "function assetWhitelist(address token) view returns (bool)",
]);
export const adminDistributorAbi = parseAbi([
  "function openEpoch(uint256 amount) returns (uint256 epochId)",
  "function currentEpoch() view returns (uint256)",
]);
export const adminStakingAbi = parseAbi([
  "function setApr(uint16 bps)",
  "function fundRewards(uint256 amount)",
  "function aprBps() view returns (uint16)",
  "function totalStaked() view returns (uint256)",
  "function rewardPoolRemaining() view returns (uint256)",
]);
```

**`lib/admin/roles.ts`** (env-NEUTRAL):

```ts
export const ADMIN_CONTRACTS = ["token","passport","governance","treasury","distributor","staking"] as const;
export type AdminContract = (typeof ADMIN_CONTRACTS)[number];

export const ROLE_NAMES = ["DEFAULT_ADMIN_ROLE","GENESIS_ATTESTOR_ROLE","PASSPORT_ADMIN_ROLE","MINTER_ROLE","PAUSER_ROLE","GOVERNANCE_ROLE","FUNDER_ROLE","REWARDS_ADMIN_ROLE"] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

/** bytes32 role ids: DEFAULT_ADMIN_ROLE = 0x00…00; others keccak256(toBytes(name)). */
export const ROLE_IDS: Record<RoleName, `0x${string}`>;

/** Which roles are meaningful per contract (Deploy.s.sol §roles + Roles.sol). */
export const CONTRACT_ROLES: Record<AdminContract, readonly RoleName[]> = {
  token: ["DEFAULT_ADMIN_ROLE","MINTER_ROLE","PAUSER_ROLE"],
  passport: ["DEFAULT_ADMIN_ROLE","GENESIS_ATTESTOR_ROLE","PASSPORT_ADMIN_ROLE"],
  governance: ["DEFAULT_ADMIN_ROLE"],
  treasury: ["DEFAULT_ADMIN_ROLE","GOVERNANCE_ROLE"],
  distributor: ["DEFAULT_ADMIN_ROLE","FUNDER_ROLE"],
  staking: ["DEFAULT_ADMIN_ROLE","REWARDS_ADMIN_ROLE"],
};
```

**`lib/admin/prepare.ts`** (env-NEUTRAL, PURE — `encodeFunctionData` only, NO rpc, NO registry imports; addresses are EXPLICIT params so the UI feeds them from `/api/admin/chain/params` and 84532 stays graceful):

```ts
export interface PreparedTx {
  chainId: number;
  to: `0x${string}`;
  value: "0"; // admin actions never move ETH from the panel
  data: `0x${string}`;
  decoded: { contract: AdminContract; functionName: string; args: Record<string, string>; summary: string };
}
export interface PreparedBatch {
  chainId: number;
  kind: "single" | "batch";
  description: string;
  txs: PreparedTx[];
}
/** Payload for a GOVERNANCE PROPOSAL (GOVERNANCE_ROLE is held by the Governance
 *  CONTRACT — Deploy.s.sol:50 — an EOA/Safe cannot call these directly; the panel
 *  prepares the FULL propose() payload, NEVER as a direct Safe tx).
 *  propose() takes FOUR args: (target, value, callData, descriptionHash)
 *  (CryptGovernance.sol:106–111). TWO submission prerequisites the note MUST state:
 *  (1) the PROPOSER must be a citizen wallet — propose() reverts NotCitizen
 *  (sol:112) for any non-passport-holder, incl. a Safe that holds no passport;
 *  (2) descriptionHash must bind a GovernanceProposalContent row — same convention
 *  as the propose-embassy flow (EmbassiesApp.tsx:223):
 *  descriptionHash = keccak256(stringToHex(description)). An arbitrary hash would
 *  break the app's body↔descriptionHash binding (constraint #7). */
export interface GovernanceProposalPayload {
  chainId: number;
  target: `0x${string}`; // the treasury
  value: "0";
  callData: `0x${string}`;
  description: string;            // the canonical description text (composer input)
  descriptionHash: `0x${string}`; // keccak256(stringToHex(description)) — the binding convention
  propose: { to: `0x${string}`; value: "0"; data: `0x${string}` }; // FULL propose(target,value,callData,descriptionHash) calldata addressed to the GOVERNANCE contract — the copyable artifact a citizen wallet submits
  decoded: PreparedTx["decoded"];
  note: string; // the honest-path note (BOTH prerequisites above), rendered in-UI
}

// Role admin (works on any of the six contracts):
export function prepareGrantRole(chainId: number, contract: AdminContract, address: `0x${string}`, role: RoleName, account: `0x${string}`): PreparedBatch;
export function prepareRevokeRole(chainId: number, contract: AdminContract, address: `0x${string}`, role: RoleName, account: `0x${string}`): PreparedBatch;
// Token:
export function preparePause(chainId: number, token: `0x${string}`): PreparedBatch;
export function prepareUnpause(chainId: number, token: `0x${string}`): PreparedBatch;
// Passport params (validation mirrors the contract requires — throws BEFORE encoding):
export function prepareSetRequiredWitnesses(chainId: number, passport: `0x${string}`, n: number): PreparedBatch; // throws n<0 || n>10 ("witnesses>10")
export function prepareSetBaseURI(chainId: number, passport: `0x${string}`, uri: string): PreparedBatch;
export function prepareSetBurnEnabled(chainId: number, passport: `0x${string}`, enabled: boolean): PreparedBatch;
// Governance params:
export function prepareSetVotingPeriod(chainId: number, governance: `0x${string}`, seconds: bigint): PreparedBatch;
export function prepareSetQuorumBps(chainId: number, governance: `0x${string}`, bps: number): PreparedBatch;   // throws bps>10000 ("quorum>100%")
export function prepareSetExecutionDelay(chainId: number, governance: `0x${string}`, seconds: bigint): PreparedBatch;
export function prepareSetMinCitizens(chainId: number, governance: `0x${string}`, min: bigint): PreparedBatch;  // throws min<1 ("minCitizens<1")
export function prepareSetTargetAllowed(chainId: number, governance: `0x${string}`, target: `0x${string}`, ok: boolean): PreparedBatch;
// Treasury (DEFAULT_ADMIN direct):
export function prepareSetAllocation(chainId: number, treasury: `0x${string}`, bucket: string, bps: number, currentTotalMinusBucket: number): PreparedBatch; // throws when currentTotalMinusBucket + bps > 10000 (AllocationOverflow mirror; caller supplies the on-chain figure from serverReads)
export function prepareSetAssetWhitelist(chainId: number, treasury: `0x${string}`, token: `0x${string}`, ok: boolean): PreparedBatch;
// Treasury (GOVERNANCE_ROLE — proposal payloads, NOT Safe txs; `governance` is the propose() destination,
// `description` is hashed keccak256(stringToHex(description)) per the binding convention above; throws on empty description):
export function prepareDisburseProposal(chainId: number, governance: `0x${string}`, treasury: `0x${string}`, token: `0x${string}`, to: `0x${string}`, amount: bigint, description: string): GovernanceProposalPayload;
export function prepareFundDividendsProposal(chainId: number, governance: `0x${string}`, treasury: `0x${string}`, distributor: `0x${string}`, amount: bigint, description: string): GovernanceProposalPayload;
// Dividends — the 2-tx epoch batch (approve THEN openEpoch; openEpoch PULLS via safeTransferFrom):
export function prepareOpenEpochBatch(chainId: number, token: `0x${string}`, distributor: `0x${string}`, amount: bigint): PreparedBatch; // txs[0]=token.approve(distributor,amount), txs[1]=distributor.openEpoch(amount); throws amount<=0
// Staking:
export function prepareSetApr(chainId: number, staking: `0x${string}`, bps: number): PreparedBatch; // throws bps>50000 ("apr>500%")
export function prepareFundRewardsBatch(chainId: number, token: `0x${string}`, staking: `0x${string}`, amount: bigint): PreparedBatch; // approve + fundRewards (same pull pattern)

// Safe Transaction Builder export:
export interface SafeTxBuilderJson {
  version: "1.0";
  chainId: string; // decimal string
  createdAt: number;
  meta: { name: string; description: string };
  transactions: { to: `0x${string}`; value: string; data: `0x${string}` }[];
}
export function safeTxBuilderJson(batch: PreparedBatch): SafeTxBuilderJson;
```

`bucket` encoding for `setAllocation`: the DB stores human bucket keys (`TreasuryAllocation.bucket`, e.g. `"embassy_ops"`); the on-chain key is `bytes32`. Encode as `keccak256(toBytes(bucket))`? — NO: verify how the Wave-7 seed/on-chain code keys buckets (`allocationBps(bytes32)`; the seed never set on-chain allocations). DECIDE and DOCUMENT: use `stringToHex(bucket, { size: 32 })` (bytes32 of the ASCII name, padded) as the canonical mapping, note it in prepare.ts AND in the C4 UI, and use the same mapping in `readAdminParamsServer` when reading `allocationBps` per DB bucket — the mapping just has to be consistent both ways (record the decision in the commit body). **Encodability is load-bearing:** `stringToHex(s, { size: 32 })` THROWS (`SizeExceedsPaddingSizeError`) for any string whose UTF-8 encoding exceeds 32 bytes, so (a) the B2 `allocationSchema` constrains `bucket` to `/^[a-z0-9_]{1,32}$/` (ASCII, ≤ 32 bytes, matching the seeded key style — no schema-valid row can ever be unencodable), (b) `prepareSetAllocation` validates the byte length as a DESIGNED mirror-throw (a clear message, not a raw viem exception) as the backstop for pre-schema rows, and (c) `readAdminParamsServer` wraps the per-bucket encoding — an unencodable bucket maps to `onchainBps: null` instead of throwing (one bad row must not degrade the whole treasury params card).

**`lib/admin/serverReads.ts`** (`"server-only"`; mirror `lib/passport/serverReads.ts` `serverClient`):

```ts
export interface AdminChainParams {
  chainId: number;
  available: boolean; // false when NO admin-relevant contract is registered
  addresses: Partial<Record<AdminContract, `0x${string}`>>; // the composer's source of truth
  token?: { paused: boolean; maxSupply: string; totalSupply: string };
  passport?: { requiredWitnesses: number; burnEnabled: boolean };
  governance?: { votingPeriod: string; quorumBps: number; executionDelay: string; minCitizensForProposal: string };
  treasury?: { totalAllocationBps: number; allocations: { bucket: string; onchainBps: number | null }[] }; // per DB TreasuryAllocation buckets
  distributor?: { currentEpoch: string };
  staking?: { aprBps: number; totalStaked: string; rewardPoolRemaining: string };
}
export function readAdminParamsServer(chainId: number): Promise<AdminChainParams>;

export interface RoleHolders { role: RoleName; roleId: `0x${string}`; holders: `0x${string}`[]; }
export interface ContractRoleTopology { contract: AdminContract; address: `0x${string}`; roles: RoleHolders[]; }
/** ALGORITHM (pinned — do NOT implement as a set-difference fold): candidates =
 *  the DISTINCT accounts appearing in RoleGranted logs ONLY; RoleRevoked logs are
 *  NOT applied to the candidate set (subtracting them false-negatives any
 *  grant→revoke→re-grant history — and the panel itself prepares revoke-then-
 *  regrant flows). Removal is EXCLUSIVELY the hasRole confirm step: every
 *  candidate is checked via hasRole and kept only when true. hasRole is the
 *  source of truth for the final holder list; the logs only bound the candidate
 *  universe (AccessControl is not enumerable). */
export function readRoleTopologyServer(chainId: number): Promise<{ chainId: number; available: boolean; contracts: ContractRoleTopology[] }>;
```

Per-contract availability via `contractEntry(chainId)` (non-throwing): include only registered contracts; ALL unregistered → `{available:false, addresses:{}}` (the 84532 default env). Every read wrapped so one failing contract degrades to omitted, never a thrown 500 (mirror Wave-7 constraint #11).

**`test/no-admin-signing.test.ts`** (static guard, mirror `test/no-server-wallet-import.test.ts`'s recursive-grep style): scan `lib/admin/`, `app/admin/`, `app/api/admin/`, `components/admin/` (existing dirs only), excluding `.test.` files' own assertion strings, and enforce TWO rules — this is Constraint #1's enforcement:

1. **Forbidden tokens, matched CASE-INSENSITIVELY** (so `useWriteContract`/`useSendTransaction` are caught by the bare names): `withEvmSigner`, `sendRawTransaction`, `sendTransaction`, `signTransaction`, `eth_sendTransaction`, `writeContract`, `signTypedData`, `signMessage`, `personal_sign`, `eth_sign`, `createWalletClient`, `privateKeyToAccount`, `mnemonicToAccount`, `hdKeyToAccount`, and `TxButton` — ZERO matches. NOTE: the bare `sendTransaction`/account-constructor tokens are load-bearing — viem's standard signing flow (`createWalletClient` + `privateKeyToAccount` + `walletClient.sendTransaction({...})`) contains NONE of the eth_-prefixed literals; D1 itself uses exactly that pattern (legally — it lives in `test/integration/`, OUTSIDE the scanned dirs, so no false positive).
2. **Forbidden imports (the import-boundary rule):** any import specifier matching `@/lib/wallet` (any subpath — `embedded/session`, `services/*` all wrap `withEvmSigner`+`sendRawTransaction` internally), `@/lib/governance/write`, `@/lib/dividends/write`, `@/lib/passport/mint`, or `wagmi` — ZERO matches. A file importing `proposeEmbedded`/`castVoteEmbedded`/service senders contains zero signing TOKENS yet signs and broadcasts; the import scan is what closes that bypass.

**TDD steps:**

1. [ ] RED — `lib/admin/prepare.test.ts`:
   - decode round-trips: for EVERY prepare fn, `decodeFunctionData({abi, data})` returns the exact functionName + args supplied (e.g. `prepareGrantRole(31337,"staking",addr,"REWARDS_ADMIN_ROLE",acct)` decodes to `grantRole(ROLE_IDS.REWARDS_ADMIN_ROLE, acct)`);
   - validation mirrors throw: `prepareSetQuorumBps(…,10001)`, `prepareSetRequiredWitnesses(…,11)`, `prepareSetApr(…,50001)`, `prepareSetMinCitizens(…,0n)`, `prepareSetAllocation(…, bps where currentTotalMinusBucket+bps>10000)`, `prepareSetAllocation` with a bucket whose UTF-8 encoding exceeds 32 bytes (designed byte-length mirror-throw, NOT a raw viem `SizeExceedsPaddingSizeError`), `prepareOpenEpochBatch(…,0n)`;
   - boundary values PASS: 10000 / 10 / 50000 / 1n encode fine; a 32-byte (32-char ASCII) bucket encodes fine;
   - the epoch batch is EXACTLY `[approve(distributor,amount) @ token, openEpoch(amount) @ distributor]` in that order; fundRewards batch analogous;
   - `prepareDisburseProposal` returns a `GovernanceProposalPayload` (target=treasury, decoded=disburse args, the honest-path note naming BOTH prerequisites — citizen proposer + content-row binding) and is NOT a `PreparedBatch`; its `descriptionHash === keccak256(stringToHex(description))` (the propose-embassy convention); its `propose.to` is the governance address and `decodeFunctionData` on `propose.data` yields `propose(target, 0n, callData, descriptionHash)` exactly; empty description throws;
   - every `PreparedTx.value === "0"`;
   - `safeTxBuilderJson` shape: `version "1.0"`, `chainId "31337"` (string), `transactions` [{to,value,data}] matching the batch, meta populated.
     `lib/admin/roles.test.ts`: `ROLE_IDS.DEFAULT_ADMIN_ROLE` is the zero hash; `ROLE_IDS.MINTER_ROLE === keccak256(toBytes("MINTER_ROLE"))` (and the other five).
     `lib/admin/serverReads.test.ts` (mock `createPublicClient` — mirror how Wave-7 serverReads tests mock it): `readAdminParamsServer` maps mocked reads into the interface; unregistered chain (84532 with empty entry) → `{available:false}` WITHOUT throwing; a single contract present → partial result; a DB bucket whose encoding would exceed 32 bytes maps to `onchainBps: null` (no throw, the rest of the card intact). `readRoleTopologyServer`: mocked `RoleGranted` [A,B] + `RoleRevoked` [B] logs with `hasRole` A=true, B=false → holders [A] (B dropped by the CONFIRM step, not by log subtraction); `hasRole` mocked false for A → holders [] (the confirm step is load-bearing, asserted); **MANDATORY re-grant case:** `RoleGranted[A]`, `RoleRevoked[A]`, `RoleGranted[A]` with `hasRole(A)=true` → holders [A] — this is the case a set-difference fold false-negatives (the pinned candidates-from-grants-only algorithm passes; hasRole can only REMOVE candidates, never restore a wrongly-dropped live holder).
     `test/no-admin-signing.test.ts`: seeded with the A3 dirs — passes only when no forbidden token OR forbidden import appears (write it RED by temporarily asserting against fixture strings for BOTH rules — e.g. a `walletClient.sendTransaction(` snippet and an `import { proposeEmbedded } from "@/lib/governance/write"` snippet; its real value is permanent enforcement).
2. [ ] GREEN — implement all four modules (+ `tokenAddress`/`tokenAvailable` in `config/contracts.ts` if grep shows them missing, with test cases mirroring the existing accessor tests).
3. [ ] Run `pnpm test lib/admin test/no-admin-signing.test.ts` && `pnpm typecheck` — green.
4. [ ] Commit.

---

# GROUP B — API

> Every mutation route copies the Wave-8 guard stack VERBATIM (`app/api/embassies/proposals/route.ts` shape): `isAllowedOrigin` → `requireAdmin` (catch `Response`) → `rateLimit` (per-admin userId key) → `req.json()` try/catch → Zod `.strict()` `safeParse` → business → `prisma.$transaction(mutation + writeAudit)` → `json`. Every GET: `requireAdmin` (catch `Response`) → prisma/serverReads → `json`. Every route test mirrors `test/applications-route.test.ts` + adds `__resetRateLimit()` in `beforeEach` (suites fire many authed mutations). Standard test cases for EVERY route: 401 no cookie; **403 role USER** (a second seeded non-admin user); mutations add 403 foreign origin, 400 unknown key (strict), 429 over the limit; happy path asserts the DB change AND the audit row (same action name, parseable before/after) AND that `JSON.stringify(responseBody) + beforeJson + afterJson` contain neither `passwordHash` nor `tokenHash`.

---

## Task B1 — Admin user + application routes (+ overview + audit list)

**Files:** NEW `app/api/admin/{overview,audit,users,users/[id],users/[id]/suspend,users/[id]/kyc,users/[id]/sessions/revoke,applications,applications/[id],applications/[id]/review}/route.ts` + a `route.test.ts` beside EACH; NEW `lib/validation/admin.ts` + `admin.test.ts` (user/application schemas this task; content/flag schemas added in B2).

**READ FIRST:** `app/api/embassies/proposals/route.ts` (the guard stack to copy), `test/applications-route.test.ts` (test shape), `lib/auth/session.ts` (`revokeSessionToken`/`revokeAllForUser`), `lib/admin/audit.ts` (A2), `lib/auth/types.ts` (`KYC_STATUSES`, `USER_ROLES`), `lib/applications/state.ts` (`APP_STATUS_ORDER` — the REAL statuses for filtering; NOT the stale union in types.ts), `lib/validation/mint.ts` (Zod `.strict()` convention), `prisma/schema.prisma`.

**Route contracts:**

| Route | Method | Body schema (`.strict()`) | Behavior |
|---|---|---|---|
| `/api/admin/overview` | GET | — | counts: users (total/suspended/admins), applications by `AppStatus`, content rows per model, flags; `recentAudit` (last 10, allowlist-serialized) |
| `/api/admin/audit` | GET | — (query: `action?`, `actorUserId?`, `page?` int ≥1, `pageSize` ≤ 100) | paginated `AuditLog` rows, newest first |
| `/api/admin/users` | GET | — (query: `q?` matches email OR name contains, `page?`) | SELECT-ALLOWLIST: `{id,email,name,role,kycStatus,suspendedAt,lockedUntil,failedLoginCount,createdAt,updatedAt}` + `_count.sessions` — NEVER `passwordHash` |
| `/api/admin/users/[id]` | GET | — | the allowlisted user + `sessions: {id,userAgent,ipHash,createdAt,expiresAt}` (NEVER tokenHash) + `linkedWallets: {address,chain,verifiedAt}` + application summary (status,kycStatus + the cache fields LABELED `chainDerived: true` in the payload) |
| `/api/admin/users/[id]/suspend` | POST | `{ suspended: boolean }` | `suspended:true` → ONE `$transaction`: set `suspendedAt: new Date()` + `tx.session.deleteMany({where:{userId}})` (the transactional twin of `revokeAllForUser` — same where-clause; document why it's inlined: `revokeAllForUser` uses the global client, not `tx`) + audit `user.suspend`; `false` → clear + audit `user.unsuspend`. Guard: an admin cannot suspend THEMSELVES (400, prevents self-lockout) |
| `/api/admin/users/[id]/kyc` | POST | `{ kycStatus: enum(KYC_STATUSES) }` | update + audit `user.kyc.set`. NOTE: schema has NO `role` field — a body containing `role` is 400 by strictness (explicit test) |
| `/api/admin/users/[id]/sessions/revoke` | POST | `{ sessionId: string }` XOR `{ all: true }` (zod union, strict) | delete the session(s) + audit `user.sessions.revoke` (targetType SESSION for single, USER for all; before = the allowlisted session row(s)) |
| `/api/admin/applications` | GET | — (query: `status?` ∈ `APP_STATUS_ORDER`, `page?`) | list w/ user email/name joined (allowlisted) |
| `/api/admin/applications/[id]` | GET | — | full application + `witnessSignatures` (PUBLIC data) + the `chainDerived` labels on sealTxHash/citizenTokenId |
| `/api/admin/applications/[id]/review` | POST | `{ kycStatus?: enum(KYC_STATUSES), reviewNote?: string.max(2000) }` — at least one key (zod refine) | update ONLY those two + audit `application.review`. A body containing `status`/`citizenTokenId`/`sealTxHash` → 400 by strictness (EXPLICIT test — constraint #6) |

Rate-limit keys: `admin-users:${userId}` 30/5min on the three user mutations; `admin-apps:${userId}` 30/5min on review. `actorLabel` = `` `admin:${user.email ?? user.id}` ``; `userAgent` from the request header.

**TDD steps:**

1. [ ] RED — per-route tests (node env, `__resetRateLimit()` beforeEach, seeded ADMIN + USER + a target user w/ session + an application w/ witness sig):
   - the standard cases (401 / 403-role / 403-origin / 400-strict / 429 / happy+audit+no-secret) for every route;
   - suspend: sets `suspendedAt`, Session count for the target → 0, audit row `user.suspend` with before/after, AND the target's old session token now fails `validateSessionToken` (integration with A1); unsuspend clears; self-suspend → 400;
   - kyc: `{kycStatus:"APPROVED"}` ok; `{kycStatus:"NOPE"}` 400; `{kycStatus:"APPROVED", role:"ADMIN"}` 400 (no promotion path);
   - sessions/revoke: single id deletes exactly one; `{all:true}` deletes all; audit before contains the allowlisted session (NO tokenHash key — assert on the raw beforeJson string);
   - review: note+kyc persist; `{status:"SEALED"}` → 400; `{citizenTokenId:"9"}` → 400; `{sealTxHash:"0x…"}` → 400;
   - users list: response JSON string contains no `"passwordHash"` and no `"tokenHash"`; `q` filters by email substring;
   - overview + audit list: counts/pagination correct; audit list filters by action.
2. [ ] GREEN — `lib/validation/admin.ts` (user/app schemas) + the routes.
3. [ ] Run `pnpm test app/api/admin lib/validation/admin.test.ts` — green. `pnpm guard:secrets` green.
4. [ ] Commit.

---

## Task B2 — Admin content CRUD + comment moderation + flags (+ public `/api/flags` + `lib/flags`)

**Files:** NEW content/flag routes per the File Structure (+ `route.test.ts` beside each group — one test file per content group is fine); NEW `app/api/flags/route.ts` + test; NEW `lib/flags/{defaults,server,client}.ts` + `defaults.test.ts`; EDIT `lib/validation/admin.ts` (content + flag schemas).

**READ FIRST:** `prisma/schema.prisma` (:158–216 — exact content model fields incl. the BigInt columns), `prisma/seed.ts` (the provenance-scrub regex + upsert style — the CRUD honesty guard mirrors it), `app/api/governance/proposals/[id]/comments/route.ts` (GET/POST + DELETE-adjacent shapes), Wave-7 A2's scrub note (plan §Task A2), `lib/admin/audit.ts`, `contracts/src/CryptTreasury.sol:79–85` (the allocation-sum rule being mirrored).

**Schemas (`lib/validation/admin.ts`, all `.strict()`):**

```ts
export const assetSchema = z.object({
  ref: z.string().min(2).max(16),
  kind: z.enum(["re","ip","eq","tr"]),
  name: z.string().min(1).max(200),
  location: z.string().min(1).max(200),
  valueUsd: z.string().regex(/^\d+$/),        // BigInt as decimal string over the wire
  yieldBps: z.number().int().min(0).max(100_000),
  annualYieldUsd: z.string().regex(/^\d+$/),
  status: z.string().min(1).max(120),
  acquiredAt: z.string().min(1).max(40),
}).strict()
  .refine(noFabricatedProvenance, { message: "Fabricated on-chain provenance is not allowed." });
// noFabricatedProvenance: !(/CR-L2|CryptRepublic L2|TITLED ON CHAIN/i).test(name+location+status) — the seed-scrub mirror (constraint #7)

export const embassySchema = z.object({ code: z.string().min(2).max(8), name, neighborhood, hours, foundedAt, brandColor, city, country }).strict(); // all bounded strings
export const censusSchema = z.object({ code, name, lat: z.number().min(-90).max(90), long: z.number().min(-180).max(180), hasEmbassy: z.boolean(), seededCount: z.number().int().min(0) }).strict();
export const allocationSchema = z.object({ bucket: z.string().regex(/^[a-z0-9_]{1,32}$/), label: z.string().min(1).max(120), targetBps: z.number().int().min(0).max(10_000), color: z.string().max(32) }).strict();
// bucket is ASCII ≤ 32 chars = ≤ 32 BYTES — guarantees stringToHex(bucket, {size:32}) (the canonical on-chain bytes32 mapping, A3) can NEVER throw SizeExceedsPaddingSizeError; a looser bound (e.g. max(64) or unrestricted charset/multi-byte UTF-8) would let a schema-valid DB row crash prepareSetAllocation AND readAdminParamsServer. Matches the seeded key style ("embassy_ops").
export const constitutionSchema = z.object({ key: z.string().min(1).max(64), title: z.string().min(1).max(200), body: z.string().min(1).max(20_000), citation: z.string().max(200).nullable().optional() }).strict();
export const proposalContentSchema = z.object({ title: z.string().min(1).max(200), tag: z.enum(["PROCEDURAL","CULTURAL","FISCAL","CIVIC","TECHNICAL"]), body: z.string().max(20_000).optional() }).strict(); // body applied ONLY when descriptionHash is null (route-level rule)
export const flagSchema = z.object({ key: z.string().regex(/^[a-z0-9_]{3,64}$/), enabled: z.boolean(), description: z.string().max(300).nullable().optional() }).strict();
```

**Route rules:**

- Collections: `GET` list (+ `POST` create). Items: `PUT` update, `DELETE` delete (embassies/census/constitution keyed by their natural ids; assets by `ref`; allocations by `bucket`). Every mutation: `$transaction(mutation + writeAudit)` — update audits carry BOTH before and after; deletes carry before only; creates after only.
- **Allocation-sum rule (constraint #7):** on create/update, inside the transaction compute `sum(targetBps of all OTHER rows) + new targetBps`; > 10000 → 400 `"Allocation targets exceed 100%."` (mirrors `AllocationOverflow`).
- **Proposal-content honesty:** `PUT /content/proposals/[id]` — when the row's `descriptionHash != null`, a body change → 400 `"Body is bound to the on-chain descriptionHash."`; title/tag always editable. No create route (proposal content is citizen/route-created against real proposalIds); no delete in v1 (record the decision).
- **Comment moderation:** `DELETE /api/admin/content/comments/[id]` — `$transaction`: read the comment, `writeAudit(tx, {action:"content.comment.delete", targetType:"COMMENT", before: comment})` (the deleted **body preserved in beforeJson** — constraint #7), delete.
- **Flags:** `GET /api/admin/flags` (all rows + the DECLARED defaults so the UI shows effective values), `POST /api/admin/flags` upsert (+audit `flag.upsert`), `DELETE /api/admin/flags/[key]` (+audit `flag.delete`, before preserved).
- **Public `GET /api/flags`** (NO auth — mirrors the public stats routes): `{ flags: Record<string, boolean> }` of DB rows only (clients merge defaults via `lib/flags`); **`Cache-Control: no-store` — REQUIRED and test-pinned (RED list below).** Rationale: any freshness window (e.g. `max-age=30`) makes flag flips invisible for its duration — D2 station 5 flips the flag and IMMEDIATELY re-visits `/dashboard/population` in the same browser context, and a cached response would deterministically fail its visibility assertion (Playwright contexts cache normally; expect timeout 5s < max-age). The route is a single cheap DB read; caching buys nothing an in-process memo couldn't. Never throws — a DB error returns `{ flags: {} }` (safe default posture).
- Rate-limit keys: `admin-content:${userId}` 60/5min; `admin-flags:${userId}` 30/5min.
- BigInt handling: convert `valueUsd`/`annualYieldUsd` strings ↔ BigInt at the route boundary; list GETs serialize BigInt → string (test-asserted; `JSON.stringify` on a BigInt throws — this is a real trap).

**`lib/flags`:**

```ts
// lib/flags/defaults.ts (env-NEUTRAL)
export const FLAG_DEFAULTS: Record<string, boolean> = {
  population_world_map: true, // the ONE Wave-9 consumer (C3). Default TRUE = zero behavior change until an admin flips it.
};
export function flagValue(key: string, row?: { enabled: boolean } | null | undefined): boolean; // row?.enabled ?? FLAG_DEFAULTS[key] ?? false

// lib/flags/server.ts ("server-only") — prisma lookup + flagValue; try/catch → default; NEVER throws.
export function flagEnabledServer(key: string): Promise<boolean>;

// lib/flags/client.ts ("use client"-safe) — fetch("/api/flags") with catch → {}; useFlag(key) applies flagValue defaults.
export function fetchFlags(): Promise<Record<string, boolean>>;
export function useFlag(key: string): boolean; // renders the DEFAULT until the fetch resolves (no flash-of-hidden for default-true flags)
```

**TDD steps:**

1. [ ] RED —
   - `lib/flags/defaults.test.ts`: missing row + declared default → true; missing row + undeclared key → false; row wins over default;
   - content route tests (per group): the standard cases + the honesty guards — asset create with `status: "OWNED · TITLED ON CHAIN"` → 400; with `location: "Chain · CR-L2"` → 400; allocation update pushing the sum to 10_001 → 400 while exactly 10_000 passes; allocation bucket boundary: a 32-char `[a-z0-9_]` bucket → 200 while a 33-char bucket, an uppercase/spaced bucket, and a multi-byte-UTF-8 bucket → 400 (the encodability guarantee — A3's `stringToHex(bucket,{size:32})` mapping must never be reachable with an unencodable key); proposal body edit with `descriptionHash` set → 400, with null → 200; comment DELETE persists the body inside `beforeJson` (parse + assert) and removes the row; BigInt round-trip: create an asset with `valueUsd: "28400000"` → GET returns the same string;
   - flags: upsert + audit; public `/api/flags` returns 200 WITHOUT a cookie and contains the row map; the response `Cache-Control` header is EXACTLY `no-store` (test-pinned — D2 station 5 depends on it); admin flags GET merges declared defaults.
2. [ ] GREEN — implement schemas, routes, lib/flags.
3. [ ] Run `pnpm test app/api/admin app/api/flags lib/flags lib/validation/admin.test.ts` — green. `pnpm guard:secrets` green.
4. [ ] Commit.

---

## Task B3 — Admin chain routes: `/api/admin/chain/params` + `/api/admin/chain/roles` (server reads only)

**Files:** NEW `app/api/admin/chain/params/route.ts` + `route.test.ts`, `app/api/admin/chain/roles/route.ts` + `route.test.ts`.

**READ FIRST:** `lib/admin/serverReads.ts` (A3 — these routes are thin wrappers), `lib/config/chain.ts` (`activeChain().primaryChainId`), the Wave-7 graceful-degradation posture (constraint #11 there), `app/api/stats/summary/route.ts` (a chain-read GET route shape to mirror).

**Contracts:** both GET-only, `requireAdmin` + `rateLimit("admin-chain:"+userId, 30, 5*60_000)` (they scan logs from block 0 — bounded but not free). `params` → `readAdminParamsServer(activeChain().primaryChainId)` (includes `addresses` — the composer's source of truth); `roles` → `readRoleTopologyServer(...)`. On the default testnet env (84532 unregistered) BOTH return 200 `{available:false, …}` — NEVER a 500 (graceful, test-asserted). Any RPC failure inside → the partial/available:false shape (serverReads already guarantees; assert the route doesn't re-throw).

**TDD steps:**

1. [ ] RED — route tests (mock `lib/admin/serverReads`): 401/403-role/429 standard; happy path maps the mocked shapes through; the unregistered-chain mock (`{available:false}`) returns 200 with `available:false`; a serverReads rejection returns 200 `{available:false}` (catch), never 500.
2. [ ] GREEN — implement.
3. [ ] Run `pnpm test app/api/admin/chain` — green.
4. [ ] Commit.

---

# GROUP C — UI

> Each C-task: Server Component `page.tsx` under `app/admin/*` mounting a `"use client"` island in `components/admin/*`; the design system (`styles/tokens.css`, squared corners, uppercase headings, mono data labels) + `Ledger`/`Modal`/`Card` reuse; the Wave-7 state matrix (loading skeleton / empty in-voice / per-card error + RETRY, never a blank screen); Wave-8 a11y (labels or `htmlFor`, focus management in modals via the existing `Modal`, compliant contrast tokens — remember the Topbar gold-on-white lesson). Admin fetches hit `/api/admin/*` with same-origin credentials; mutations send JSON POST/PUT/DELETE (the browser attaches Origin automatically — satisfies `isAllowedOrigin`).

---

## Task C1 — `/admin` layout guard + `AdminShell` + Overview + Audit viewer

**Files:** NEW `app/admin/layout.tsx`, `app/admin/page.tsx`, `app/admin/audit/page.tsx`; NEW `components/admin/{AdminShell,adminNavItems,AdminOverviewApp,AuditViewer}.tsx` + tests.

**READ FIRST:** `app/dashboard/layout.tsx` (the guard shape to extend), `components/shell/{DashboardShell,Sidebar,Topbar,navItems,NavIcon}.tsx` + `shell.module.css` (grid/drawer/topbar patterns + the ≤1024/≤860/≤760 breakpoints to reuse), `components/ui/{Seal,Card,Ledger}.tsx`, `lib/auth/guard.ts` (`getSession`).

**Shell decision (record in the component header):** a thin **`AdminShell`**, NOT `DashboardShell`. Rationale: `DashboardShell` hardwires `SessionCitizenProvider` (wallet/passport chain polling), the citizen card, the MINT CTA, and citizen nav badges (`proposals`/`dividend` — extra API traffic) — all wrong affordances for a back office. `AdminShell` reuses `shell.module.css`'s grid + drawer, `NavIcon`, `Seal`, and the Topbar structure, with: `adminNavItems` (Overview `/admin`, Users, Applications, Content, Flags, Chain actions, Audit — reuse `isActive` from `components/shell/navItems.ts`), a prominent `ADMIN` badge (`data-testid="admin-badge"`), and a "← Back to dashboard" link. No citizen context is mounted.

**`app/admin/layout.tsx`:**

```tsx
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();          // suspended users are already null here (A1 choke point)
  if (!session) redirect("/auth");
  if (session.user.role !== "ADMIN") redirect("/dashboard"); // UX guard; the API layer is the enforcement
  return <AdminShell adminEmail={session.user.email}>{children}</AdminShell>;
}
```

(Decision: redirect, not a 403 page — non-admins are ordinary users; don't advertise the admin surface. The API returns real 403s. Recorded per the acceptance's "403/redirect".)

**Overview** (`AdminOverviewApp`): stat tiles from `/api/admin/overview` (users / suspended / applications-by-status / content counts / flags) + a "Recent administrative actions" `Ledger` of the last 10 audit rows. **Audit viewer** (`AuditViewer`, also embedded at `/admin/audit`): `Ledger` of rows from `/api/admin/audit` with action + actor filter inputs and prev/next pagination; a row expands to pretty-printed before/after JSON (`data-testid="audit-row"`). Read-only.

**TDD steps:**

1. [ ] RED — `AdminShell.test.tsx` (jsdom/RTL): the 7 nav items render with correct hrefs; the ADMIN badge renders; the back-to-dashboard link points to `/dashboard`; NO citizen-card / MINT affordance (assert absence); active-item derives from `usePathname` (mock). `AdminOverviewApp.test.tsx` (mock fetch): loading skeleton; tiles render mocked counts; fetch error → in-voice error + RETRY (re-fetches); recent-audit ledger renders rows + an empty state. `AuditViewer.test.tsx`: rows render; the action filter refetches with the query param; expanding a row shows parsed before/after; pagination buttons drive `page`.
2. [ ] GREEN — implement (layout guard logic is 3 lines — covered by D2 e2e, not jsdom).
3. [ ] Run `pnpm test components/admin` — green. `pnpm build` compiles the new route group.
4. [ ] Commit.

---

## Task C2 — Users + Applications screens

**Files:** NEW `app/admin/users/page.tsx`, `app/admin/users/[id]/page.tsx`, `app/admin/applications/page.tsx`, `app/admin/applications/[id]/page.tsx`; NEW `components/admin/{UsersApp,UserDetail,ApplicationsApp,ApplicationDetail}.tsx` + tests.

**READ FIRST:** B1's route contracts (field shapes), `components/ui/{Ledger,Modal}.tsx`, `lib/applications/state.ts` (`APP_STATUS_ORDER` for the status filter chips), the mint-screen witness UI (`app/dashboard/mint/*` — how witness signatures render) for visual consistency.

- **UsersApp**: search box (`q`) + paginated `Ledger` (email / name / role chip / kycStatus / suspended tag / created) → row links to `/admin/users/[id]`.
- **UserDetail**: the allowlisted profile; a SUSPEND/UNSUSPEND button (confirm via `Modal`, in-voice copy: suspension revokes all sessions; disabled with a note when the target is the signed-in admin — mirrors the API rule); kycStatus select + APPLY; sessions `Ledger` (`userAgent`/`ipHash`/created/expires) with per-row REVOKE + REVOKE ALL; linked wallets list. NO role control ANYWHERE (constraint #2 — assert absence in the test).
- **ApplicationsApp**: status filter chips (the 5 REAL statuses) + `Ledger` → detail.
- **ApplicationDetail**: declared fields; witness signatures table (address / nonce / deadline / created — PUBLIC data); the chain-cache fields (`sealTxHash`/`citizenTokenId`) rendered with an explicit `CHAIN-DERIVED (not authoritative)` tag; kycStatus select + `reviewNote` textarea + SAVE REVIEW (POSTs `{kycStatus?, reviewNote?}` only). NO status override control (constraint #6 — assert absence).

**TDD steps:**

1. [ ] RED — `UsersApp.test.tsx` (mock fetch): list renders; search updates the query; suspended users show the tag; loading/empty/error+retry states. `UserDetail.test.tsx`: suspend button POSTs `{suspended:true}` after modal confirm and refreshes; the self-user case renders the disabled note; revoke-session POSTs `{sessionId}`; NO element matching `/role/i` as a form control (absence assertion); response render contains no `passwordHash` (fixture includes only allowlisted fields — assert the component never requests more). `ApplicationsApp.test.tsx`: status chips filter. `ApplicationDetail.test.tsx`: witness sigs render; the CHAIN-DERIVED tag renders next to sealTxHash/citizenTokenId; SAVE posts only kyc+note; there is NO status-editing affordance (absence).
2. [ ] GREEN — implement.
3. [ ] Run `pnpm test components/admin` — green.
4. [ ] Commit.

---

## Task C3 — Content + Flags screens + the ONE flag consumer (population world map)

**Files:** NEW `app/admin/content/page.tsx`, `app/admin/flags/page.tsx`; NEW `components/admin/{ContentApp,FlagsApp}.tsx` + tests; EDIT `components/population/PopulationApp.tsx` (+ its test) — the flag consumer; EDIT `e2e/dashboard-screens.spec.ts` — add the `/api/flags → { flags: {} }` stub to its fixture catalog (determinism; zero new registrations).

**READ FIRST:** B2 route contracts + schemas, `components/population/PopulationApp.tsx` (:187 `world-map` testid — the gated card; how its cards fetch), `components/population/PopulationApp.test.tsx` (the fetch-mock router to extend), `e2e/dashboard-screens.spec.ts` (:165 census fixture + :437–443 population assertions — MUST stay green), `lib/flags/client.ts`.

- **ContentApp**: tabbed (ASSETS / EMBASSIES / CENSUS / ALLOCATIONS / CONSTITUTION / PROPOSALS+COMMENTS). Each tab: `Ledger` list + create/edit `Modal` form (fields per schema; client-side mirrors of the honesty rules for instant feedback — the server remains the enforcement) + DELETE with confirm. ALLOCATIONS tab shows the live `sum(targetBps)` with an over-100% warning; PROPOSALS tab disables the body field when `descriptionHash` is set (with the in-voice reason); COMMENTS sub-list per proposal with a MODERATE (delete) action noting "the removed text is preserved in the audit log". Assets tab renders the seeded `SEEDED`/`DEMONSTRATIVE` context note (the UI tags STAY — constraint #7).
- **FlagsApp**: `Ledger` of flags (key / effective value / source: DB row vs declared default / description) + toggle (upsert POST) + create form + delete. In-voice note: "Missing flags fall back to their declared defaults; undeclared keys are OFF."
- **The consumer (PopulationApp):** gate the world-map CARD on `useFlag("population_world_map")` (declared default `true`). Flag off → the card is replaced by an in-voice note ("The world map is disabled by the administration.", `data-testid="world-map-disabled"`); the rest of the screen unaffected. The `top-cities`/hero cards are NOT gated (scope = exactly one card). Update `PopulationApp.test.tsx`'s fetch router to answer `/api/flags` (default `{}`), and add: flag-off fixture → `world-map` absent + `world-map-disabled` present; flags fetch REJECTS → map still renders (default-true resilience — constraint #8's "must not break when the row is absent").
- **dashboard-screens determinism:** add `"/api/flags": { flags: {} }` to its API fixture catalog so its `world-map`/`map-pin` assertions can never race the admin e2e's live flag flip (files run in parallel workers).

**TDD steps:**

1. [ ] RED — `ContentApp.test.tsx` (mock fetch): tabs switch; asset create POSTs the schema shape; a `TITLED ON CHAIN` status shows the client-side mirror error AND the mocked 400 renders in-voice; allocation sum warning at >10000; proposal body disabled when descriptionHash set; comment delete confirms + POSTs. `FlagsApp.test.tsx`: toggle POSTs upsert; effective-value/source render; create + delete. `PopulationApp.test.tsx` additions (above) — the flag-off + fetch-reject cases FAIL before the consumer lands.
2. [ ] GREEN — implement + the e2e stub edit.
3. [ ] Run `pnpm test components/admin components/population` — green. `pnpm e2e e2e/dashboard-screens.spec.ts` — green (the stub is inert with default-true).
4. [ ] Commit.

---

## Task C4 — Chain Actions screen: params + role topology + the prepared-tx composer + Safe JSON export

**Files:** NEW `app/admin/chain/page.tsx`; NEW `components/admin/{ChainActionsApp,PreparedActionCard}.tsx` + tests.

**READ FIRST:** `lib/admin/prepare.ts` + `roles.ts` (A3 — the composer is a thin form layer over these), B3's route payloads (`addresses` is the composer's address source — NEVER client-side registry accessors, which throw on 84532), `components/ui/{Card,Ledger,Modal}.tsx`, `test/no-admin-signing.test.ts` (the composer must keep it green — no TxButton, no signer imports).

- **Params cards** (per contract, from `/api/admin/chain/params`): current values (paused / requiredWitnesses / burnEnabled / votingPeriod / quorumBps / executionDelay / minCitizens / totalAllocationBps / aprBps / currentEpoch / MAX_SUPPLY vs totalSupply). `available:false` → ONE in-voice card: "No admin contracts are registered on this chain." (graceful — the default-env e2e asserts it).
- **Role topology** (from `/api/admin/chain/roles`): per contract, per role, the CONFIRMED holder addresses (log-derived + hasRole-checked — say so in a caption); contract-held roles annotated (e.g. GOVERNANCE_ROLE → "held by the Governance contract").
- **Composer**: an action select (grant/revoke role · pause/unpause · passport params · governance params · setAllocation/setAssetWhitelist · open dividend epoch (2-tx) · fundRewards (2-tx) · setApr · disburse/fundDividends AS PROPOSAL PAYLOAD) → typed form → client-side validation mirrors (same bounds as prepare.ts, shown inline BEFORE encoding; prepare's throws are the backstop) → `prepare*` → a `PreparedActionCard`. The treasury GOVERNANCE_ROLE composer takes a required `description` textarea, shows the derived `descriptionHash` (`keccak256(stringToHex(description))` — the propose-embassy convention), and renders as a `GovernanceProposalPayload` card whose note states BOTH submission prerequisites: "submit via a governance proposal FROM A CITIZEN WALLET — `propose()` reverts `NotCitizen` for non-passport-holders, so your Safe cannot submit this unless the Safe itself holds a passport; and create the matching `GovernanceProposalContent` row so the descriptionHash binds the proposal body (constraint #7)". The epoch composer surfaces the 2-tx nature explicitly ("1. approve — 2. openEpoch (pulls the funds)").
- **`PreparedActionCard`** (props `{ batch: PreparedBatch | GovernanceProposalPayload }`): renders chainId, per-tx to/value/decoded summary + expandable raw `data`; `COPY CALLDATA` per tx (navigator.clipboard); `DOWNLOAD SAFE TX BUILDER JSON` (Blob + `<a download>`; filename `crypt-admin-<action>-<chainId>.json`; content = `safeTxBuilderJson(batch)`) — proposal payloads get NO Safe JSON (they are not Safe txs; note why in-UI); their copyable artifact is the FULL `propose()` calldata (`payload.propose.data`, addressed to `payload.propose.to` = the Governance contract), rendered alongside the `description` + `descriptionHash` and the two-prerequisites note; and the MANDATED banner: **"PREPARED FOR YOUR SAFE — THIS PANEL NEVER SIGNS."** (`data-testid="never-signs-label"`). NO TxButton import, no wallet code (constraint #1; the static guard test covers it).

**TDD steps:**

1. [ ] RED — `PreparedActionCard.test.tsx`: renders decoded summary + to + chainId; COPY writes the calldata to a mocked clipboard; the download anchor's blob content parses to a valid `SafeTxBuilderJson` (version "1.0", string chainId, matching transactions); the never-signs banner renders; a 2-tx batch renders both txs in order; a proposal payload renders the two-prerequisites governance note (citizen proposer + content-row binding), the `descriptionHash`, a COPY control for the `propose()` calldata (`payload.propose.data` reaches the mocked clipboard, addressed to the governance `to`), and NO Safe-JSON button. `ChainActionsApp.test.tsx` (mock fetch): `available:false` → the graceful card and NO composer forms; with a params fixture → param values render, role topology renders holders, composing `setQuorumBps(10001)` shows the inline mirror error WITHOUT producing a card, `setQuorumBps(2500)` produces a card whose decoded args match, the epoch form with amount produces the 2-tx batch card. `test/no-admin-signing.test.ts` still green (now also scanning `components/admin/`).
2. [ ] GREEN — implement.
3. [ ] Run `pnpm test components/admin test/no-admin-signing.test.ts` — green.
4. [ ] Commit.

---

# GROUP D — VERIFICATION

---

## Task D1 — Anvil integration proof: prepared calldata is VALID end-to-end (the TEST signs, never the panel)

**Files:** NEW `test/integration/admin-prepared-e2e.test.ts`.

**READ FIRST:** `test/integration/anvil-harness.ts` (WHOLE — `startAnvilWithContracts`, `AnvilDeployment.admin` (anvil key #0, LOCAL/THROWAWAY), `fundCryptAndRewards`/`openDividendEpoch` treasury-genesis draw patterns, `foundryAvailable()` skip, the `git checkout -- config/contracts.ts` afterAll), `test/integration/governance-dividends-e2e.test.ts` (structure: `// @vitest-environment node`, env before imports, direct viem clients for out-of-band ops), `test/integration/wallet-e2e.test.ts:190–200` (the direct-anvil `testClient.increaseTime` warp pattern Proof E reuses), `lib/admin/prepare.ts` (env-neutral — imports cleanly in node).

**Test content** (skip gracefully when `!foundryAvailable()`):

- `beforeAll`: `startAnvilWithContracts([citizen1])` where `citizen1` is the address of anvil throwaway key #1 — a key the TEST holds, so Proof E can sign `propose()`/`castVote()` FROM A CITIZEN wallet (≥1 seeded citizen also means `openEpoch` has a snapshot — it reverts `NoCitizens` at 0); build a direct `createWalletClient({ account: privateKeyToAccount(deployment.admin.privateKey), chain: foundry, transport: http(rpcUrl) })` + a `createPublicClient`. **The signer lives in the TEST ONLY** — panel modules never sign (`test/no-admin-signing.test.ts` is the standing proof); this test's header states it.
- **Proof A — grantRole:** `const batch = prepareGrantRole(31337, "staking", deployment.staking, "REWARDS_ADMIN_ROLE", NEW_ADDR)`; `walletClient.sendTransaction({ to: batch.txs[0].to, data: batch.txs[0].data })`; wait receipt success; `hasRole(ROLE_IDS.REWARDS_ADMIN_ROLE, NEW_ADDR)` → true (was false before — assert both). Then `prepareRevokeRole` → broadcast → false again.
- **Proof B — setApr:** read `aprBps()` (deploy value 1180); `prepareSetApr(31337, deployment.staking, 2500)` → broadcast → `aprBps() === 2500`. Also assert the local mirror: `prepareSetApr(…, 50001)` throws WITHOUT any tx (and, belt-and-braces, a raw 50001 call via encodeFunctionData reverts on-chain — optional).
- **Proof C — the 2-tx epoch batch:** fund admin with $CRYPT via the harness treasury-genesis draw pattern (reuse/mirror `fundCryptAndRewards`'s grant+disburse — setup MAY use `castSend`; only the PREPARED txs must go through the prepared calldata); `const batch = prepareOpenEpochBatch(31337, deployment.token, deployment.distributor, amount)`; broadcast `txs[0]` (approve) then `txs[1]` (openEpoch) in order; assert `currentEpoch() === 1n`, `epochs(1).open === true`, `perCitizen === amount / totalCitizens()`. Broadcasting `txs[1]` WITHOUT the approve first would revert — assert the ordering matters by… (do NOT actually assert the revert against a fresh distributor unless cheap; a comment suffices — the ordered success IS the proof the batch is complete).
- **Proof D — Safe JSON integrity:** `safeTxBuilderJson(batch).transactions[i].data === batch.txs[i].data` and `to` matches (the export is byte-faithful to what was proven on-chain).
- **Proof E — the treasury proposal payload executes end-to-end** (the ONLY prepared-artifact class not covered by A–D is exactly the one the plan flags as needing honesty — prove it): fund the treasury with $CRYPT via the harness treasury-genesis draw (setup MAY use `castSend`); `const payload = prepareDisburseProposal(31337, deployment.governance, deployment.treasury, deployment.token, RECIPIENT, amount, "wave9 d1 disburse proof")`; broadcast `payload.propose.data` to `payload.propose.to` signed by the CITIZEN wallet (key #1 — the admin-only wallet would revert `NotCitizen`, which is Proof E's negative assertion: broadcasting the same propose from a NON-citizen account reverts); read the created proposal and assert its on-chain `descriptionHash === payload.descriptionHash`; `castVote(proposalId, tokenId, For)` from the citizen; time-warp past `votingPeriod` + `executionDelay` (the `wallet-e2e.test.ts:196–198` pattern — a DIRECT anvil `testClient.increaseTime`; anvil-local cheatcode, out-of-band setup, never through the app's RPC allowlist); `execute(proposalId)`; assert the RECIPIENT's token balance increased by `amount` (the treasury balance moved through the prepared `callData` verbatim).
- `afterAll`: stop anvil + `git checkout -- config/contracts.ts` (harness convention).

**TDD steps:**

1. [ ] RED — write the test (fails until A3's prepare exists / compiles; if A3 landed first, RED = write assertions before wiring the broadcasts, watch them fail on unbroadcast state).
2. [ ] GREEN — wire the broadcasts.
3. [ ] Run `pnpm test:integration` — the new suite passes AND `mint-e2e` + `wallet-e2e` + `governance-dividends-e2e` still pass (count ≥ 11 grows).
4. [ ] Commit.

---

## Task D2 — Admin Playwright spec (0 registrations; login-bootstrapped)

**Files:** NEW `e2e/admin-panel.spec.ts`.

**READ FIRST:** `playwright.config.ts` (prod webServer, shared `prisma/dev.db`), `e2e/critical-path.spec.ts` (header-ledger convention + stub patterns + the axe helper to COPY — specs are standalone), `e2e/dashboard-screens.spec.ts` (fixture-stub catalog incl. the new `/api/flags` stub), `app/api/auth/login/route.ts` (body `{email, passphrase}`; limit 20/15min/IP), `lib/auth/password.ts` (Argon2id — generate the constant), B3 payload shapes (for the chain fixtures).

**Bootstrap (in-spec, `test.describe.serial`, ONE worker file):**

- Header comment: REGISTER BUDGET — total stays **9** (this spec adds **0**); it uses `POST /api/auth/login` (~3 logins, limit 20/15min, grep-verified unused by other specs — RE-VERIFY with `grep -rn "auth/login" e2e/` before writing); any future spec updates the ledger.
- Prisma direct: `new PrismaClient({ datasources: { db: { url: "file:" + path.resolve(__dirname, "../prisma/dev.db") } } })` — ABSOLUTE path (SQLite relative URLs resolve against the schema, not CWD); import from `@prisma/client`, NEVER `@/lib/db` (`"server-only"` throws in the Playwright node process). VERIFY at implementation time that `pnpm build` has generated the client (the webServer build guarantees it).
- `KNOWN_HASH`: a precomputed Argon2id encoded hash of the spec's `PASS` constant — generate ONCE during implementation via `node -e` with `@node-rs/argon2` and commit the constant (it hashes a throwaway test password; not a secret). `beforeAll` upserts: `admin-e2e@cryptrepublic.local` (role ADMIN) and `citizen-e2e@cryptrepublic.local` (role USER), both `passwordHash: KNOWN_HASH`, cleaning stale rows first (idempotent re-runs).

**Stations:**

1. **Non-admin guard:** login as the USER via `page.request.post("/api/auth/login", { data: { email, passphrase: PASS }, headers: { origin: baseURL } })` → cookie captured; `page.goto("/admin")` with that cookie → lands on `/dashboard` (redirect asserted); `request.get("/api/admin/users")` with the cookie → **403**; without any cookie → **401**. Keep the citizen cookie for station 3.
2. **Admin login + shell:** login as ADMIN (fresh context); `/admin` renders Overview with `admin-badge` + the 7 nav items + recent-audit ledger.
3. **Users / suspend flow:** `/admin/users` → search the citizen user → detail → SUSPEND (modal confirm) → the row shows suspended; now the CITIZEN cookie from station 1 is dead: `request.get("/api/applications", { headers: { cookie } })` → 401 (the A1 choke point over the wire). The audit viewer shows a `user.suspend` row.
4. **Content edit + audit:** `/admin/content` → EMBASSIES tab → edit `LIS` `hours` to a marker string → save → row updated; `/admin/audit` shows `content.embassy.update` whose afterJson contains the marker; RESTORE the original hours (hygiene — other specs stub `/api/embassies`, so this is belt-and-braces).
5. **Flags + the consumer flips:** `/admin/flags` → create/toggle `population_world_map` → `enabled=false`; `page.goto("/dashboard/population")` (this context stubs `/api/population/census` + the other census fixtures for determinism but does NOT stub `/api/flags`) → `world-map` ABSENT + `world-map-disabled` visible; toggle back ON → map visible again; finally DELETE the flag row (restore missing-row default; dashboard-screens is independently protected by its C3 stub). This immediate flip-and-revisit is only deterministic because `/api/flags` serves `Cache-Control: no-store` (B2, test-pinned there) — with any freshness window the context's HTTP cache would serve the stale flag map for the window's duration and the visibility assertion would time out; if this station flakes, check that header FIRST.
6. **Chain actions:** visit `/admin/chain` with `/api/admin/chain/params` + `/api/admin/chain/roles` STUBBED to a deterministic registered-chain fixture (addresses = anvil-style constants) → params render, role topology renders, compose a `grantRole` → `PreparedActionCard` renders decoded args + the `never-signs-label`; the Safe-JSON download resolves and parses (`version "1.0"`, matching data). THEN re-visit with the stubs REMOVED (live default env, 84532 unregistered) → the graceful "No admin contracts are registered on this chain." card (both honesty states covered; the calldata VALIDITY is D1's anvil proof, not the browser's).
7. **Axe:** run the copied `expectNoCriticalOrSerious` helper on `/admin`, `/admin/users`, `/admin/chain` (same ZERO critical/serious threshold).
8. `afterAll`: delete the two e2e users (cascade cleans sessions/applications) + any flag rows created; `db.$disconnect()`.

**TDD steps:**

1. [ ] RED — write the spec; first run fails on missing selectors/testids (fix selectors only; a genuinely missing affordance is a C-group bug — fix there first, never weaken an assertion).
2. [ ] GREEN — `pnpm e2e e2e/admin-panel.spec.ts`.
3. [ ] Run the FULL `pnpm e2e` — all specs green in ONE run; the run itself proves registrations = 9 (< 10) and no login-limit trip.
4. [ ] Commit.

---

## Task D3 — Close-out: docs (README / ARCHITECTURE / MAINNET_HANDOFF / CHANGELOG) + version + FULL gate + acceptance checklist

**Files:** EDIT `README.md`, `docs/ARCHITECTURE.md`, `docs/MAINNET_HANDOFF.md`, `CHANGELOG.md`, `package.json` (`"version": "0.9.0"`).

**READ FIRST:** `README.md` (nav links + the wave table :101 + scripts list), `docs/ARCHITECTURE.md` (§ numbering — append the admin section after §10; the honesty/testing sections it must cross-link), `docs/MAINNET_HANDOFF.md` (the key-custody § where the panel↔Safe flow belongs; the 8-steps section for the grant-admin step), `CHANGELOG.md` (Keep-a-Changelog shape), the Wave-8 D-task verification loops (link-check one-liner + honesty audit).

**Content contracts:**

1. **README:** wave table row 9 → Delivered (dated); an "Admin panel" paragraph (role-gated `/admin`, audit-logged mutations, NON-CUSTODIAL — "prepares Safe transactions; never holds keys, signs, or moves funds"); `pnpm admin:grant <email>` in the scripts list; test-matrix counts refreshed from the ACTUAL close-out run.
2. **ARCHITECTURE — new "§11 Admin panel":** the role model (`User.role`, `requireAdmin`, CLI-only bootstrap — no promotion API), the suspend choke point (`validateSessionToken`), the guard stack per admin route, the audit-in-same-transaction rule + serializer allowlist, feature flags (declared defaults; the one consumer), and the PREPARED-tx model (pure encoders → `{to,value,data,decoded}` → Safe Transaction Builder JSON; treasury GOVERNANCE_ROLE actions are proposal payloads; the static no-signing guard test; D1 proves calldata validity on anvil with a test-held throwaway key).
3. **MAINNET_HANDOFF:** in the key-custody section — "the admin panel PREPARES admin transactions for the Safe (Transaction Builder JSON import); it never holds keys or signs; the Safe + timelock remain the sole signers"; a **grant-admin bootstrap runbook** subsection (operator-run, DB access required, audited as `cli`; revoke via `--revoke`; never grant to shared accounts); note that panel-prepared txs go through the SAME Safe review discipline as hand-built ones.
4. **CHANGELOG:** `## [0.9.0] — <date>` (Wave 9 itemized per group A–D, honest); `package.json` version 0.9.0. The tag command note stays USER-scoped (the assistant tags nothing).
5. **Close-out — run the FULL gate** and record real counts in the commit body:
   `pnpm guard:secrets && pnpm format:check && pnpm typecheck && pnpm lint && pnpm test && pnpm test:integration && pnpm e2e && (cd contracts && forge test && forge snapshot --check && bash scripts/coverage-gate.sh) && pnpm build` — ALL green (forge untouched this wave: still 165; snapshot/coverage gates unaffected).

**Verification (docs "test"):**

1. [ ] Link-check every relative path in the touched docs (the Wave-8 D1 loop) — zero broken.
2. [ ] Honesty audit: no fabricated claims; the non-custodial boundary stated wherever the panel/Safe appears; counts pulled from the actual gate run.
3. [ ] The full gate (item 5) green; `pnpm format:check` green.
4. [ ] Verify the final acceptance checklist below; check every box in the commit/PR body.
5. [ ] Commit.

---

## Final acceptance checklist (spec §9 Wave 9 row — verify before claiming Wave 9 complete)

- [ ] **Admin role + guarded routes enforced:** `User.role` union + `requireAdmin` (401/403); `/admin` layout redirects unauthenticated → `/auth`, non-admin → `/dashboard`; every `/api/admin/*` route API-enforced independent of the layout; non-admin 403 + unauthenticated 401 proven in route tests AND over the wire in `e2e/admin-panel.spec.ts` (A1, B1–B3, C1, D2).
- [ ] **No promotion path:** no API accepts `role` (strict schemas — explicit 400 tests); bootstrap only via `pnpm admin:grant` (CLI, DB-access operator, audited `actorLabel:"cli"`) — and the CLI is proven to EXECUTE under real tsx by the A2 subprocess smoke test (in-process tests run under the vitest `server-only` alias and cannot catch a broken CLI import graph) (A1, A2, B1).
- [ ] **Every mutation authorized + audit-logged:** the Wave-8 guard stack on every admin mutation (origin → requireAdmin → per-admin rateLimit → zod .strict); the audit row written IN THE SAME `$transaction`; before/after through the serializer allowlist — `passwordHash`/`tokenHash` provably never serialized; audit viewer ships (A2, B1–B2, C1).
- [ ] **No secret exposure:** user/session responses select-allowlisted; tests assert response JSON contains neither `passwordHash` nor `tokenHash`; `pnpm guard:secrets` green with the new models (A1, B1).
- [ ] **Suspend works end-to-end:** `suspendedAt` + transactional revoke-all + audit; suspended users rejected at BOTH session-creating login routes — password `/api/auth/login` AND SIWE `/api/auth/siwe/verify` (generic 401, no cookie, no Session row) — AND at every session validation (choke point); proven in unit (incl. `test/siwe-routes.test.ts`) AND over the wire (station 3) (A1, B1, D2).
- [ ] **Application review is off-chain-honest:** kycStatus + reviewNote only; status/citizenTokenId/sealTxHash not editable (400s asserted); CHAIN-DERIVED labels in the UI (B1, C2).
- [ ] **Content CRUD works + honesty invariants hold:** CRUD for all 6 groups + comment moderation (body preserved in beforeJson); provenance-regex 400s; allocation-sum ≤ 10000 mirror; proposal body immutable under a set descriptionHash; SEEDED/DEMONSTRATIVE UI tags intact (B2, C3).
- [ ] **Feature flags real:** model + admin CRUD (+audit) + public `/api/flags` served `Cache-Control: no-store` (test-pinned) + declared-default helpers that never throw on a missing row; EXACTLY ONE consumer (population world map, default TRUE) proven flipping in D2; `dashboard-screens` stubbed deterministic (B2, C3, D2).
- [ ] **NON-CUSTODIAL, absolutely:** the panel prepares `{to,value,data,chainId,decoded}` + Safe Transaction Builder JSON and NEVER signs/broadcasts — `test/no-admin-signing.test.ts` green on BOTH rules in `lib/admin|app/admin|app/api/admin|components/admin`: (1) the case-insensitive forbidden-token scan (withEvmSigner / sendRawTransaction / sendTransaction / signTransaction / eth_sendTransaction / writeContract / signTypedData / signMessage / personal_sign / eth_sign / createWalletClient / privateKeyToAccount / mnemonicToAccount / hdKeyToAccount / TxButton — catches viem's bare `walletClient.sendTransaction` flow and wagmi's `useWriteContract`/`useSendTransaction`), and (2) the import-boundary scan (no `@/lib/wallet`*, `@/lib/governance/write`, `@/lib/dividends/write`, `@/lib/passport/mint`, `wagmi` — importing a wrapper that signs internally must fail the guard too); the "PREPARED FOR YOUR SAFE — THIS PANEL NEVER SIGNS" label test-asserted (unit + e2e); treasury GOVERNANCE_ROLE actions prepared as full PROPOSAL payloads (descriptionHash-bound) with the two-prerequisites honest-path note (A3, C4, D2).
- [ ] **Prepared calldata proven VALID on anvil:** grantRole/revokeRole flip `hasRole`; setApr lands; the approve+openEpoch 2-tx batch opens epoch 1 with the right perCitizen; the Safe JSON is byte-faithful; AND the treasury proposal payload executes end-to-end — the prepared disburse `callData` broadcast through `propose` (citizen wallet) → `castVote` → time-warp → `execute` moves the treasury balance, with the on-chain descriptionHash matching the payload's (Proof E) — the TEST signed with anvil throwaway keys, panel code never (D1).
- [ ] **Chain reads honest + graceful:** params + role topology (RoleGranted/RoleRevoked logs + hasRole confirmation) via serverReads; `available:false` (never 500/crash) on the unregistered default chain — unit, route, and e2e-asserted; NO new RPC allowlist methods (A3, B3, C4, D2).
- [ ] **State matrix + a11y on every admin screen:** loading/empty/error+retry per screen (unit-asserted); axe ZERO critical/serious on `/admin`, `/admin/users`, `/admin/chain` (C1–C4, D2).
- [ ] **ZERO regressions + budgets:** full gate green — `pnpm guard:secrets && pnpm format:check && pnpm typecheck && pnpm lint && pnpm test && pnpm test:integration && pnpm e2e && (cd contracts && forge test && forge snapshot --check && bash scripts/coverage-gate.sh) && pnpm build`; unit > 398, integration > 11, e2e > 22, forge = 165; e2e registrations = 9 (< 10, the run proves it); login-route usage documented in the spec header (D2, D3).
- [ ] **Docs updated:** README (wave 9 Delivered + admin section + admin:grant), ARCHITECTURE §11 (admin model incl. prepared-tx flow), MAINNET_HANDOFF (panel-prepares-Safe-txs + grant-admin bootstrap runbook), CHANGELOG 0.9.0 + version bump (D3).
- [ ] **Local-anvil-only:** nothing deployed/signed/funded on a real network by the assistant at any point; per-task commits carry the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.

---

## Notes for the implementer (traps — verified)

1. **`@/lib/db` and every `"server-only"` module are UNIMPORTABLE in Playwright specs and plain node scripts run outside Next.** `server-only` is NOT an installed package in this repo — Next vendors it at build time; under tsx/plain node the import fails with ERR_MODULE_NOT_FOUND, and vitest ALIASES it to `test/empty-module.ts` (vitest.config.ts), so in-process unit tests CANNOT catch this class of breakage — only the A2 subprocess CLI smoke test can. The admin e2e uses `@prisma/client` directly with an ABSOLUTE `file:` URL (relative SQLite URLs resolve against `prisma/schema.prisma`, not CWD). `scripts/grant-admin.ts` runs under tsx like `prisma/seed.ts` — mirror its import pattern, not `lib/db.ts`.
2. **`lib/admin/{abis,roles,prepare,audit}.ts` + `lib/flags/defaults.ts` must be environment-NEUTRAL** (no server-only/client-only markers) — the browser composer, jsdom tests, the D1 node test, route handlers, and (for audit.ts) the tsx-run `scripts/grant-admin.ts` import them. `audit.ts` in particular MUST NOT be `"server-only"`: it takes the `Prisma.TransactionClient` as a parameter, imports only `@prisma/client` types, holds nothing server-secret — and marking it would crash the ONLY admin-bootstrap path at import time while every vitest suite stays green (see note #1). Only `lib/admin/serverReads.ts` and `lib/flags/server.ts` are `"server-only"`.
3. **Do NOT origin-gate GETs.** `isAllowedOrigin` requires Origin/Referer; same-origin GET fetches may carry neither (csrf.ts documents the exemption). Mutations only — matching every existing route.
4. **`__resetRateLimit()` in `beforeEach`** of every admin route suite — B1/B2 suites fire more authed mutations per file than the limits allow (the exact Wave-8 B1 regression).
5. **BigInt in JSON throws.** `AssetCatalogEntry.valueUsd`/`annualYieldUsd` are BigInt — stringify at the route boundary AND inside `serializeForAudit` (test-covered in both places).
6. **The suspend check goes in `validateSessionToken`, nowhere else** — one line covers every guard + page; scattering it invites drift. BOTH session-creating routes additionally return the GENERIC error (no suspension oracle): the password login route AND the SIWE verify route (`app/api/auth/siwe/verify/route.ts`, before `createSession`) — there are TWO ways to mint a `cr_session` cookie, and forgetting the SIWE one lets suspended wallet-linked users stack Session rows that go live on unsuspend.
7. **The composer's addresses come from `/api/admin/chain/params`,** never from client-side `governanceAddress(84532)`-style accessors (they THROW on the default env). This is also what makes D2's stubbed composer station possible.
8. **Parallel-worker flag races + HTTP caching:** e2e spec FILES run in parallel workers. The C3 `/api/flags` stub in `dashboard-screens.spec.ts` is the load-bearing determinism fix; the admin spec's restore (toggle back + delete) is hygiene, not the guarantee. Separately, `/api/flags` MUST serve `Cache-Control: no-store` (B2, test-pinned) — D2 station 5's flip-then-immediately-revisit reads the flag live in the same browser context, and any freshness window would serve the stale cached value and fail the assertion.
9. **`lib/auth/types.ts` `APPLICATION_STATUSES` is STALE** (`SUBMITTED|APPROVED|…` vs the real `ATTESTED|OATH_ACCEPTED|WITNESSED|SEALED` in `lib/applications/state.ts`). Admin filtering uses `APP_STATUS_ORDER` from state.ts. Do not touch the stale union this wave — note the divergence.
10. **AdminShell mounts NO `SessionCitizenProvider`** — no wallet/passport polling in the back office; that is half the reason it exists (the other half: wrong affordances).
11. **`setAllocation`'s on-chain rule is `total − current[bucket] + new ≤ 10000`** — the prepare mirror takes `currentTotalMinusBucket` as an explicit argument (pure function; the UI supplies it from `/api/admin/chain/params`, the DB rule computes it from the OTHER rows in the same transaction). Don't conflate the DB-target rule (sum of all rows) with the on-chain rule (needs the live figures).
12. **`openEpoch` PULLS via `safeTransferFrom`** — a single prepared openEpoch tx WILL revert without the approve; always emit the 2-tx batch, render the ordering in-UI, and prove the ordered pair on anvil (D1 Proof C). Same pull pattern for `fundRewards`.
13. **Role topology: candidates from RoleGranted logs ONLY; removal is EXCLUSIVELY the hasRole confirm.** Do NOT fold RoleRevoked into the candidate set (a set-difference fold false-negatives grant→revoke→re-grant histories — which the panel's own revoke-then-regrant flows produce — and hasRole can only remove candidates, never restore a wrongly-dropped live holder). The serverReads tests assert BOTH directions: a log-derived candidate is DROPPED when hasRole says false, and the RoleGranted[A]→RoleRevoked[A]→RoleGranted[A] + hasRole(A)=true sequence yields holders [A].
14. **The bucket string↔bytes32 mapping must be one consistent choice** used by BOTH `prepareSetAllocation` and `readAdminParamsServer` (decision recorded: `stringToHex(bucket, {size: 32})`) — a mismatch silently reads zeros for every bucket. And it must be ENCODABLE: `stringToHex(s, {size:32})` throws for UTF-8 > 32 bytes, so the B2 `allocationSchema` pins `bucket` to `/^[a-z0-9_]{1,32}$/`, `prepareSetAllocation` mirror-throws on byte length as backstop, and `readAdminParamsServer` maps an unencodable bucket to `onchainBps: null` instead of throwing.
15. **The KNOWN_HASH constant in the admin e2e is a hash of a throwaway test password** — generate with `@node-rs/argon2` once, commit the encoded string, document it in the spec header (it must not trip any future secret-scanning heuristics: name it `E2E_ARGON2_HASH_OF_TEST_PASSWORD`).
16. **grant-admin idempotency:** re-granting an existing ADMIN short-circuits with a message and writes NO duplicate audit row (recorded decision — keeps the audit trail meaningful).

---

## Post-review addenda (reviewer MINOR findings — honor during the build)

The adversarial review applied all 10 blocker+major findings above. Nine distinct **minor** findings remain; honor them during implementation:

1. **Session revoke must bind ownership:** `POST /api/admin/users/[id]/sessions/revoke` uses `prisma.session.deleteMany({ where: { id: sessionId, userId: params.id } })` and returns 404 when zero rows match — an admin can never revoke ANOTHER user's session under a mismatched audit target. RED test: a sessionId belonging to a different user → 404, nothing deleted, no audit row.
2. **No committed plaintext admin credential in D2:** generate a per-run random password (`crypto.randomBytes(24).toString("base64url")`) in `beforeAll`, hash at runtime with `@node-rs/argon2` using the same params as `lib/auth/password.ts` — never a committed KNOWN_HASH/PASS pair upserted into the shared dev.db.
3. **PreparedActionCard shows the required role:** annotate every card with the role the executing Safe must hold (FUNDER_ROLE for openEpoch, REWARDS_ADMIN for setApr/fundRewards, PAUSER for pause, `getRoleAdmin(role)` for grant/revoke) plus the currently-confirmed holders from the topology already on the screen — so the operator sees a would-revert warning before export.
4. **Two label variants (same testid `never-signs-label`):** Safe batches keep "PREPARED FOR YOUR SAFE — THIS PANEL NEVER SIGNS"; GovernanceProposalPayload cards read "PREPARED AS A GOVERNANCE-PROPOSAL PAYLOAD — NOT A SAFE TRANSACTION — THIS PANEL NEVER SIGNS" (no Safe JSON export on those).
5. **roles.test covers ALL role constants programmatically:** assert DEFAULT_ADMIN_ROLE is the zero hash and EACH of the seven named roles (GENESIS_ATTESTOR, PASSPORT_ADMIN, MINTER, PAUSER, GOVERNANCE, FUNDER, REWARDS_ADMIN) equals `keccak256(toBytes(name))` — iterate ROLE_NAMES, don't enumerate by hand.
6. **getLogs-from-0 limitation on real chains:** add an optional per-chain `deployBlock` to the registry entry (default 0n on 31337) threaded into the topology getLogs calls, or at minimum document in ARCHITECTURE §11 + MAINNET_HANDOFF that role-topology reconstruction from block 0 may hit provider limits on Base/Base Sepolia and the fromBlock should be set to the deploy block.
7. **adminDistributorAbi needs the `epochs(uint256)` tuple getter** (or D1 explicitly imports the frozen user-path `lib/dividends/abi.ts` for its `epochs` assertion) — D1 Proof C asserts `epochs(1).open` and `perCitizen`, which the admin ABI as first drafted omits.
8. **Prepared-action audit posture recorded explicitly:** composing/exporting calldata is pure client-side and writes no AuditLog row — record this exclusion in constraint #3's prose, ARCHITECTURE §11, and MAINNET_HANDOFF ("prepared calldata is not audited by the panel; the Safe's own review/queue is the audit surface") so "audit-everything" is honestly scoped to server mutations.
9. **/api/flags DB-failure RED case:** mock the prisma featureFlag read to reject and assert the route still returns 200 `{ flags: {} }` — the never-throws posture is load-bearing for every consumer and must be asserted, not assumed.
