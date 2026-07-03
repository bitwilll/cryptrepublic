# CryptRepublic Wave 12 — Referral-Gated Attestation · Admin-Allocated Referral Tokens · Hybrid Trust Score — Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL — before executing any task below, invoke `superpowers:test-driven-development` and `superpowers:executing-plans`. Every task is TDD: write the failing test FIRST (RED), then the implementation (GREEN), then run the stated command and confirm green. Do NOT skip the RED step. Keep ALL prior tests green (baseline as of Wave 11 close-out: **881 unit / 18 integration / 37 e2e @ 9 registrations / 165 forge**). Commit each task separately with the trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Goal

Wave 12 layers a **referral policy** on top of the existing on-chain 7-witness EIP-712 seal, WITHOUT ever moving citizenship off-chain. Three locked product decisions:

1. **REFERRAL-GATED ATTESTATION.** A citizen may only submit a witness attestation for an applicant they have **referred**. Because ALL of an applicant's witnesses must be referrers of that applicant, sealing a passport now requires the applicant to have been referred by `>= requiredWitnesses()` **distinct** citizens, and those same citizens attest. "Multi-referral" means one referrer can refer many different applicants (no cap beyond the create-gate in #2). Enforcement is a NEW server-side precondition inside `POST /api/applications/witnesses/submit`, applied AFTER the witness is recovered from the signature and confirmed an on-chain citizen, and BEFORE the `WitnessSignature` row is created. A rejected witness simply never creates a row, so the existing `collected >= required → WITNESSED` transition automatically respects the gate with no change. **On-chain `mintWithWitnesses` knows nothing about referrals** — the referral is enforced ONLY at submit, never re-checked at seal.

2. **REFERRAL GATING (who may create a referral).** A citizen may create a referral ONLY IF they (a) hold an available admin-allocated **referral token** (a DB counter, consumed on referral), OR (b) have a hybrid trust score `> 50` (which BYPASSES the token cost — referring is then free). **DECISION: referral tokens are an OFF-CHAIN admin-controlled quota (a DB counter on the referrer's User), NOT an ERC-20.** An on-chain referral token is a documented future option (recorded in ARCHITECTURE + a `// TODO(future):` marker), deliberately deferred because minting an on-chain quota token would add custody + gas surface for a policy that is honestly enforceable off-chain against chain-derived citizenship.

3. **HYBRID TRUST SCORE (0..100).** `finalScore = clamp(computed + adminAdjustment, 0, 100)`. `computed` is derived HONESTLY from real signals the app already has: is-citizen + tenure (CitizenMinted mint block), count of the citizen's referrals who became on-chain citizens (chain-derived, never a DB flag), governance vote participation, dividend claim history. `adminAdjustment` is a manual signed integer delta set by an admin and AUDITED. `finalScore > 50` bypasses the referral-token requirement in #2. The score is computed **on read** by a pure server module from live chain reads + the persisted `adminAdjustment`; there is NO trust "cache" column that could drift from chain truth.

Non-custodial + chain-truth is the app's absolute invariant (see Global Constraints). Citizenship stays chain-derived (`readHasPassportServer` / `readPassportStatusServer`); the referral gate and trust score are OFF-CHAIN policy layered on top. No new private-key handling. The witness attestation still binds the applicant's server-resolved VERIFIED wallet (`resolveApplicantAddress`); referral gating is an ADDITIONAL server-side precondition to accepting a witness signature.

## Architecture (how referrals + tokens + trust compose over the existing seams)

- **The referral edge is a first-class `Referral` model, keyed by USER on both ends.** A referral connects a **referrer citizen** (User) to a **referred applicant** (User). We do NOT key the referrer half by a raw wallet address, because a referral is created by a logged-in citizen (we have their `userId`) and the referred applicant is likewise a User of the app (they must be, to hold a `CitizenshipApplication`). `@@unique([referrerUserId, referredUserId])` prevents double-referral of the same applicant by the same citizen. `whenTokenConsumed` records whether the create consumed a token (vs. the trust-bypass). Deleting either User cascades away the edge (`onDelete: Cascade` on both FKs) — a referral is meaningless without both parties.
- **The referral-token quota is a single `Int` counter on `User`, allocated by an admin and consumed on referral.** `User.referralTokenBalance Int @default(0)`. An admin *allocates* (adds) tokens through a guarded, audited route; a citizen *consumes* one on a `create` when their trust `<= 50`. This is the minimal honest model — one nullable-safe additive column, no join table, no ERC-20. A negative balance is impossible (the create route decrements only inside a transaction that re-reads the balance and refuses at 0).
- **The witness → referrer mapping is resolved through the applicant's verified wallet, not the witness's session.** At submit time the witness is known ONLY as a recovered `witnessAddress` (ECDSA recovery from the EIP-712 signature — NOT a session, NOT a body field; the survey confirms this is the sole server-authoritative choke point). To check "did this witness refer this applicant?" we (1) resolve the recovered `witnessAddress` back to a `User` via `LinkedWallet` (find the verified `LinkedWallet` whose checksummed `address` equals `witnessAddress` → its `userId` = the candidate referrer), and (2) look up a `Referral(referrerUserId = thatUser, referredUserId = application.userId)`. If either the address→User lookup or the Referral lookup misses, the witness is rejected with "you may only attest for applicants you referred." **The applicant's `userId` is already in hand** (the submit route resolves the application by the applicant's session `userId`).
- **Trust score is computed on read by a pure server module.** `lib/trust/score.ts` (`import "server-only"`) exposes `computeTrustScore(chainId, { userId, address, tokenId }, adminAdjustment)` → `{ computed, adminAdjustment, finalScore, signals }`. It composes the honest signals from the existing `*serverReads.ts` modules (passport status/tenure, referrals-who-became-citizens, governance participation, dividend claims), maps each to a bounded sub-score, sums to `computed`, then `finalScore = clamp(computed + adminAdjustment, 0, 100)`. `adminAdjustment` is the ONLY persisted trust field (`User.trustAdjustment Int @default(0)`). No stake signal in the MVP (staking is client-only today; a server stake reader is a documented follow-up — noted so a reviewer does not expect it).
- **The create gate is a single server module, reused by the citizen create route.** `lib/referrals/gate.ts` (`import "server-only"`) exposes `canCreateReferral(chainId, referrer)` → `{ allowed, reason, viaToken }` where `viaToken` is true when the token path is used (trust `<= 50` and balance `> 0`) and false when the trust-bypass applies (`finalScore > 50`). The create route calls this, then persists the `Referral` + decrements the balance (only when `viaToken`) inside ONE `prisma.$transaction`.
- **Every admin mutation runs the guard stack + in-transaction audit via the allowlist serializer.** Two new auditable admin actions — `referral.token.allocate` and `trust.adjust` — extend `AuditTargetType` with `USER` reuse where possible; because both mutate the `User` row (adding tokens / setting the adjustment), they audit against the EXISTING `USER` targetType with the referral/trust columns ADDED to the `USER` allowlist (so no new targetType is strictly required, but we ADD the columns to `AUDIT_FIELD_ALLOWLIST.USER`). No API may set `User.role`; no secret column ever serializes; the two new columns (`referralTokenBalance`, `trustAdjustment`) avoid every `guard:secrets` substring.
- **Citizen UI is read-mostly.** A new `/api/citizen/referrals` route (built on the `/api/citizen/obligations` template) returns the citizen's trust score (read-only), token balance, list of applicants they referred (with each referral's chain-derived became-citizen status), and whether they can currently create a referral. New cards in `CitizenHomeApp` surface trust + tokens + "refer someone"; the referral-gated attest affordance is surfaced advisory-only in `WitnessSurface` (the authoritative gate stays server-side).

## Tech Stack (unchanged — no new deps)

- Next.js 15 App Router + TypeScript · Prisma (dual schema: sqlite dev/test + postgres prod) · viem 2.54.1 (chain reads) · Zod (`.strict()` admin bodies) · Vitest (unit + integration) · Playwright (e2e, login-bootstrapped) · Foundry (contracts, UNTOUCHED this wave). No new npm dependency; no new contract; no new RPC method.

## Global Constraints (NON-NEGOTIABLE — copy into working memory)

1. **NON-CUSTODIAL + CHAIN-TRUTH is absolute.** Citizenship is ALWAYS chain-derived (`readHasPassportServer` / `readPassportStatusServer`). The referral gate + trust score are OFF-CHAIN policy layered on top of the on-chain 7-witness EIP-712 seal. NEVER fake on-chain or DB citizenship status; NEVER treat a `Referral` row, a token balance, or a trust score as citizenship. The "referrals who became citizens" count MUST gate on a live `readHasPassportServer(chainId, referredUsersVerifiedAddress)` read — NEVER on `CitizenshipApplication.status`/`citizenTokenId`/`sealedAt` (off-chain caches). No new private-key handling anywhere.
2. **The witness attestation still binds the server-resolved VERIFIED applicant wallet.** `resolveApplicantAddress(userId)` remains the applicant-binding source of truth; the applicant address is NEVER trusted from client input. Referral gating is an ADDITIONAL server-side precondition to accepting a witness signature — it does NOT replace or weaken any existing submit guard (applicant-binding, stale-nonce/deadline, no-self-attest, witness-is-citizen, unique-witness ALL stay).
3. **The witness is identified ONLY by ECDSA recovery.** At `POST /api/applications/witnesses/submit`, the witness identity comes SOLELY from `recoverWitness(...)` — NOT the session (which authenticates the APPLICANT), NOT a query param, NOT a body field. The referral precondition MUST key off the recovered `witnessAddress` (mapped to a `User` via a verified `LinkedWallet` lookup), because the witness may not even be a logged-in user this request. Do NOT add a "witness userId" body field — that would be spoofable and bypass the crypto binding.
4. **DUAL PRISMA SCHEMA — both files, both migrations, SAME task.** Every new model/field goes in BOTH `prisma/schema.prisma` (sqlite) AND `prisma/postgres/schema.prisma` (postgres) with byte-identical datamodel text; `prisma/schema-drift.test.ts` MUST stay green. Ship BOTH a sqlite migration (`pnpm db:migrate`) AND a hand-authored postgres migration under `prisma/postgres/migrations/<SAME-timestamp>_<name>/migration.sql` in the SAME task, ADDITIVE + nullable/defaulted (prod-safe, no backfill). Extend `pnpm guard:secrets` coverage is automatic (the guard greps both schema files) — the new column NAMES (`referralTokenBalance`, `trustAdjustment`, `referrerUserId`, `referredUserId`, `whenTokenConsumed`) avoid every `/(privateKey|seedPhrase|mnemonic|plaintextPassword|passwordPlain|secretKey)/i` substring.
5. **ADMIN SURFACE — the full guard stack + in-transaction audit.** Every admin mutation runs `isAllowedOrigin → requireAdmin → per-admin rateLimit → strict Zod` (via `guardAdminMutation`) and writes its audit row IN THE SAME `prisma.$transaction` via `writeAudit(tx, …)` through the allowlist serializer. Extend `AUDIT_FIELD_ALLOWLIST.USER` with `referralTokenBalance` + `trustAdjustment` (both public integers). NO API may set `User.role` (the `.strict()` schemas carry no `role` key → no promotion path). No secret column may ever serialize (the audit test enforces this).
6. **TRUST SCORE is honest + clamped.** `computed` uses ONLY signals genuinely derivable today (passport status, tenure via CitizenMinted mint block, referrals-who-became-citizens via chain reads, governance participation via `readMyVoteServer`, dividend claims via `readDividendHistoryServer`). NEVER fabricate a signal. `finalScore = clamp(computed + adminAdjustment, 0, 100)`. Stake is a DOCUMENTED FOLLOW-UP (client-only reader today) — do NOT invent a server stake read; note it as future work. The score is surfaced READ-ONLY to the citizen and never presented as citizenship.
7. **THE CREATE GATE is (available token) OR (trust > 50); token consumed ONLY when trust <= 50.** Self-referral is rejected (`referrerUserId === referredUserId`). Referring a user who is ALREADY an on-chain citizen is rejected (nonsensical — they need no witnesses). The `@@unique([referrerUserId, referredUserId])` makes a duplicate create idempotent-safe (the second create throws → surfaced as "already referred"). Token decrement happens ONLY inside the create transaction and ONLY when the token path is used; a zero balance with trust `<= 50` rejects with a clear reason.
8. **TDD RED-FIRST; test counts only GROW.** Baseline 881 unit / 18 integration / 37 e2e / 165 forge. Every task writes the failing test first. No suite shrinks. Per-task commits with the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.
9. **E2E BUDGET IS HARD `< 10` registrations (currently 9).** Any new e2e spec is login-bootstrapped (direct prisma seed + `POST /api/auth/login`, exactly like `e2e/admin-panel.spec.ts` and `e2e/wallet-modes.spec.ts`) and adds ZERO `/api/auth/register` calls. Re-grep the register count before the D-group gate.
10. **NO chain-state writes from any referral/trust route.** The referral + trust routes NEVER write `status`/`citizenTokenId`/`sealTxHash`/`sealedAt` (chain-derived). They read chain truth and write ONLY the off-chain policy columns (`referralTokenBalance`, `trustAdjustment`, `Referral` rows).
11. **Admin-mint override is EXEMPT from the referral gate (documented).** The Wave-10 admin-mint override (`approve-mint`) collects ZERO witnesses and short-circuits the witness flow entirely; it therefore never reaches the submit gate and is DELIBERATELY exempt (an admin issuing a passport does not need referrers). Record this exemption explicitly in ARCHITECTURE + a comment at the gate.
12. **Close-out:** docs (README wave row + a Wave-12 section, `docs/ARCHITECTURE.md` new section, CHANGELOG `0.12.0`, `package.json` `0.12.0`) + the FULL gate green.

## Verified ground truth (re-verify before editing — signatures confirmed against the live tree)

### Witness submit (the gate location) — `app/api/applications/witnesses/submit/route.ts`
- `POST(req)`: `isAllowedOrigin(req)` CSRF gate → `requireSession(req)` yields `userId` = **the APPLICANT** (used ONLY to find the application). Body validated by `witnessSubmitSchema` (`{attestation:{applicant,nameHash,nonce,deadline}, signature}`). Loads `application = prisma.citizenshipApplication.findUnique({ where:{userId}, select:{ id, status, applicantAddress, witnessNonce, witnessDeadline } })`.
- Guards in order: applicant-binding (`getAddress(attestation.applicant) === getAddress(application.applicantAddress)`), stale-sig (`nonce`/`deadline` match), recover `witnessAddress` via `recoverWitness(chainId, passportAddress(chainId), {applicant, nameHash, nonce:BigInt, deadline:BigInt}, signature)`, no-self-attest (`witnessAddress !== applicantAddress`), witness-is-citizen (`readHasPassportServer(chainId, witnessAddress)`).
- **GATE INSERTION POINT: after the `if (!isCitizen)` block (route line ~107, ends line 107) and BEFORE `prisma.witnessSignature.create` (route line ~110–123).** At that point `witnessAddress` (checksummed, via `getAddress`) and `application` (`.id`, `.applicantAddress`, and — ADD to the select — `.userId`) are both in hand. **NOTE: the current select does NOT include `userId`; the gate needs it — add `userId: true` to the `select` at route lines 49–55.**
- After create: `collected = count`, `required = readRequiredWitnessesServer(chainId)`, and `if (collected >= required && status === "OATH_ACCEPTED") → update status "WITNESSED"`. Returns `json({ ok, collected, required })`. **UNCHANGED by Wave 12** — a rejected witness never creates a row, so the threshold logic already respects the gate.

### Applicant binding — `lib/applications/applicant.ts`
- `resolveApplicantAddress(userId): Promise<Address | null>` = `prisma.linkedWallet.findFirst({ where:{ userId, chain:"EVM", verifiedAt:{not:null} }, orderBy:{createdAt:"asc"}, select:{address} })` → `getAddress(wallet.address)` or `null`. This is the applicant-binding source of truth AND the pattern for the reverse lookup (address → User). `import "server-only"`.

### Admin guard + audit
- `lib/admin/routeGuard.ts` — `guardAdminMutation(req, {keyPrefix, limit, windowMs}): Promise<AdminActor | Response>` runs `isAllowedOrigin → requireAdmin → rateLimit(\`${keyPrefix}:${user.id}\`)`. `AdminActor = { user: User, actorLabel: \`admin:${email??id}\`, userAgent }`. `guardAdminGet(req, rl?)` runs `requireAdmin` (+ optional per-admin rateLimit), no origin check. `parseListQuery(url)` → `{page, pageSize} | null`. `USER_SELECT` allowlist (never `passwordHash`).
- `lib/admin/audit.ts` — `AuditTargetType` union (currently `USER|SESSION|APPLICATION|ASSET|EMBASSY|CENSUS|ALLOCATION|CONSTITUTION|PROPOSAL_CONTENT|COMMENT|FLAG|EXPORT`). `AUDIT_FIELD_ALLOWLIST.USER = [id, email, name, role, kycStatus, suspendedAt, lockedUntil, failedLoginCount, createdAt, updatedAt]` — **Wave 12 ADDS `referralTokenBalance` + `trustAdjustment` here.** `serializeForAudit(targetType, record)` picks ONLY allowlisted keys (BigInt→string, Date→ISO, unknown targetType THROWS). `writeAudit(tx, entry)` creates the AuditLog row in the mutation's transaction. `entry = { actorUserId, actorLabel, action, targetType, targetId, before?, after?, userAgent? }`. **NOTE: this module is deliberately NOT `import "server-only"` (it is imported by the CLI under tsx) — do NOT add that marker.**
- Canonical mutation route template (from `approve-mint/route.ts`): `import "server-only"` → `guardAdminMutation(...)` → `if (actor instanceof Response) return actor;` → parse body (`req.text()`/`req.json()`) → `zodSchema.safeParse` → `badRequest` → fetch `before = prisma.user.findUnique(...)` → `if (!before) 404` → `after = prisma.$transaction(async tx => { const updated = await tx.user.update(...); await writeAudit(tx, {...}); return updated; })` → `json({ ok:true, ... })`.

### Zod admin schemas — `lib/validation/admin.ts`
- All bodies are `z.object({...}).strict()` (unknown keys REJECTED — the security boundary; no schema carries `role`). Integer deltas travel as JSON numbers validated by `z.number().int()`. **Wave 12 ADDS** `referralTokenAllocateSchema` + `trustAdjustSchema` here.

### Chain-truth server reads (honest trust signals)
- `lib/passport/serverReads.ts` — `readHasPassportServer(chainId, who): Promise<boolean>`; `readPassportStatusServer(chainId, address): Promise<{isCitizen, tokenId}>` (tokenId from the `CitizenMinted` log — passport is NOT enumerable); `readCitizenMintedLogsServer(chainId, fromBlock=0n): Promise<[{tokenId, citizen, mintBlock, blockNumber}]>`; `readHeadBlockServer(chainId): Promise<bigint>`; `readRequiredWitnessesServer(chainId): Promise<number>`. All keyed via `serverRpcUrl`. `import "server-only"`.
- `lib/governance/serverReads.ts` — `readMyVoteServer(chainId, proposalId, tokenId): Promise<number>` (per-proposal recorded vote); `readProposalCountServer(chainId): Promise<number>`. Governance participation = count of proposals with a recorded vote for the citizen's tokenId.
- `lib/dividends/serverReads.ts` — `readDividendHistoryServer(chainId, tokenId): Promise<[{epochId, tokenId, to, amount, blockNumber, txHash}]>` (per-citizen claim history from `DividendClaimed` logs).
- `lib/config/chain.ts` — `activeChain().primaryChainId`.

### Citizen route template + UI
- `app/api/citizen/obligations/route.ts` — `requireSession` → `resolveApplicantAddress(userId)` → EMPTY set if no address → `readPassportStatusServer` chain-truth → push obligations → `json({ isCitizen, tokenId, obligations })`. The template for `GET /api/citizen/referrals`.
- `components/home/CitizenHomeApp.tsx` — 2-col pillar layout; `useCitizen()` (`{address, isCitizen, tokenId, loading, refresh}`); `Load<T>` + `Skeleton` + `CardError` patterns; right `<aside>` (PassportRailCard / CensusTickerCard) is where trust + token cards mount.
- `components/shell/navItems.ts` / `Sidebar.tsx` — `NAV_ITEMS` + `NavItem{href,label,icon,badge?}`; a new `/dashboard/referrals` entry needs a `NavItem` + a `NavIconKind` in `NavIcon.tsx`.
- `app/dashboard/witness/WitnessSurface.tsx` — the citizen witness-signing UI (advisory referral hint goes here; authoritative gate is server-side).

### Prisma models (current)
- `User { id, email? @unique, passwordHash?, name?, kycStatus @default("NONE"), role @default("USER"), suspendedAt?, failedLoginCount @default(0), lockedUntil?, createdAt, updatedAt, sessions[], linkedWallets[], application? }`. **Wave 12 ADDS** `referralTokenBalance Int @default(0)`, `trustAdjustment Int @default(0)`, and the `Referral` self-relations.
- `LinkedWallet { id, userId (FK Cascade, @@index), address @unique (checksummed EVM), chain @default("EVM"), verifiedAt?, createdAt }`.
- `CitizenshipApplication { id, userId @unique (FK Cascade), status @default("DRAFT"), applicantAddress?, witnessNonce?, witnessDeadline?, adminApprovedAt?, adminApprovedBy?, witnessSignatures[], @@index([status]) }`.
- **NO referral/inviter/trust field exists today** (grep-confirmed). Wave 12 is greenfield for these.

### Guards + budget
- `prisma/schema-drift.test.ts` — parses both schemas, asserts identical model+enum sets, field names, normalized field defs, sorted block attrs. Any single-file edit FAILS.
- `scripts/guard-no-secret-columns.sh` (`pnpm guard:secrets`) — greps both schemas for secret substrings; the new column names avoid them.
- Registration ledger HARD `< 10` (currently 9). New e2e is login-bootstrapped (`e2e/admin-panel.spec.ts` template), ZERO `/api/auth/register`.
- Integration harness `test/integration/anvil-harness.ts` — `foundryAvailable()` skip guard; `startAnvilWithContracts(seedCitizens)`; anvil key #0 THROWAWAY.

## File Structure (new/edited)

```
prisma/
  schema.prisma                                   # EDIT (A1) — User.referralTokenBalance/trustAdjustment + Referral model
  postgres/schema.prisma                          # EDIT (A1) — byte-identical datamodel mirror
  migrations/<ts>_wave12_referrals/migration.sql          # NEW (A1) — sqlite ADD COLUMN + CREATE TABLE Referral
  postgres/migrations/<ts>_wave12_referrals/migration.sql # NEW (A1) — hand-authored postgres mirror (SAME ts dir)
lib/
  referrals/
    lookup.ts                                     # NEW (A2) — resolveUserByWalletAddress + referralExists helpers
    lookup.test.ts                                # NEW (A2)
    gate.ts                                        # NEW (B2) — canCreateReferral(chainId, referrer) (token OR trust>50)
    gate.test.ts                                   # NEW (B2)
  trust/
    score.ts                                       # NEW (B1) — computeTrustScore (honest signals, clamp + adminAdjustment)
    score.test.ts                                  # NEW (B1)
  validation/
    admin.ts                                        # EDIT (C1,C2) — referralTokenAllocateSchema + trustAdjustSchema
    referral.ts                                     # NEW (B3) — referralCreateSchema (.strict)
  admin/
    audit.ts                                        # EDIT (C1,C2) — allowlist USER += referralTokenBalance, trustAdjustment
app/api/
  applications/witnesses/submit/route.ts           # EDIT (A3) — add userId to select + referral gate before create
  referrals/route.ts                               # NEW (B3) — POST create referral (session-guarded, gated, audited-none/DB)
  citizen/referrals/route.ts                       # NEW (D1) — GET my trust + tokens + who-I-referred + can-create
  admin/users/[id]/referral-tokens/route.ts        # NEW (C1) — POST allocate tokens (guarded + audited)
  admin/users/[id]/trust/route.ts                  # NEW (C2) — POST set trustAdjustment (guarded + audited)
  admin/users/[id]/referrals/route.ts              # NEW (C3) — GET a user's referrals (guarded read)
components/
  home/CitizenHomeApp.tsx                          # EDIT (D2) — TrustCard + ReferralTokensCard + ReferSomeoneCard
  home/ReferralCards.tsx                           # NEW (D2) — the three citizen cards (client island pieces)
  home/ReferralCards.test.tsx                      # NEW (D2)
  shell/navItems.ts                                # EDIT (D2) — add /dashboard/referrals nav item
  shell/NavIcon.tsx                                # EDIT (D2) — add the "referrals" NavIconKind
  admin/UserDetail.tsx (or AdminOverviewApp.tsx)   # EDIT (C4) — allocate-tokens + set-trust + referral list panels
app/dashboard/
  referrals/page.tsx                               # NEW (D2) — server component mounting the referrals island
  witness/WitnessSurface.tsx                       # EDIT (D3) — advisory "you may only attest for people you referred"
test/integration/
  referral-gate.test.ts                            # NEW (D4) — anvil: referred witness accepted, non-referrer rejected
e2e/
  referrals.spec.ts                                # NEW (D5) — login-bootstrapped; create gate + admin allocate + trust (0 new registrations)
docs/
  ARCHITECTURE.md                                  # EDIT (D6) — Referral & trust section
  README.md                                        # EDIT (D6) — wave row + Wave-12 section
  CHANGELOG.md                                     # EDIT (D6) — 0.12.0
package.json                                       # EDIT (D6) — version 0.12.0
```

---

## GROUP A — SCHEMA + LOOKUP + THE GATE

## Task A1 — `Referral` model + `User` token/trust columns (BOTH schemas + BOTH migrations)

**Files:**
- EDIT `prisma/schema.prisma`, `prisma/postgres/schema.prisma`
- NEW `prisma/migrations/<ts>_wave12_referrals/migration.sql`
- NEW `prisma/postgres/migrations/<ts>_wave12_referrals/migration.sql`

**READ FIRST:** `prisma/schema.prisma` (WHOLE `User` + `LinkedWallet` + `CitizenshipApplication` blocks + the top invariant docstring), `prisma/postgres/schema.prisma` (confirm byte-identical datamodel + the postgres datasource block), `prisma/schema-drift.test.ts` (WHOLE — what "identical" means: field-definition strings must match verbatim after whitespace-normalization; `//` comments are stripped so docstrings need not match), `prisma/migrations/20260702202245_wave10_admin_approval/migration.sql` + `prisma/postgres/migrations/20260702202245_wave10_admin_approval/migration.sql` (the additive-migration dialect pair: sqlite `ADD COLUMN "x" TEXT;` ↔ postgres `ADD COLUMN "x" TEXT;`; `Int` → `INTEGER`; the SAME timestamp dir name in both trees), `scripts/guard-no-secret-columns.sh` (confirm the new names are clean), `docs/DEPLOY_VERCEL.md` (the `prisma migrate diff` recipe + additive-only policy).

**Exact schema additions (IDENTICAL text in BOTH schema files):**

Add to `model User { … }` (after `application CitizenshipApplication?`):
```prisma
  referralTokenBalance Int @default(0) // admin-allocated referral quota; consumed on referral when trust <= 50
  trustAdjustment      Int @default(0) // admin signed delta folded into the hybrid trust score (clamped 0..100)

  referralsMade     Referral[] @relation("ReferralsMade")
  referralsReceived Referral[] @relation("ReferralsReceived")
```

Add the new model (place it after `CitizenshipApplication`/`WitnessSignature`, before `AuditLog`):
```prisma
/// A referral edge: a citizen (referrer) vouches for an applicant (referred).
/// Off-chain POLICY only — never citizenship (that stays chain-derived). All of an
/// applicant's witnesses must be their referrers (Wave 12 referral-gated attestation).
/// no model may ever store a private key, seed phrase, or plaintext password.
model Referral {
  id                String   @id @default(cuid())
  referrerUserId    String
  referrer          User     @relation("ReferralsMade", fields: [referrerUserId], references: [id], onDelete: Cascade)
  referredUserId    String
  referred          User     @relation("ReferralsReceived", fields: [referredUserId], references: [id], onDelete: Cascade)
  whenTokenConsumed Boolean  @default(false) // true = create spent a referral token; false = trust>50 bypass
  createdAt         DateTime @default(now())

  @@unique([referrerUserId, referredUserId])
  @@index([referredUserId])
  @@index([referrerUserId])
}
```

**SQLite migration** (`prisma/migrations/<ts>_wave12_referrals/migration.sql`, generated by `pnpm db:migrate` — review that it matches):
```sql
-- AlterTable
ALTER TABLE "User" ADD COLUMN "referralTokenBalance" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "trustAdjustment" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "referrerUserId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "whenTokenConsumed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Referral_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Referral_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Referral_referrerUserId_referredUserId_key" ON "Referral"("referrerUserId", "referredUserId");
CREATE INDEX "Referral_referredUserId_idx" ON "Referral"("referredUserId");
CREATE INDEX "Referral_referrerUserId_idx" ON "Referral"("referrerUserId");
```

**POSTGRES migration** (`prisma/postgres/migrations/<ts>_wave12_referrals/migration.sql`, hand-authored at the SAME `<ts>` dir name; additive/defaulted, prod-safe):
```sql
-- Wave 12: referral edge + admin-allocated token quota + admin trust adjustment.
-- Additive + defaulted (no backfill); safe under `prisma migrate deploy` at build time.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "referralTokenBalance" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "trustAdjustment" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referrerUserId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "whenTokenConsumed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Referral_referrerUserId_referredUserId_key" ON "Referral"("referrerUserId", "referredUserId");
CREATE INDEX "Referral_referredUserId_idx" ON "Referral"("referredUserId");
CREATE INDEX "Referral_referrerUserId_idx" ON "Referral"("referrerUserId");
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

**TDD steps:**
1. [ ] RED — edit BOTH schema files with the identical `User` fields + `Referral` model. Run `pnpm test schema-drift` — it must PASS (identical) BEFORE proceeding; if it fails with `<field>: definition diverged`, the two files disagree — fix until green. (This is the "test" for A1: the drift guard is the RED/GREEN oracle. To make the RED explicit, edit `prisma/schema.prisma` ONLY first, run `pnpm test schema-drift` → RED "Referral: only in sqlite"; then mirror to postgres → GREEN.)
2. [ ] GREEN — generate the sqlite migration: `pnpm db:migrate` (name it `wave12_referrals`). Confirm it matches the SQL above. Hand-author the postgres migration under the SAME `<ts>` dir. Run `pnpm guard:secrets` (both schemas clean) and `pnpm test schema-drift` — green. Regenerate the client if needed (`pnpm prisma generate` / whatever the repo uses — verify from `package.json`).
3. [ ] `pnpm typecheck && pnpm lint` — green (the new Prisma types compile). Commit `feat(db): Wave-12 A1 — Referral model + User referral-token/trust-adjustment columns (dual schema + both migrations)`.

**Verify:** `pnpm test schema-drift && pnpm guard:secrets && pnpm typecheck`.

---

## Task A2 — Referral lookup helpers (address → User; referral exists)

**Files:**
- NEW `lib/referrals/lookup.ts`, `lib/referrals/lookup.test.ts`

**READ FIRST:** `lib/applications/applicant.ts` (WHOLE — the `LinkedWallet.findFirst` verified-wallet pattern + `getAddress` normalization; this is the model for the reverse lookup), `prisma/schema.prisma` (`LinkedWallet.address @unique` checksummed; `Referral` from A1), `app/api/applications/witnesses/submit/route.ts` (where these helpers are consumed — confirm the recovered `witnessAddress` is already `getAddress`-checksummed at the call site).

**Exact interface (`lib/referrals/lookup.ts`):**
```ts
import "server-only";
import { getAddress, type Address } from "viem";
import { prisma } from "@/lib/db";

/**
 * Reverse of resolveApplicantAddress: map a checksummed EVM address (e.g. a
 * recovered witness) back to the User who VERIFIED it as a LinkedWallet.
 * Returns the userId, or null if no verified wallet matches. Address is
 * re-checksummed defensively so callers may pass any casing.
 */
export async function resolveUserByWalletAddress(address: string): Promise<string | null> {
  const checksummed = getAddress(address as Address);
  const wallet = await prisma.linkedWallet.findFirst({
    where: { address: checksummed, chain: "EVM", verifiedAt: { not: null } },
    select: { userId: true },
  });
  return wallet?.userId ?? null;
}

/** True iff `referrerUserId` has an existing Referral edge to `referredUserId`. */
export async function referralExists(referrerUserId: string, referredUserId: string): Promise<boolean> {
  const row = await prisma.referral.findUnique({
    where: { referrerUserId_referredUserId: { referrerUserId, referredUserId } },
    select: { id: true },
  });
  return row !== null;
}
```
- **NOTE:** `LinkedWallet.address` is `@unique`, so at most one row matches — but we still filter `verifiedAt:{not:null}` so an unverified link can never satisfy a referral. Use `findFirst` (the composite verified filter is not the unique key).

**TDD steps:**
1. [ ] RED — `lookup.test.ts` (`@vitest-environment node`, a real prisma test DB or the repo's prisma test harness — check how `submit` route tests seed prisma): seed a User + a verified `LinkedWallet` at a known checksummed address → `resolveUserByWalletAddress(thatAddress)` returns the userId; a lowercased variant of the address returns the SAME userId (checksum-normalized); an unknown address returns `null`; an UNVERIFIED wallet (`verifiedAt: null`) returns `null`. Seed a `Referral` → `referralExists(a,b)` true; the reverse pair `referralExists(b,a)` false; a non-existent pair false. Run `pnpm test referrals/lookup` — RED.
2. [ ] GREEN — implement. Run — green.
3. [ ] `pnpm typecheck && pnpm lint`. Commit `feat(referrals): Wave-12 A2 — address→User + referralExists lookup helpers`.

**Verify:** `pnpm test referrals/lookup && pnpm typecheck`.

---

## Task A3 — Referral gate in the witness-submit route (the core enforcement)

**Files:**
- EDIT `app/api/applications/witnesses/submit/route.ts`

**READ FIRST:** `app/api/applications/witnesses/submit/route.ts` (WHOLE — the guard order; note the `select` at lines 49–55 does NOT include `userId`; note the gate goes AFTER the `if (!isCitizen)` block at ~line 107 and BEFORE `prisma.witnessSignature.create` at ~line 110), `lib/referrals/lookup.ts` (A2 — `resolveUserByWalletAddress`, `referralExists`), `lib/http/responses.ts` (`badRequest(message)`), the existing tests for this route (find `submit` route test file — the gate needs a new RED test there or a co-located one).

**Exact edit:**
1. Add `userId: true` to the `application` select (lines 49–55) so `application.userId` is available.
2. Add the import: `import { resolveUserByWalletAddress, referralExists } from "@/lib/referrals/lookup";`
3. Insert the gate immediately after the `if (!isCitizen) { return badRequest("Only existing citizens may witness a new citizen."); }` block, before the `try { await prisma.witnessSignature.create(...) }`:
```ts
  // Wave 12 — REFERRAL-GATED ATTESTATION: a witness may only attest for an
  // applicant they REFERRED. The witness is known ONLY as the recovered
  // `witnessAddress` (crypto-bound); map it back to a User via a verified
  // LinkedWallet, then require a Referral(referrer=thatUser, referred=applicant).
  // (The admin-mint OVERRIDE path never reaches this route — it is exempt.)
  const referrerUserId = await resolveUserByWalletAddress(getAddress(witnessAddress));
  if (!referrerUserId || !(await referralExists(referrerUserId, application.userId))) {
    return badRequest("You may only attest for applicants you have referred.");
  }
```
- **Ordering rationale:** this runs AFTER the citizen check so the error precedence stays "not a citizen" → then "not a referrer" (a non-citizen is rejected as a non-citizen first, matching the on-chain invariant). It runs BEFORE `create` so a non-referrer never persists a `WitnessSignature` row — meaning the `collected >= required → WITNESSED` transition needs NO change.

**TDD steps:**
1. [ ] RED — extend/create the submit route test (`@vitest-environment node`, prisma-seeded): set up an application (status `OATH_ACCEPTED`, `applicantAddress`, `witnessNonce`/`witnessDeadline`, `userId`), a valid EIP-712 signature from a witness who IS a citizen (mock `readHasPassportServer` → true, `readRequiredWitnessesServer` → e.g. 3, `recoverWitness` → the witness address) AND a verified `LinkedWallet` for the witness. Cases:
   - **witness referred the applicant** (seed a `Referral`) → 200, a `WitnessSignature` row is created, `collected` increments.
   - **witness did NOT refer the applicant** (no `Referral`) → 400 "You may only attest for applicants you have referred." AND `witnessSignature.count === 0` (no row written).
   - **witness address maps to no verified User** (no `LinkedWallet`) → same 400, no row.
   - **threshold still respected:** with `required=1` and one referred witness → status transitions to `WITNESSED`; with a non-referrer that would have been the "3rd" signature, status does NOT advance (they never persist).
   Run `pnpm test witnesses/submit` (or the route's test path) — RED.
2. [ ] GREEN — apply the edit (select + import + gate). Run — green. Run the whole applications suite (`pnpm test applications`) — stays green.
3. [ ] `pnpm typecheck && pnpm lint`. Commit `feat(applications): Wave-12 A3 — referral-gated witness attestation (reject non-referrer witnesses at submit)`.

**Verify:** `pnpm test witnesses/submit && pnpm typecheck`.

---

## GROUP B — TRUST SCORE + CREATE GATE + CREATE ROUTE

## Task B1 — Hybrid trust score module (honest signals + clamp + adminAdjustment)

**Files:**
- NEW `lib/trust/score.ts`, `lib/trust/score.test.ts`

**READ FIRST:** `lib/passport/serverReads.ts` (`readHasPassportServer`, `readPassportStatusServer`, `readCitizenMintedLogsServer`, `readHeadBlockServer` — the honest citizen/tenure signals), `lib/governance/serverReads.ts` (`readMyVoteServer`, `readProposalCountServer` — governance participation), `lib/dividends/serverReads.ts` (`readDividendHistoryServer` — claim history), `lib/referrals/lookup.ts` (A2), `lib/applications/applicant.ts` (the verified-wallet resolver — for counting referrals-who-became-citizens), `prisma/schema.prisma` (`User.trustAdjustment` from A1; `Referral` edges). Confirm each reader's EXACT return shape before mapping.

**Design (state in the plan):** The score is computed ON READ; the ONLY persisted trust input is `User.trustAdjustment`. Sub-scores (bounded, honest, summing to a `computed` in 0..100 range before clamp — clamp still applied because `adminAdjustment` can push past):

| Signal | Source | Sub-score (max) |
|---|---|---|
| Is citizen | `readHasPassportServer(chainId, address)` | 20 |
| Tenure | `head - mintBlock` from `readCitizenMintedLogsServer` (their tokenId's mint block); bucketed (e.g. `min(20, floor(blocksElapsed / TENURE_BLOCKS_PER_POINT))`) | 20 |
| Referrals who became citizens | for each `Referral` where `referrerUserId = user`, resolve the referred User's verified wallet → `readHasPassportServer` → count trues; `min(20, count * 4)` | 20 |
| Governance participation | count proposals (0..`readProposalCountServer`) with a recorded `readMyVoteServer(chainId, pid, tokenId) !== 0`; `min(20, votes * 4)` | 20 |
| Dividend claims | `readDividendHistoryServer(chainId, tokenId).length`; `min(20, claims * 4)` | 20 |

**Exact interface (`lib/trust/score.ts`):**
```ts
import "server-only";
// … imports of the serverReads + prisma + lookup

export interface TrustSignals {
  isCitizen: boolean;
  tenureBlocks: number;
  referralsBecameCitizens: number;
  governanceVotes: number;
  dividendClaims: number;
}
export interface TrustScore {
  computed: number;        // 0..100 (sum of honest sub-scores, pre-adjustment)
  adminAdjustment: number; // the persisted signed delta
  finalScore: number;      // clamp(computed + adminAdjustment, 0, 100)
  signals: TrustSignals;
}

export function clampScore(n: number): number { return Math.max(0, Math.min(100, Math.round(n))); }

/**
 * Compute the hybrid trust score for a citizen. `subject` carries the identifiers
 * already resolved by the caller (userId for referral counting + adminAdjustment;
 * address + tokenId for chain reads). A non-citizen (or missing tokenId) scores
 * ONLY the citizen sub-score (0) — trust presupposes citizenship. Every chain read
 * is try/catch-guarded → degrades to 0 for that signal, never throws.
 */
export async function computeTrustScore(
  chainId: number,
  subject: { userId: string; address: `0x${string}` | null; tokenId: bigint | null },
  adminAdjustment: number,
): Promise<TrustScore>;
```
- **HONESTY GUARD:** if `subject.address` is null or `readHasPassportServer` is false, `signals.isCitizen = false` and every citizen-dependent sub-score is 0 (tenure/governance/dividends all need a tokenId). The referrals-became-citizens count does NOT require the SUBJECT to be a citizen (a not-yet-citizen could still have referred people) — but per decision #3 the score is surfaced for citizens; compute it regardless and let the caller decide. Document this precisely.
- **NO stake signal** (client-only reader today) — add a `// TODO(follow-up): server-side stake reader (lib/staking/serverReads.ts) to add a stake sub-score.`

**TDD steps:**
1. [ ] RED — `score.test.ts` (`@vitest-environment node`, mock every serverReads import + prisma): 
   - all-zero signals (non-citizen) → `computed === 0`, `finalScore === clampScore(0 + adminAdjustment)`.
   - full-house citizen (all sub-scores maxed) → `computed === 100`; `adminAdjustment = 0` → `finalScore === 100`; a negative adjustment lowers it; `computed=100, adjustment=+50 → finalScore=100` (clamped).
   - `adminAdjustment = -200` on a mid score → `finalScore === 0` (clamped floor).
   - a chain read that throws for one signal → that sub-score is 0, others unaffected (no throw).
   - referrals-became-citizens: 3 referred users, 2 on-chain citizens → sub-score 8; count caps at 20.
   Run `pnpm test trust/score` — RED.
2. [ ] GREEN — implement (bounded sub-scores + clamp + try/catch per read). Run — green.
3. [ ] `pnpm typecheck && pnpm lint`. Commit `feat(trust): Wave-12 B1 — hybrid trust score (honest chain signals + clamped adminAdjustment)`.

**Verify:** `pnpm test trust/score && pnpm typecheck`.

---

## Task B2 — Referral create-gate (`canCreateReferral`: token OR trust > 50)

**Files:**
- NEW `lib/referrals/gate.ts`, `lib/referrals/gate.test.ts`

**READ FIRST:** `lib/trust/score.ts` (B1 — `computeTrustScore`/`finalScore`), `prisma/schema.prisma` (`User.referralTokenBalance`, `User.trustAdjustment`), `lib/config/chain.ts` (`activeChain().primaryChainId`), `lib/passport/serverReads.ts` + `lib/applications/applicant.ts` (to resolve the referrer's citizen identity for the score). Decision reminder (Constraint #7): token consumed ONLY when trust `<= 50`.

**Exact interface (`lib/referrals/gate.ts`):**
```ts
import "server-only";
export interface CreateGateResult {
  allowed: boolean;
  viaToken: boolean;    // true → the create must consume one token; false → free (trust>50) or not allowed
  reason: string;       // human message when !allowed (surfaced by the route)
  finalScore: number;
  tokenBalance: number;
}

/**
 * Decide whether `referrerUserId` may create a referral RIGHT NOW.
 *   allowed && !viaToken  → trust finalScore > 50 (free, no token spent)
 *   allowed && viaToken   → finalScore <= 50 AND tokenBalance > 0 (spend one token)
 *   !allowed              → finalScore <= 50 AND tokenBalance === 0
 * Resolves the referrer's identity (verified wallet + passport tokenId) to compute
 * the score. Does NOT mutate — the route decrements the balance transactionally.
 */
export async function canCreateReferral(chainId: number, referrerUserId: string): Promise<CreateGateResult>;
```
- Implementation: load `user = prisma.user.findUnique({ where:{id:referrerUserId}, select:{ referralTokenBalance, trustAdjustment } })`; resolve `address = resolveApplicantAddress(referrerUserId)` and `tokenId` via `readPassportStatusServer`; `score = computeTrustScore(chainId, {userId, address, tokenId}, user.trustAdjustment)`; then apply the truth table above.

**TDD steps:**
1. [ ] RED — `gate.test.ts` (mock `computeTrustScore` + prisma):
   - `finalScore = 60`, balance `0` → `{allowed:true, viaToken:false}` (free bypass).
   - `finalScore = 51`, balance `0` → allowed, free (`> 50` boundary is exclusive-of-50, inclusive-of-51).
   - `finalScore = 50`, balance `2` → `{allowed:true, viaToken:true}` (token path; 50 is NOT a bypass).
   - `finalScore = 50`, balance `0` → `{allowed:false, reason:/no referral token/i, viaToken:false}`.
   - `finalScore = 40`, balance `1` → allowed via token.
   Run `pnpm test referrals/gate` — RED.
2. [ ] GREEN — implement (be precise: `finalScore > 50` is the bypass; `<= 50` needs a token). Run — green.
3. [ ] `pnpm typecheck && pnpm lint`. Commit `feat(referrals): Wave-12 B2 — canCreateReferral gate (available token OR trust>50 bypass)`.

**Verify:** `pnpm test referrals/gate && pnpm typecheck`.

---

## Task B3 — Citizen referral CREATE route (`POST /api/referrals`)

**Files:**
- NEW `app/api/referrals/route.ts`
- NEW `lib/validation/referral.ts`

**READ FIRST:** `app/api/applications/witnesses/submit/route.ts` (the `isAllowedOrigin` + `requireSession` citizen-mutation pattern — this route is a CITIZEN mutation, not admin, so it uses `isAllowedOrigin` + `requireSession`, NOT `guardAdminMutation`), `lib/auth/csrf.ts` (`isAllowedOrigin`), `lib/auth/guard.ts` (`requireSession`), `lib/referrals/gate.ts` (B2), `lib/referrals/lookup.ts` (A2), `lib/passport/serverReads.ts` (`readHasPassportServer` — to reject referring an existing citizen), `lib/config/chain.ts`, `lib/http/responses.ts` (`json`, `badRequest`, `forbidden`), `prisma` (`Referral` create + `User` decrement). Confirm how a citizen route identifies the REFERRED user (by email? by userId? — DECISION below).

**DECISION — how the referred applicant is named:** the request body carries the referred user's **email** (`referredEmail`, lowercased) — the applicant is a registered user of the app (they must be, to hold an application). The route resolves it to a `userId` via `prisma.user.findUnique({ where:{email} })`. Rationale: a citizen refers a person they know by their signup email; we never take a raw wallet or a client-supplied userId (unspoofable resolution). A missing email → 400 "No such user."

**Exact validation (`lib/validation/referral.ts`):**
```ts
import { z } from "zod";
export const referralCreateSchema = z
  .object({ referredEmail: z.string().email().transform((s) => s.toLowerCase()) })
  .strict();
export type ReferralCreateInput = z.infer<typeof referralCreateSchema>;
```

**Route behavior (`POST /api/referrals`):**
1. `isAllowedOrigin(req)` → `forbidden()` on fail. `requireSession(req)` → `referrerUserId` (the citizen creating the referral).
2. Parse + `referralCreateSchema.safeParse` → `badRequest` on fail.
3. Resolve `referred = prisma.user.findUnique({ where:{ email }, select:{ id } })`; `!referred` → `badRequest("No such user.")`.
4. `referred.id === referrerUserId` → `badRequest("You cannot refer yourself.")` (self-referral).
5. Resolve the referred user's verified wallet (`resolveApplicantAddress(referred.id)`); if present, `readHasPassportServer(chainId, thatAddress)` → if true, `badRequest("That person is already a citizen.")` (nonsensical to refer an existing citizen). Guard the chain read in try/catch (unreachable chain → treat as not-a-citizen, do not 500).
6. `gate = canCreateReferral(chainId, referrerUserId)`; `!gate.allowed` → `badRequest(gate.reason)` (e.g. "You need a referral token or a trust score above 50 to refer.").
7. Create + (conditionally) decrement in ONE `prisma.$transaction`:
```ts
   await prisma.$transaction(async (tx) => {
     await tx.referral.create({
       data: { referrerUserId, referredUserId: referred.id, whenTokenConsumed: gate.viaToken },
     });
     if (gate.viaToken) {
       // Decrement ONLY when the token path is used; re-read to refuse a race to negative.
       const res = await tx.user.updateMany({
         where: { id: referrerUserId, referralTokenBalance: { gt: 0 } },
         data: { referralTokenBalance: { decrement: 1 } },
       });
       if (res.count === 0) throw new Error("TOKEN_RACE"); // balance hit 0 between gate + tx
     }
   });
```
   A `Referral` unique-violation (duplicate) → catch → `badRequest("You have already referred this person.")`. A `TOKEN_RACE` → `badRequest("Your referral token was just used — try again.")`.
8. `json({ ok:true })`.
- **NO audit row here** (this is a citizen action, not an admin mutation — the audit trail covers admin/server mutations per `lib/admin/audit.ts` scope note; a citizen creating a referral is ordinary product activity, recorded by the `Referral` row itself). State this decision in the route docstring.

**TDD steps:**
1. [ ] RED — `route` test (`@vitest-environment node`, prisma-seeded, mock `canCreateReferral` / `readHasPassportServer`): self-referral → 400; unknown email → 400; referring an existing citizen → 400; gate denies → 400 with the reason; gate allows via trust bypass → 201/200 + a `Referral` row with `whenTokenConsumed:false` + balance UNCHANGED; gate allows via token → row with `whenTokenConsumed:true` + balance decremented by 1; duplicate create → 400 "already referred"; bad origin → 403. Run `pnpm test api/referrals` (or the route path) — RED.
2. [ ] GREEN — implement the route + schema. Run — green.
3. [ ] `pnpm typecheck && pnpm lint`. Commit `feat(referrals): Wave-12 B3 — POST /api/referrals create route (gated, self/existing-citizen guarded, token-consuming)`.

**Verify:** `pnpm test api/referrals && pnpm typecheck`.

---

## GROUP C — ADMIN (allocate tokens · set trust · view referrals)

## Task C1 — Admin: allocate referral tokens (`POST /api/admin/users/[id]/referral-tokens`)

**Files:**
- NEW `app/api/admin/users/[id]/referral-tokens/route.ts`
- EDIT `lib/validation/admin.ts` (add `referralTokenAllocateSchema`)
- EDIT `lib/admin/audit.ts` (add `referralTokenBalance` to `AUDIT_FIELD_ALLOWLIST.USER`)

**READ FIRST:** `app/api/admin/applications/[id]/approve-mint/route.ts` (WHOLE — the canonical `guardAdminMutation` + fetch-before + `$transaction(update + writeAudit)` template), `app/api/admin/users/[id]/suspend/route.ts` (the `User`-targeted mutation + `USER` audit shape), `lib/validation/admin.ts` (existing `.strict()` schemas + how integers are validated), `lib/admin/audit.ts` (the `USER` allowlist + `writeAudit` + the dot-namespaced action convention), `lib/admin/routeGuard.ts` (`guardAdminMutation`).

**Exact schema (append to `lib/validation/admin.ts`):**
```ts
export const referralTokenAllocateSchema = z
  .object({ delta: z.number().int().min(1).max(1000) }) // add 1..1000 tokens per call (positive-only allocation)
  .strict();
```
- **DECISION:** allocation is ADD-ONLY (`delta >= 1`); an admin cannot set an arbitrary balance or go negative through this route (that would risk under-flowing an in-flight consume). A "revoke tokens" action, if ever needed, is a separate future route. State this.

**Audit allowlist edit (`lib/admin/audit.ts`):** add `"referralTokenBalance"` to the `USER` array (a public integer — safe; the audit test's secret-substring check passes).

**Route (`POST /api/admin/users/[id]/referral-tokens`):**
```ts
import "server-only";
// guardAdminMutation → parse body → referralTokenAllocateSchema.safeParse → badRequest
// before = prisma.user.findUnique({ where:{id}, select: {...USER_SELECT, referralTokenBalance:true } })
// !before → 404
// after = $transaction: tx.user.update({ where:{id}, data:{ referralTokenBalance:{ increment: delta } } })
//   + writeAudit(tx, { action:"referral.token.allocate", targetType:"USER", targetId:id, before, after:updated, ... })
// json({ ok:true, referralTokenBalance: after.referralTokenBalance })
```
- rateLimit: `{ keyPrefix:"admin-referral-tokens", limit:20, windowMs:5*60_000 }`.

**TDD steps:**
1. [ ] RED — route test (admin-session bootstrap like `suspend`/`approve-mint` tests): non-admin → 403; bad origin → 403; `delta:0` or `delta:-5` or unknown key → 400 (strict); valid `delta:5` on a user with balance 2 → balance becomes 7 AND an `AuditLog` row exists with `action:"referral.token.allocate"`, `targetType:"USER"`, `afterJson` containing `referralTokenBalance:7` (and NEVER `passwordHash`); missing user → 404. Also extend the audit-allowlist test if one asserts the exact `USER` key set. Run `pnpm test referral-tokens` — RED.
2. [ ] GREEN — schema + allowlist + route. Run — green. Run the audit test suite (`pnpm test audit`) — green (the new allowlist key is a non-secret integer).
3. [ ] `pnpm typecheck && pnpm lint`. Commit `feat(admin): Wave-12 C1 — allocate referral tokens (guarded, in-transaction audited)`.

**Verify:** `pnpm test referral-tokens && pnpm test audit && pnpm typecheck`.

---

## Task C2 — Admin: set trust adjustment (`POST /api/admin/users/[id]/trust`)

**Files:**
- NEW `app/api/admin/users/[id]/trust/route.ts`
- EDIT `lib/validation/admin.ts` (add `trustAdjustSchema`)
- EDIT `lib/admin/audit.ts` (add `trustAdjustment` to `AUDIT_FIELD_ALLOWLIST.USER`)

**READ FIRST:** same templates as C1 (`approve-mint`, `suspend`), `lib/admin/audit.ts` (USER allowlist — now includes `referralTokenBalance` from C1), `lib/trust/score.ts` (confirm `adminAdjustment` is a signed integer folded via `clamp(computed + adminAdjustment, 0, 100)`).

**Exact schema (append to `lib/validation/admin.ts`):**
```ts
export const trustAdjustSchema = z
  .object({ adjustment: z.number().int().min(-100).max(100) }) // SET the signed delta (absolute, not incremental)
  .strict();
```
- **DECISION:** `adjustment` SETS the absolute `trustAdjustment` (not an increment), bounded `-100..100` (enough to zero-out or max-out any `computed`). The clamp in `computeTrustScore` keeps `finalScore` in `0..100` regardless. State that this is a SET, so re-posting is idempotent (a toggle-safe absolute value), and it is AUDITED every time (each POST writes a fresh audit row showing before→after adjustment).

**Audit allowlist edit:** add `"trustAdjustment"` to the `USER` array.

**Route (`POST /api/admin/users/[id]/trust`):** guard → parse → `trustAdjustSchema` → before (`select` includes `trustAdjustment`) → 404 → `$transaction: update { trustAdjustment: adjustment } + writeAudit(action:"trust.adjust", targetType:"USER", …)` → `json({ ok:true, trustAdjustment: after.trustAdjustment })`. rateLimit `{ keyPrefix:"admin-trust", limit:20, windowMs:5*60_000 }`.

**TDD steps:**
1. [ ] RED — route test: non-admin → 403; `adjustment:200` or unknown key → 400; valid `adjustment:-30` → `trustAdjustment` set to -30 AND an `AuditLog` `action:"trust.adjust"` with `afterJson` containing `trustAdjustment:-30`; re-post `adjustment:10` → set to 10 (absolute, not accumulated) + a second audit row; missing user → 404. Run `pnpm test admin/trust` — RED.
2. [ ] GREEN — schema + allowlist + route. Run — green. `pnpm test audit` — green.
3. [ ] `pnpm typecheck && pnpm lint`. Commit `feat(admin): Wave-12 C2 — set trust adjustment (absolute signed delta, guarded + audited)`.

**Verify:** `pnpm test admin/trust && pnpm test audit && pnpm typecheck`.

---

## Task C3 — Admin: view a user's referrals (`GET /api/admin/users/[id]/referrals`)

**Files:**
- NEW `app/api/admin/users/[id]/referrals/route.ts`

**READ FIRST:** `app/api/admin/applications/[id]/route.ts` (the `guardAdminGet` + select-allowlist + chain-derived labeling pattern), `lib/admin/routeGuard.ts` (`guardAdminGet`, `parseListQuery`), `lib/referrals/lookup.ts`, `lib/passport/serverReads.ts` (`readHasPassportServer` — the chain-truth became-citizen check), `lib/applications/applicant.ts` (`resolveApplicantAddress`), `lib/trust/score.ts` (to include the user's finalScore + tokenBalance in the payload).

**Route (`GET /api/admin/users/[id]/referrals`):** `guardAdminGet(req, { keyPrefix:"admin-user-referrals", limit:60, windowMs:60_000 })`. Load the user (`select: { id, email, referralTokenBalance, trustAdjustment }`), 404 if missing. Load `referralsMade` (this user's outgoing referrals) with the referred user's `{ id, email }`; for each, resolve the referred user's verified wallet + `readHasPassportServer` → `becameCitizen: boolean` (labeled `chainDerived: true`, try/catch → false on unreachable chain). Compute the user's `finalScore` via `computeTrustScore`. Return:
```ts
json({
  user: { id, email, referralTokenBalance, trustAdjustment },
  trust: { finalScore, computed, adminAdjustment, signals, chainDerived: true },
  referrals: [{ referredUserId, referredEmail, whenTokenConsumed, createdAt, becameCitizen /*chainDerived*/ }],
})
```
- Honesty: `becameCitizen` is LABELED chain-derived and read live; never sourced from `CitizenshipApplication.status`.

**TDD steps:**
1. [ ] RED — route test: non-admin → 403; a user with 2 referrals (one referred user is an on-chain citizen — mock `readHasPassportServer`) → payload lists both with correct `becameCitizen`; the `trust` block reflects `computeTrustScore` (mock it); missing user → 404. Run `pnpm test admin/users/referrals` — RED.
2. [ ] GREEN — implement. Run — green.
3. [ ] `pnpm typecheck && pnpm lint`. Commit `feat(admin): Wave-12 C3 — GET a user's referrals + trust (guarded read, chain-derived became-citizen)`.

**Verify:** `pnpm test admin/users/referrals && pnpm typecheck`.

---

## Task C4 — Admin UI: allocate tokens + set trust + referral list panels

**Files:**
- EDIT `components/admin/UserDetail.tsx` (or `components/admin/AdminOverviewApp.tsx` / the user-detail island — confirm which renders a single user; add the panels there) + a co-located `.test.tsx`

**READ FIRST:** `components/admin/ApplicationDetail.tsx` (the admin-detail card + guarded-mutation-button pattern; the approve-mint button UX), `components/admin/AdminOverviewApp.tsx` (the admin island shape), the C1/C2/C3 routes (the exact request/response shapes), the existing admin mutation-button component (find how `approve-mint` is triggered from the UI — reuse its CSRF-header fetch + toast/error handling).

**Behavior:**
- **Allocate tokens panel:** a number input (`min 1`) + "Allocate" button → `POST /api/admin/users/[id]/referral-tokens` `{delta}` → on success refresh the shown `referralTokenBalance`. Honest error toast on 4xx.
- **Set trust panel:** a number input (`-100..100`) + "Set adjustment" button → `POST .../trust` `{adjustment}` → refresh the shown `trustAdjustment` + `finalScore`. Show the computed vs. final breakdown read-only.
- **Referral list panel:** render the `GET .../referrals` payload — each row shows referred email, `whenTokenConsumed`, and a `becameCitizen` chain-derived badge (labeled).
- All buttons keyboard-focusable; errors surfaced via `role="alert"`.

**TDD steps:**
1. [ ] RED — `.test.tsx` (Testing Library, mock fetch): allocate submits `{delta}` and re-renders the new balance; invalid delta (0) is blocked client-side or surfaces the server 400; set-trust submits `{adjustment}` and re-renders; the referral list renders `becameCitizen` badges. Run `pnpm test UserDetail` (or the component path) — RED.
2. [ ] GREEN — implement the panels. Run — green.
3. [ ] `pnpm typecheck && pnpm lint && pnpm test admin`. Commit `feat(admin): Wave-12 C4 — admin UI to allocate tokens, set trust, view referrals`.

**Verify:** `pnpm test UserDetail && pnpm typecheck`.

---

## GROUP D — CITIZEN UI + INTEGRATION + E2E + CLOSE-OUT

## Task D1 — Citizen referrals API (`GET /api/citizen/referrals`)

**Files:**
- NEW `app/api/citizen/referrals/route.ts`

**READ FIRST:** `app/api/citizen/obligations/route.ts` (WHOLE — the `requireSession → resolveApplicantAddress → chain-truth → json` template), `lib/trust/score.ts` (B1), `lib/referrals/gate.ts` (B2 — `canCreateReferral` for `canCreate`), `lib/referrals/lookup.ts`, `lib/passport/serverReads.ts`, `prisma` (`referralsMade` + `referralTokenBalance` + `trustAdjustment`).

**Route (`GET /api/citizen/referrals`):** `requireSession` → `userId`. Load `user = prisma.user.findUnique({ where:{id:userId}, select:{ referralTokenBalance, trustAdjustment } })`. Resolve `address` + `tokenId` (chain-truth). `trust = computeTrustScore(chainId, {userId, address, tokenId}, user.trustAdjustment)`. `gate = canCreateReferral(chainId, userId)`. Load `referralsMade` with referred `{email}` + per-row chain-derived `becameCitizen`. Return:
```ts
json({
  trustScore: trust.finalScore,        // READ-ONLY to the citizen
  trustBreakdown: { computed: trust.computed, adminAdjustment: trust.adminAdjustment, signals: trust.signals },
  referralTokenBalance: user.referralTokenBalance,
  canCreateReferral: gate.allowed,
  createReason: gate.allowed ? null : gate.reason,
  referrals: [{ referredEmail, whenTokenConsumed, createdAt, becameCitizen /*chainDerived*/ }],
})
```
- If no verified wallet: still return the token balance + `referralsMade`, but `trustScore` computed with `address:null` (isCitizen false → citizen-dependent signals 0). Mirror the obligations route's graceful empty behavior.

**TDD steps:**
1. [ ] RED — route test (`@vitest-environment node`, prisma-seeded + mocked serverReads/gate): a citizen with 2 referrals + balance 3 + trust 60 → payload has `trustScore:60`, `referralTokenBalance:3`, `canCreateReferral:true`, and the referral list with `becameCitizen`; a non-citizen with balance 0 + trust 0 → `canCreateReferral:false` + a reason; unauthenticated → 401. Run `pnpm test citizen/referrals` — RED.
2. [ ] GREEN — implement. Run — green.
3. [ ] `pnpm typecheck && pnpm lint`. Commit `feat(citizen): Wave-12 D1 — GET /api/citizen/referrals (trust + tokens + my referrals + can-create)`.

**Verify:** `pnpm test citizen/referrals && pnpm typecheck`.

---

## Task D2 — Citizen UI: trust card + token card + refer-someone + nav

**Files:**
- NEW `components/home/ReferralCards.tsx` (+ `.test.tsx`)
- EDIT `components/home/CitizenHomeApp.tsx` (mount the cards in the aside)
- EDIT `components/shell/navItems.ts` (add `/dashboard/referrals`), `components/shell/NavIcon.tsx` (new `NavIconKind`)
- NEW `app/dashboard/referrals/page.tsx` (server component mounting the referrals island)

**READ FIRST:** `components/home/CitizenHomeApp.tsx` (WHOLE — the `Load<T>`/`Skeleton`/`CardError` + `useCitizen()` + aside pattern; the `pillar` card class), `components/shell/navItems.ts` + `Sidebar.tsx` + `NavIcon.tsx` (the nav item + icon-kind pattern), `app/dashboard/page.tsx` (how the home island is mounted under the session-guarded layout), `app/api/citizen/referrals/route.ts` (D1 — the payload shape).

**Behavior:**
- **TrustCard** (aside): fetches `/api/citizen/referrals`; shows `trustScore` (READ-ONLY, a 0..100 dial/number) + an honest one-line "trust bypasses the referral-token cost when above 50" note; a breakdown expandable (signals). `Load<T>` states + retry.
- **ReferralTokensCard** (aside): shows `referralTokenBalance` + whether `canCreateReferral` (and `createReason` when not).
- **ReferSomeoneCard / affordance:** an email input + "Refer" button → `POST /api/referrals {referredEmail}` (with the CSRF header the app uses) → success clears the input + refetches; gated by `canCreateReferral` (button disabled + reason shown when not). Gate the whole affordance on `isCitizen` from `useCitizen()` (only citizens refer). On the dedicated `/dashboard/referrals` page, ALSO render the full "who I referred" list with `becameCitizen` badges.
- **Nav:** add a `Referrals` `NAV_ITEMS` entry (new `NavIconKind`), `app/dashboard/referrals/page.tsx` mounts the island.

**TDD steps:**
1. [ ] RED — `ReferralCards.test.tsx` (mock fetch): TrustCard renders the score + bypass note; token card renders balance + gated state; the refer form POSTs `{referredEmail}` and clears on success; when `canCreateReferral:false` the button is disabled + the reason shows; loading + error states render. Run `pnpm test ReferralCards` — RED.
2. [ ] GREEN — implement the cards + wire into `CitizenHomeApp` aside + nav + the page. Run — green.
3. [ ] `pnpm typecheck && pnpm lint && pnpm test home`. Commit `feat(citizen): Wave-12 D2 — trust/token/refer cards + /dashboard/referrals page + nav`.

**Verify:** `pnpm test ReferralCards && pnpm typecheck`.

---

## Task D3 — Witness surface: advisory referral hint

**Files:**
- EDIT `app/dashboard/witness/WitnessSurface.tsx`

**READ FIRST:** `app/dashboard/witness/WitnessSurface.tsx` (WHOLE — where the citizen pastes the applicant request + signs; the client-side `readHasPassport` self-check), `app/api/applications/witnesses/submit/route.ts` (A3 — the authoritative gate + its exact 400 message "You may only attest for applicants you have referred.").

**Behavior (advisory ONLY — the server gate stays authoritative):** add an inline honest note near the sign action: "You can only attest for applicants you have referred." When the submit POST returns the referral-gate 400, surface that server message verbatim as the error (do NOT invent a client-side referral check that could disagree with the server — the authoritative decision is server-side, keyed on the recovered witness address). No new fetch is required; just surface the note + the server error.

**TDD steps:**
1. [ ] RED — extend `WitnessSurface.test.tsx` (or add one): the advisory note renders; a mocked submit 400 with the referral message surfaces that message as a `role="alert"` error. Run `pnpm test WitnessSurface` — RED.
2. [ ] GREEN — implement. Run — green.
3. [ ] `pnpm typecheck && pnpm lint`. Commit `feat(witness): Wave-12 D3 — advisory referral hint + surface the server referral-gate error`.

**Verify:** `pnpm test WitnessSurface && pnpm typecheck`.

---

## Task D4 — Integration proof (anvil): referred witness accepted, non-referrer rejected

**Files:**
- NEW `test/integration/referral-gate.test.ts`

**READ FIRST:** `test/integration/anvil-harness.ts` (`foundryAvailable()` skip guard, `startAnvilWithContracts(seedCitizens)`, anvil key #0), an existing integration test that seeds citizens + drives the witness/submit flow in-process (find the closest one — e.g. a mint or witness integration test), `app/api/applications/witnesses/submit/route.ts` (the in-process POST target), `lib/passport/attestation.ts` (`ATTESTATION_TYPES` + how to sign an Attestation with an anvil key for the test).

**Behavior:** with a locally deployed passport + a seeded citizen (the witness) who holds a passport:
- Seed a User for the applicant + a verified `LinkedWallet` (the applicant's anvil address) + a `CitizenshipApplication` (status `OATH_ACCEPTED`, `applicantAddress`, `witnessNonce`/`witnessDeadline`).
- Seed a User for the witness + a verified `LinkedWallet` at the witness's anvil address (so `resolveUserByWalletAddress` resolves it).
- Sign a valid EIP-712 `Attestation` with the witness's anvil key.
- **Case 1 (referral present):** seed `Referral(referrer=witnessUser, referred=applicantUser)` → POST to submit → 200, a `WitnessSignature` row exists.
- **Case 2 (no referral):** delete the `Referral` (or use a fresh applicant with no referral) → POST → 400 "You may only attest for applicants you have referred." → NO `WitnessSignature` row.
- Assert the on-chain `hasPassport(witness)` is true throughout (the citizen check is chain-real, not mocked, in this integration test).

**TDD steps:**
1. [ ] RED — write the integration test (`// @vitest-environment node`, env set BEFORE app imports, in-process `/api/rpc/31337` dispatch, `foundryAvailable()` skip). Run `pnpm test:integration referral-gate` — RED (skips if no foundry; on a foundry box it drives real anvil).
2. [ ] GREEN — confirm the A3 gate makes both cases pass. Run — green.
3. [ ] `pnpm typecheck && pnpm lint`. Commit `test(integration): Wave-12 D4 — anvil proof: referred witness accepted, non-referrer rejected (chain-real citizen check)`.

**Verify:** `pnpm test:integration referral-gate` (or the full `pnpm test:integration` on a foundry box).

---

## Task D5 — E2E (login-bootstrapped, 0 new registrations)

**Files:**
- NEW `e2e/referrals.spec.ts`

**READ FIRST:** `e2e/admin-panel.spec.ts` (WHOLE — the login-bootstrap template: direct `new PrismaClient` with absolute `file:` URL + precomputed Argon2id hash + `POST /api/auth/login`; NO `/api/auth/register`), `e2e/wallet-modes.spec.ts` (the other login-bootstrap example), the C1/C2/D2 UI testids (add stable `data-testid`s in those tasks so the e2e can select them).

**Behavior (all users seeded via direct prisma + logged in via `POST /api/auth/login`):**
- **Admin allocates tokens:** log in as an admin (seeded ADMIN), open the user-detail panel, allocate N tokens → the balance updates.
- **Admin sets trust:** set an adjustment → the shown finalScore updates.
- **Citizen refers someone via the token path:** log in as a citizen with 1 token (trust <= 50 seeded), open `/dashboard/referrals`, refer a seeded applicant by email → success + the balance decrements + the applicant appears in "who I referred".
- **Gate denial:** a citizen with 0 tokens + trust <= 50 sees the refer button disabled + the reason.
- **axe:** 0 critical/serious on the new referrals page.
- Spec header documents the registration ledger: **0 new registrations (login-bootstrapped); total stays 9.**

**TDD steps:**
1. [ ] RED — write the spec (seed all users directly in prisma; `POST /api/auth/login`; ZERO `/api/auth/register`). Run `pnpm e2e referrals` — RED until D2/C4 testids exist (they do by D5).
2. [ ] GREEN — align selectors to the shipped testids. Run `pnpm e2e referrals` — green. Full `pnpm e2e` run: registration count stays 9 (grep the register-tab submissions across specs; the new spec has none).
3. [ ] Commit `test(e2e): Wave-12 D5 — referral create-gate + admin allocate/trust (login-bootstrapped, 0 new registrations)`.

**Verify:** `pnpm e2e referrals && pnpm e2e` (full e2e green, registrations < 10).

---

## Task D6 — Close-out: docs + version 0.12.0 + FULL gate

**Files:**
- EDIT `docs/ARCHITECTURE.md`, `README.md`, `CHANGELOG.md`, `package.json`

**READ FIRST:** `docs/ARCHITECTURE.md` (find the last numbered section — append a new "Referral policy & hybrid trust" section after it), `README.md` (the wave table + section pattern from Wave 11), `CHANGELOG.md` (Keep-a-Changelog; the 0.11.0 entry as the template), `package.json` (the `version` field, currently 0.11.0).

**Docs content:**
- `docs/ARCHITECTURE.md` new section — the three decisions; the enforcement seam (referral gate at submit, keyed on the ECDSA-recovered witness mapped to a User via verified `LinkedWallet`; a rejected witness never persists, so the threshold logic is untouched); the create gate (token OR trust>50, token consumed only when trust<=50); the trust score (honest chain signals + clamped `adminAdjustment`, computed on read, no cache); the admin surface (guarded + in-transaction audited, USER allowlist extended); the **admin-mint override exemption** (it collects no witnesses so it never reaches the gate); the deferred **on-chain referral token** + **server-side stake signal** as documented future work; the dual-schema + additive-migration note; the chain-truth invariant (became-citizen always read live).
- `README.md` — a Wave 12 wave-table row + a Wave-12 section (referral-gated attestation, admin tokens, trust score).
- `CHANGELOG.md` — a `0.12.0` entry (Added: Referral model + token quota + trust score + referral-gated attestation + admin allocate/trust routes + citizen referral UI; Changed: witness submit now referral-gated; migrations).
- `package.json` — `"version": "0.12.0"`.

**TDD steps:**
1. [ ] Docs + version edits. `pnpm format:check` green (Prettier covers `.md` + `.json`).
2. [ ] **FULL GATE:** `pnpm guard:secrets && pnpm format:check && pnpm typecheck && pnpm lint && pnpm test && pnpm test:integration && pnpm e2e && (cd contracts && forge test) && pnpm build`. All green; e2e registrations < 10; drift + audit + snapshot + coverage gates pass; test counts grew (no suite shrank).
3. [ ] Commit `docs+chore: Wave-12 D6 — referral/trust docs + CHANGELOG + package 0.12.0 + full gate`.

**Verify:** the full gate command above, all green.

---

## Final acceptance checklist (verify before claiming Wave 12 complete)

- [ ] **Schema — dual + both migrations:** `Referral` model + `User.referralTokenBalance`/`User.trustAdjustment` exist byte-identically in BOTH schemas; `schema-drift.test` green; a sqlite AND a hand-authored postgres migration share the SAME timestamp dir; `guard:secrets` green; migrations additive/defaulted (A1).
- [ ] **Referral-gated attestation:** `POST /api/applications/witnesses/submit` rejects a witness whose recovered address does not map (via verified `LinkedWallet`) to a User who has a `Referral` to this applicant — with "You may only attest for applicants you have referred." AND writes NO `WitnessSignature` row; a referred witness is accepted and counts toward the threshold; the `select` now includes `userId`; the witness is identified SOLELY by ECDSA recovery (A2, A3, D4).
- [ ] **Create gate:** `canCreateReferral` returns free-bypass when `finalScore > 50`, token-path when `finalScore <= 50 && balance > 0`, denied when `finalScore <= 50 && balance === 0`; `50` is NOT a bypass (B2).
- [ ] **Create route:** `POST /api/referrals` rejects self-referral, referring an existing on-chain citizen, an unknown email, and a duplicate; consumes exactly one token ONLY when `viaToken` (transaction-safe, never negative); creates the `Referral` with the correct `whenTokenConsumed`; `isAllowedOrigin` + `requireSession` guarded (B3).
- [ ] **Trust score:** `computeTrustScore` sums ONLY honest chain signals (citizen, tenure, referrals-became-citizens via live `readHasPassportServer`, governance votes, dividend claims), `finalScore = clamp(computed + adminAdjustment, 0, 100)`; every read try/catch-guarded; NO stake signal (documented follow-up); NO cache column (B1).
- [ ] **Admin allocate tokens:** guarded (`isAllowedOrigin → requireAdmin → per-admin rateLimit → strict Zod`), add-only `delta 1..1000`, `$transaction(update + writeAudit action:"referral.token.allocate" targetType:"USER")`; `referralTokenBalance` in the USER allowlist; no secret serializes (C1).
- [ ] **Admin set trust:** guarded, absolute `adjustment -100..100`, `$transaction(update + writeAudit action:"trust.adjust")`; `trustAdjustment` in the USER allowlist; re-post is idempotent + re-audited (C2).
- [ ] **Admin view referrals:** guarded GET returns the user's referrals with a chain-derived `becameCitizen` (LABELED, read live, never from `status`) + the finalScore breakdown (C3); admin UI panels wire all three (C4).
- [ ] **Citizen UI:** `/api/citizen/referrals` returns read-only trust + token balance + my-referrals + can-create; the home cards + `/dashboard/referrals` page render them; refer-someone POSTs `{referredEmail}`, is gated on `canCreateReferral`, clears on success; the witness surface shows the advisory note + surfaces the server referral-gate error verbatim (D1, D2, D3).
- [ ] **Admin-mint override exemption** is honored (it never reaches the gate) and documented (Constraint #11, D6).
- [ ] **Integration proof:** anvil — referred witness accepted, non-referrer rejected, with a CHAIN-REAL citizen check (D4).
- [ ] **e2e:** login-bootstrapped; admin allocate + set-trust + citizen token-path refer + gate-denial; axe 0 critical/serious; **0 new registrations (total stays 9)** (D5).
- [ ] **All suites green + counts grow** — unit, integration, e2e (registrations < 10), forge (165 untouched), snapshot + coverage, `build`; per-task commits with the Fable 5 trailer; docs (ARCHITECTURE section, README, CHANGELOG 0.12.0, package.json 0.12.0) updated (D6).

## Notes for the implementer (traps — verified against the live tree)

1. **The witness is NOT the session.** `requireSession` on `/submit` authenticates the APPLICANT (to find their application), never the witness. Do NOT add a witness-userId body field — that is spoofable and bypasses the crypto binding. The ONLY authoritative witness identity is `recoverWitness(...)`; map that address → User via a VERIFIED `LinkedWallet` (unverified links must not satisfy a referral).
2. **Add `userId` to the submit route's `application` select.** The current select (lines 49–55) does NOT include `userId`; the referral gate needs `application.userId` to look up `Referral(referrer, referred=applicant)`. Forgetting this yields `undefined` and every referred witness gets falsely rejected.
3. **Gate ordering + no-row-on-reject.** The referral gate runs AFTER the citizen check (so a non-citizen is rejected as such first) and BEFORE `witnessSignature.create` (so a non-referrer NEVER persists a row). This is what makes the `collected >= required → WITNESSED` transition need zero change. Do NOT move the gate after create.
4. **`50` is not a bypass.** Decision #2 says trust `> 50` bypasses the token; exactly `50` still needs a token. Encode `finalScore > 50` for the bypass and `<= 50` for the token requirement — off-by-one here changes who pays.
5. **Token consumed ONLY when `viaToken`.** A trust-bypass create must NOT decrement the balance. Decrement inside the create transaction with a `updateMany({ where:{ balance:{gt:0} }, decrement })` + a `count===0` race guard, never a blind decrement (which could go negative under concurrency).
6. **Chain-truth for became-citizen.** Both the trust "referrals-became-citizens" sub-score AND the admin/citizen referral lists MUST read `readHasPassportServer(chainId, referredUsersVerifiedAddress)` live — NEVER `CitizenshipApplication.status`/`citizenTokenId`/`sealedAt`. Guard every such read in try/catch (an unreachable default-env chain must degrade to false, never 500).
7. **Dual schema + drift oracle.** Edit BOTH schema files with byte-identical datamodel text (field-definition strings must match verbatim after whitespace-normalization; `//` docstrings are stripped so they need not match). Author BOTH migrations at the SAME timestamp dir name. `schema-drift.test` is the RED/GREEN oracle for A1.
8. **Audit allowlist, not a new targetType.** Both admin mutations act on the `User` row, so they audit against the EXISTING `USER` targetType — just ADD `referralTokenBalance` + `trustAdjustment` to `AUDIT_FIELD_ALLOWLIST.USER` (both public integers; the secret-substring test still passes). Do NOT invent a new targetType (the serializer throws on unknown targets, and the union+allowlist must move together — reusing USER avoids that entirely).
9. **`lib/admin/audit.ts` has NO `import "server-only"` — do not add it.** It is imported by the CLI under tsx; adding the marker crashes the admin-bootstrap path. New ROUTE files DO start with `import "server-only"`; new `lib/trust`/`lib/referrals` server modules start with `import "server-only"` (they are only ever imported by route handlers, never client code — mirror `lib/applications/applicant.ts`).
10. **Citizen create route is NOT an admin route.** `POST /api/referrals` uses `isAllowedOrigin` + `requireSession` (the citizen mutation pattern), NOT `guardAdminMutation`. It writes NO audit row (a citizen referral is ordinary product activity; the `Referral` row is the record). Only the ADMIN allocate/trust routes audit.
11. **Referred user is resolved by email, never a client userId/wallet.** The create body carries `referredEmail`; the route resolves it to a userId server-side (unspoofable). Self-referral is `referred.id === referrerUserId`.
12. **On-chain referral token + server stake reader are DOCUMENTED DEFERRALS.** Record both in ARCHITECTURE + a `// TODO(future):` marker (in `lib/referrals/gate.ts` for the on-chain token; in `lib/trust/score.ts` for the stake signal). Do NOT invent a server stake read this wave.
13. **E2E budget.** `e2e/referrals.spec.ts` is login-bootstrapped (direct prisma + `POST /api/auth/login`), adds ZERO `/api/auth/register`. Re-grep the register-tab submissions before D6's gate; the total must stay 9 (< 10).
