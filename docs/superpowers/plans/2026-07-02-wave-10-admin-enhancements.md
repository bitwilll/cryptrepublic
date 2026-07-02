# CryptRepublic Wave 10 — Admin Enhancements: per-user admin-mint override (witness-free, PREPARED-only) + field-allowlisted CSV report exports + responsive admin with clickable stat tiles + self-contained SVG infographics — Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL — before executing any task below, invoke `superpowers:test-driven-development` and `superpowers:executing-plans`. Every task is TDD: write the failing test FIRST (RED), then the implementation (GREEN), then run the stated command and confirm green. Do NOT skip the RED step. Keep ALL prior tests green (Wave-9 close-out baseline, re-confirmed on the Vercel-hosting branch: **678 unit / 15 integration / 29 e2e (9 registrations) / 165 forge**, plus `forge snapshot --check`, the coverage gate, `guard:secrets`, and a green production build). Counts grow, never shrink. Commit each task separately with the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer. THE APP IS LIVE at https://cryptrepublic.com (Vercel + Neon Postgres, mirrored on `main`) — every schema change is ADDITIVE and safe for existing prod rows, and the prod migration order is documented in D1.

## Goal

Wave 10 extends the Wave-9 admin panel (`/admin`) with FOUR admin-only enhancements, all holding the Wave-9 non-custodial + audit + honesty invariants:

1. **Admin-mint override (per-user + self).** An admin can issue a passport to an applicant **without the external witnesses**, using the audited on-chain `adminMint(address to, bytes32 nameHash, bytes32 motto, bytes32 domicile)` (PASSPORT_ADMIN_ROLE, `contracts/src/CryptRepublicPassport.sol:122` — mints with ZERO witnesses; the admin is the sole attestor), **including an admin minting THEIR OWN passport** with no other witness. NON-CUSTODIAL, absolutely: the panel only **PREPARES** the `adminMint` transaction (a pure `prepareAdminMint` encoder → `PreparedActionCard`); the admin signs + broadcasts in their own wallet/Safe. The mint `to` is ALWAYS the resolved verified `LinkedWallet` of the target user (`resolveApplicantAddress(userId)`), never a client-supplied address, for the per-application path; a generic composer "admin mint to <address>" MAY exist with a checksum + a prominent verify-off-chain warning. The GLOBAL lever `setRequiredWitnesses(n)` already ships (`prepareSetRequiredWitnesses`, `lib/admin/prepare.ts:208`) — this wave is the PER-USER path, NOT a rebuild of that lever. Two new OFF-CHAIN-INTENT columns (`adminApprovedAt`, `adminApprovedBy`) record the admin's approval; they are NEVER chain truth — citizen/SEALED state stays chain-derived (`readHasPassport`).
2. **Report downloads.** Admin can download CSV reports (users, applications, audit log) — **field-ALLOWLISTED** (never `passwordHash` / session `tokenHash`), admin-gated (the Wave-9 guard stack), CSV-injection-safe, and the export action itself audited (`admin.export.<kind>`).
3. **Responsive admin + clickable stat tiles.** The `/admin` Overview stat tiles become real `<Link>`s that NAVIGATE to their section (users → `/admin/users`, applications → `/admin/applications`, content → `/admin/content`, flags → `/admin/flags`); every admin screen is responsive (grids collapse without horizontal overflow at 390px, matching the Wave-8 `≤760` shell approach).
4. **Infographics.** Self-contained inline-SVG charts in the admin panel (NO external chart library — the strict nonce-CSP forbids third-party scripts and the app is self-contained): applications-by-status bar chart, users/citizens/embassies count tiles with sparklines (reuse `components/ui/Spark.tsx`), audit-activity-over-time, census-by-city. Data comes from a new admin stats read endpoint (honest DB counts + chain reads with graceful `available:false`), never fabricated series; every chart has an accessible text alternative (axe stays ZERO critical/serious on `/admin`).

ACCEPTANCE: the per-user admin-mint is PREPARED-only and witness-free (proven valid on anvil with ZERO witnesses); reports are allowlisted + injection-safe + audited + never leak secrets; the Overview tiles are keyboard-navigable links and all admin screens are overflow-free at 390px with charts that have text alternatives; the full app + contract suites stay green; the two new columns are additive + prod-safe and the prod migration runs BEFORE the code that reads them.

Build + validate on **local anvil only** (chainId 31337). Never a real network, never a real key.

## Architecture

- **Reuse the Wave-9 admin surface VERBATIM.** All four features live entirely inside the four scanned admin dirs (`lib/admin`, `app/admin`, `app/api/admin`, `components/admin`) plus the applicant-facing reflection (A5, `app/dashboard/mint` + `app/api/citizen/obligations` + `components/home`). Every new admin route runs the centralized guard (`lib/admin/routeGuard.ts` — `guardAdminMutation`/`guardAdminGet`), every mutation writes its audit row in the SAME `prisma.$transaction`, and no new admin file may contain a signing token or import a signing wrapper (`test/no-admin-signing.test.ts` stays green on BOTH rules).
- **Prepared, never signed (A).** `prepareAdminMint(chainId, passport, to, nameHash, motto, domicile)` is a NEW pure encoder in `lib/admin/prepare.ts` (environment-NEUTRAL, `encodeFunctionData` only, mirrors `prepareSetRequiredWitnesses` at :208 and the `single()`/`tx()` helpers). It returns a `PreparedBatch` (`kind:"single"`) rendered by the existing `PreparedActionCard` with `requiredRole: {contract:"passport", role:"PASSPORT_ADMIN_ROLE", holders}` — the "PREPARED FOR YOUR SAFE — THIS PANEL NEVER SIGNS" banner applies unchanged. The server route `POST /api/admin/applications/[id]/approve-mint` records off-chain intent + returns the resolved mint PARAMS (`to`, `nameHash`, `motto`, `domicile`) for the client to feed into `prepareAdminMint`; the panel never signs.
- **The mint `to` is trusted, not client-supplied (A).** For the per-application approval, `to = resolveApplicantAddress(application.userId)` (`lib/applications/applicant.ts` — verified `LinkedWallet`, checksummed). Admin SELF-mint resolves the admin's OWN verified address the same way (the admin has a `CitizenshipApplication` row like any user, OR a self-mint affordance keyed to their own `userId`). No verified wallet → the approve action is DISABLED with a clear reason ("adminMint needs a destination — this user has no verified wallet") AND the route returns 400. The generic ChainActionsApp composer "Admin mint" accepts an address but validates checksum, shows a prominent "verify this address off-chain" warning, and still never signs.
- **Chain-truth honesty (A).** `adminApprovedAt`/`adminApprovedBy` are OFF-CHAIN INTENT — they mean "an administrator approved this application", NOT "this user is a citizen". The applicant UI says "an administrator has approved your application; your passport is being issued by the Republic" and only shows "citizen" once `readHasPassportServer` is true. The approve-mint route NEVER writes `citizenTokenId`/`sealTxHash`/`sealedAt`/`status` (the `.strict()` schema carries none — a body naming them is 400 by strictness, exactly like the Wave-9 review route).
- **CSV exporter (B).** `lib/admin/csv.ts` — a pure, environment-NEUTRAL exporter: `toCsv(rows, columns)` where `columns` is an explicit ALLOWLIST of `{key, header}`; **formula-injection-safe** (any cell whose string value begins with `=`, `+`, `-`, `@`, TAB, or CR is prefixed with a `'` and always quoted; quotes doubled; values containing `,`/`"`/`\n`/`\r` are quoted). Header row from the allowlist. BigInt → string, Date → ISO. The three export routes reuse the Wave-9 `USER_SELECT`/`SESSION_SELECT` discipline and the `AUDIT_FIELD_ALLOWLIST` philosophy — the exporter can NEVER emit `passwordHash`/`tokenHash` because those keys are not in any export allowlist. **NOTE (static guard):** `test/no-admin-signing.test.ts` forbids the substring `sendTransaction` case-insensitively — the CSV code and its routes must avoid it (use `download`/`export`, never a `sendTransaction`-shaped identifier). The exporter file is env-neutral (no `"server-only"`) so a node unit test imports it directly.
- **Clickable tiles + responsive (C1).** Each Overview stat "pillar" (`data-testid="overview-users|applications|content|flags"`) becomes a real Next `<Link>` (keyboard-focusable, `aria-label`) navigating to its section — NOT an `onClick` div. Chain-actions tile is NOT part of the brief's four (users/applications/content/flags), so leave the "Chain actions" and "Feature flags" wording as-is but flags → `/admin/flags`. Responsiveness is largely FREE: `AdminShell` already wraps content in `styles.main`, and `shell.module.css`'s global `≤760` rule collapses any inline `grid-template-columns` inside `.main` to `1fr` (`shell.module.css:104-107`). C1 verifies overflow-free at 390px with a mobile e2e station + axe, and fixes any island whose grid is NOT caught by that rule (e.g. fixed-px `dl` grids, wide tables → wrap in `overflow-x:auto`).
- **Infographics (C2).** A NEW `GET /api/admin/stats` (or an extension of `/api/admin/overview`) returns honest chart series: applications-by-status counts, users/citizens/embassies totals (citizens = `readTotalCitizensServer` with graceful `available:false`), audit-activity buckets (grouped by day over a window), and census-by-city. **The census-by-city series is NOT live citizen geography** — `CityCensus.seededCount` is documented in `prisma/schema.prisma:189-192` as "a labeled SEEDED SNAPSHOT for demonstrative geography, never merged into the trustless `totalCitizens()` headline" (real per-city population is aggregated LIVE from `CitizenshipApplication.domicileCity`, minted citizens only). To honor the schema's honesty guard AND the plan's "honest counts, never fabricated series" promise, C2 takes ONE of: (a) aggregate the census chart LIVE from `CitizenshipApplication.domicileCity` (the schema's stated live source) — preferred if a minted-citizen filter is available; OR (b) if `seededCount` is used, its chart title AND accessible text alternative MUST both explicitly label it "SEEDED / demonstrative — not live census" so it is never presented as real geographic citizen distribution. NEW self-contained SVG components in `components/admin/charts/` (`BarChart`, `CountTile` reusing `Spark`, `ActivitySeries`) — inline SVG, design-token colors, `prefers-reduced-motion` respected for any animated draw, NO external `<script>`/CDN/inline handlers (CSP), each with an accessible alternative (`aria-label` + a visually-hidden data table / `<title>`+`<desc>`). Rendered on the Overview island.

## Tech Stack

Next.js 15 App Router + TypeScript strict, viem 2.54, Prisma (SQLite dev / Postgres prod — dual schema), Zod 4 `.strict()`, the government-issue design system (`styles/tokens.css` + `components/ui/*` + `components/ui/Spark.tsx`), Vitest (unit + `vitest.integration.config.ts` for anvil), Playwright (`e2e/`, prod-build webServer), Foundry (local anvil). Package manager: **pnpm**. Prettier enforced (covers `.md`). Per-task commits with the `Co-Authored-By` trailer.

---

## Global Constraints (NON-NEGOTIABLE — copy into working memory)

1. **NON-CUSTODIAL, absolutely.** `adminMint` is PREPARED only — `prepareAdminMint` in `lib/admin/prepare.ts` (pure `encodeFunctionData`, environment-NEUTRAL) → a `PreparedBatch` rendered by `PreparedActionCard` with the "PREPARED FOR YOUR SAFE — THIS PANEL NEVER SIGNS" banner. NO admin code path signs or broadcasts: no `withEvmSigner`/`sendRawTransaction`/`sendTransaction`/`signTransaction`/`eth_sendTransaction`/`writeContract`/`signTypedData`/`signMessage`/`personal_sign`/`eth_sign`/`createWalletClient`/`privateKeyToAccount`/`mnemonicToAccount`/`hdKeyToAccount`/`TxButton` (matched case-insensitively) and NO import of `@/lib/wallet*`, `@/lib/governance/write`, `@/lib/dividends/write`, `@/lib/passport/mint`, or `wagmi` anywhere in `lib/admin/**`, `app/admin/**`, `app/api/admin/**`, `components/admin/**`. `test/no-admin-signing.test.ts` stays green on BOTH the token scan AND the import-boundary scan. The D1/A6 anvil proof signs with the anvil THROWAWAY PASSPORT_ADMIN key INSIDE THE TEST ONLY (`test/integration/`, outside the scanned dirs).
2. **The mint `to` is trusted, never client-supplied (per-application).** The per-application approve-mint resolves `to = resolveApplicantAddress(application.userId)` (verified `LinkedWallet`, checksummed — the ONLY trusted source). Admin SELF-mint resolves the admin's OWN verified address the same way. No verified wallet → approve DISABLED with a clear reason AND route returns 400. A generic composer "Admin mint to <address>" MAY exist but (a) validates checksum (`getAddress`/`ADDRESS_RE` + a checksum equality check), (b) shows a prominent "verify this address off-chain — a wrong address mints a passport to a stranger you cannot revoke" warning, and (c) still never signs.
3. **CHAIN-TRUTH honesty.** citizen/SEALED state stays chain-derived (`readHasPassportServer`/`readPassportStatusServer`). `adminApprovedAt`/`adminApprovedBy` are OFF-CHAIN INTENT, NEVER chain truth. The applicant UI says "an administrator has approved your application; your passport is being issued by the Republic" and only shows "citizen" once the chain confirms (`readHasPassport` true). Do NOT fake `tokenId`/`sealed`/`status` from approval. The approve-mint `.strict()` schema accepts NOTHING that sets chain-cache columns (a POST naming `status`/`citizenTokenId`/`sealTxHash`/`sealedAt` is 400 by strictness — test-asserted).
4. **AUTHORIZATION + AUDIT.** Every new admin route = `guardAdminMutation`/`guardAdminGet` (isAllowedOrigin → requireAdmin → per-admin rateLimit) + Zod `.strict()`. Every MUTATION (approve-mint) writes an `AuditLog` row IN THE SAME `prisma.$transaction` (`writeAudit(tx, …)`, action `application.approve_mint`, targetType `APPLICATION`). Each report export is a READ but is audited too (action `admin.export.users|applications|audit`, targetType a new `EXPORT` audit target OR reuse an existing type with a synthetic targetId — see A-vs-B decision in B2); exports need NOT be transactional (no mutation to bind to) but MUST write the row before returning the body. NO self-promotion, NO role changes via any new route (no route accepts `role`).
5. **NO SECRET EXPOSURE.** Explicit field allowlist per report; NEVER `passwordHash`, NEVER session `tokenHash`, NEVER witness signature private material (signatures are PUBLIC — fine to export). `pnpm guard:secrets` stays green. CSV is injection-safe: escape leading `=`,`+`,`-`,`@`,TAB,CR and double quotes / quote on `,"\n\r` (CSV formula-injection mitigation). The stats/chart endpoint returns only counts + public census data — no per-user secret.
6. **SCHEMA migration is ADDITIVE + prod-safe.** Add `adminApprovedAt DateTime?` + `adminApprovedBy String?` to `CitizenshipApplication` in BOTH `prisma/schema.prisma` (sqlite) AND `prisma/postgres/schema.prisma` (postgres) — nullable, no backfill, safe for existing prod rows. Update the drift guard (`prisma/schema-drift.test.ts` stays green — the two schemas MUST be field-identical), add a sqlite migration (`prisma migrate dev`) AND a postgres migration (`prisma migrate diff --from-empty`-style, matching `prisma/postgres/migrations/`). Extend `AUDIT_FIELD_ALLOWLIST.APPLICATION` with the two new columns (so audit snapshots include them). **PROD RUN-ORDER (documented in D1):** migrate prod Neon BEFORE deploying the code that READS the columns. `vercel-build` runs `prisma migrate deploy` on the postgres schema, so the postgres migration ships WITH the deploy — the additive-nullable design means the pre-deploy code (which doesn't read the columns) is unaffected, and `migrate deploy` runs before the new server code serves traffic; note the ordering caveat explicitly.
7. **RESPONSIVE + a11y.** Clickable stat tiles are real `<Link>`s (keyboard-focusable, `aria-label`led), NOT `onClick` divs. Charts have accessible text alternatives (`aria-label` + a visually-hidden data table OR `<title>`/`<desc>` + `role="img"`). axe stays ZERO critical/serious on `/admin` screens. Grids collapse WITHOUT horizontal overflow at 390px (mobile e2e no-overflow assertion: `document.scrollingElement.scrollWidth <= innerWidth + 1`).
8. **INFOGRAPHICS self-contained.** Inline SVG only; design tokens for color (`var(--gold)`/`var(--navy)`/`var(--line)`/`var(--muted)`); respect `prefers-reduced-motion` for any animated draw (no motion when reduced); NO external chart lib / CDN / inline event handlers (CSP nonce-based, `middleware.ts`). Chart DATA from admin read endpoints (`/api/admin/stats` or extended `/api/admin/overview`) — honest counts from the DB + chain reads with graceful `available:false` when the chain is unregistered, NEVER fabricated series. Reuse `components/ui/Spark.tsx` where it fits (it already refuses to fabricate — flat baseline for `< 2` points).
9. **ZERO regressions + budgets.** All current suites stay green (678 unit / 15 integration / 29 e2e with 9 registrations / 165 forge; snapshot + coverage gates + build). New admin e2e keeps the registration budget HARD `< 10` (currently 9): bootstrap the admin via DIRECT prisma + `POST /api/auth/login` exactly like `e2e/admin-panel.spec.ts` (per-run random password hashed at runtime; NEVER a committed credential; NEVER `/api/auth/register`). forge stays 165 (no contract edits this wave).
10. **Process.** Per-task commits with the trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. TDD RED-first. Update `README.md` / `docs/ARCHITECTURE.md` (§11 admin) / `docs/MAINNET_HANDOFF.md` (admin-mint override + report exports) + `CHANGELOG.md` + `package.json` version. Local anvil only; never a real network; the A6 anvil proof signs with the throwaway PASSPORT_ADMIN key in the integration test only.

---

## Verified ground truth (re-verify before editing)

**Prepared-tx layer (A).**

- `lib/admin/prepare.ts` — PURE, environment-NEUTRAL encoders. Helpers: `tx(chainId, contract, to, abi, functionName, args, argsLabel, summary)` (:90) → `PreparedTx`; `single(description, one)` (:109) → `PreparedBatch{kind:"single"}`; `batch(description, txs)` (:113). Types `PreparedTx` (:41 — `{chainId, to, value:"0", data, decoded:{contract, functionName, args, summary}}`), `PreparedBatch` (:54). The CLOSEST template is `prepareSetRequiredWitnesses(chainId, passport, n)` (:208) — same contract (`"passport"`), same abi (`adminPassportAbi`), same `single(...)` shape. `safeTxBuilderJson(batch)` (:633) exports the Safe JSON (works for the single-tx adminMint batch too).
- `lib/admin/abis.ts` — `adminPassportAbi` (:39) ALREADY contains `adminMint(address to, bytes32 nameHash, bytes32 motto, bytes32 domicile)` at :41. NO abi edit needed for A.
- `lib/admin/roles.ts` — `ROLE_IDS`, `CONTRACT_ROLES` (passport → `["DEFAULT_ADMIN_ROLE","GENESIS_ATTESTOR_ROLE","PASSPORT_ADMIN_ROLE"]`, :46), `AdminContract`, `RoleName`. PASSPORT_ADMIN_ROLE is the role for `adminMint`.
- `lib/passport/attestation.ts` — env-NEUTRAL, no marker (usable server AND client). `nameHashOf(name)->Hex` (:33 — `keccak256(stringToHex(name))`), `toBytes32String(s)->Hex` (:43 — right-padded bytes32, THROWS > 31 bytes UTF-8), `decodeBytes32String(b)` (:64). **The applicant mint convention (mirror it EXACTLY):** `nameHash = nameHashOf(declaredName)`, `motto = toBytes32String(motto.slice(0,31))`, `domicile = toBytes32String(city.slice(0,31))`. Verify the exact slice/source in `lib/passport/mint*`/`MintFlow.tsx`'s seal payload before writing A3's param builder — match byte-for-byte so an admin-minted passport decodes identically to a witnessed one.

**Admin route pattern + guard (A/B).**

- `lib/admin/routeGuard.ts` — `guardAdminMutation(req, {keyPrefix, limit, windowMs})` (:43) → `AdminActor | Response` (caller `if (x instanceof Response) return x;`); `guardAdminGet(req, rl?)` (:60); `AdminActor{user, actorLabel:"admin:<email>", userAgent}` (:23); `parseListQuery(url)` (:79); `USER_SELECT` (:90 — no passwordHash), `SESSION_SELECT` (:104 — no tokenHash). Guard order: isAllowedOrigin → requireAdmin → rateLimit(per-admin userId) → (route) zod .strict → business → prisma.$transaction(mutation + writeAudit) → json.
- Reference routes to COPY the exact shape: `app/api/admin/applications/[id]/review/route.ts` (mutation: guard → `req.json()` try/catch → `schema.safeParse` → `findUnique` before → `$transaction(update + writeAudit)` → json; the `.strict()` schema is `applicationReviewSchema` in `lib/validation/admin.ts`) and `app/api/admin/applications/[id]/route.ts` (GET detail: `guardAdminGet` → select-allowlisted).
- `app/api/admin/overview/route.ts` — GET counts + recent audit (`guardAdminGet` → `Promise.all` of `count`/`groupBy`/`findMany`). C2's `/api/admin/stats` mirrors this shape; A5 does NOT touch it.

**Audit (A/B).**

- `lib/admin/audit.ts` — `writeAudit(tx, {actorUserId, actorLabel, action, targetType, targetId, before?, after?, userAgent?})` (:150); `AuditTargetType` (:33 — `USER|SESSION|APPLICATION|ASSET|EMBASSY|CENSUS|ALLOCATION|CONSTITUTION|PROPOSAL_CONTENT|COMMENT|FLAG`); `serializeForAudit(targetType, record)` (:125 — picks ONLY allowlisted keys, BigInt→string, Date→ISO, unknown targetType THROWS); `AUDIT_FIELD_ALLOWLIST` (:49). `APPLICATION` allowlist (:63) currently: `id,userId,status,name,domicileCity,hostCountry,motto,kycStatus,reviewNote,applicantAddress,sealTxHash,citizenTokenId,sealedAt,createdAt,updatedAt` — A1 ADDS `adminApprovedAt,adminApprovedBy`. INVARIANT (test-enforced): no allowlist contains passwordHash/tokenHash/`privateKey|seedPhrase|mnemonic|plaintextPassword|passwordPlain|secretKey`.
- **The CSV exporter (B) MUST use the same allowlist discipline** — explicit per-report `{key, header}[]`; the report allowlists live next to `USER_SELECT`/`SESSION_SELECT` in spirit (define them in `lib/admin/csv.ts` or `lib/validation/admin.ts`; reuse `AUDIT_FIELD_ALLOWLIST.USER`/`.APPLICATION` as the source-of-truth field sets where they overlap).

**Trusted address + chain-truth (A).**

- `lib/applications/applicant.ts` — `resolveApplicantAddress(userId)` (:14) — the ONLY trusted source of the mint `to`: first verified (`verifiedAt != null`) EVM `LinkedWallet`, checksummed via `getAddress`; `null` when none. `"server-only"`.
- `lib/passport/serverReads.ts` — `readHasPassportServer(chainId, who)` (:39), `readPassportStatusServer(chainId, who)` (:117 → `{isCitizen, tokenId}`), `readTotalCitizensServer(chainId)` (:53), `readRequiredWitnessesServer(chainId)` (:86). `"server-only"`. These are chain-truth; the approve-mint route surfaces the resolved `to` and MAY note whether the user is already a citizen (so the UI can disable re-approval — see below).
- `contracts/src/CryptRepublicPassport.sol` — `adminMint(...)` :122 onlyRole(PASSPORT_ADMIN_ROLE) → `_mintCitizen(..., oath=true)`; `_mintCitizen` reverts `ZeroAddress()` (`to==0`) and `AlreadyCitizen()` (`hasPassport[to]`), mints with ZERO witnesses, emits `CitizenMinted(tokenId, to, nameHash, mintBlock)`. So a passport can only be admin-minted ONCE per address; re-approval of an already-citizen applicant would revert on-chain — the route/UI should treat "already a citizen (chain)" as a disabled/idempotent state.

**Schema + migrations (A1).**

- `prisma/schema.prisma` (sqlite, authoritative for local) `CitizenshipApplication` :70-104; `prisma/postgres/schema.prisma` (postgres, prod) `CitizenshipApplication` :91-125 — currently field-identical (drift guard enforces it). Both have `reviewNote String?` (:97 / :118). A1 adds `adminApprovedAt DateTime?` + `adminApprovedBy String?` to BOTH.
- `prisma/schema-drift.test.ts` — parses BOTH schemas, asserts model/field/attribute sets IDENTICAL (datasource provider + postgres `directUrl` intentionally differ). Any single-file edit fails here — edit BOTH.
- `prisma/migrations/` (sqlite) has `20260702084147_wave9_admin/`; `prisma/postgres/migrations/` (postgres) has `20260702000000_init_postgres/` + `migration_lock.toml`. A1 adds `prisma/migrations/<ts>_wave10_admin_approval/migration.sql` (sqlite, `prisma migrate dev --name wave10_admin_approval`) AND `prisma/postgres/migrations/<ts>_wave10_admin_approval/migration.sql` (postgres — generate with `prisma migrate diff --from-migrations prisma/postgres/migrations --to-schema-datamodel prisma/postgres/schema.prisma --script`, or the documented postgres-dialect diff the init migration used). Both are two `ALTER TABLE "CitizenshipApplication" ADD COLUMN` statements (nullable — additive, no backfill).
- `scripts/guard-no-secret-columns.sh` (via `pnpm guard:secrets`) — trips on secret-named columns; the two new PUBLIC columns are safe.

**Admin UI (A4/C1/C2).**

- `components/admin/ApplicationDetail.tsx` — the per-application screen. Loads `/api/admin/applications/[id]`, renders detail + Chain record (CHAIN-DERIVED tag) + Witness signatures + the Review form. A4 ADDS an "Approve & mint (override witnesses)" section that (on approve) POSTs `approve-mint`, receives the resolved params, builds `prepareAdminMint(...)`, and renders `<PreparedActionCard prepared={batch} requiredRole={{contract:"passport", role:"PASSPORT_ADMIN_ROLE", holders}} />`. **The enable/disable basis MUST be the route's OWN `to` resolution (`resolveApplicantAddress(userId)`), NEVER the stored `applicantAddress` column** — that column is a witness-request-time snapshot (`null` for the exact witness-free case the override targets: an applicant who never ran the witness flow but has a verified `LinkedWallet`). A4's GET-route extension surfaces a distinct `resolvedMintTo` field (`= await resolveApplicantAddress(app.userId)`, the SAME source A3's approve-mint route uses for `to`); the UI gates/displays on THAT, so it never disables a mintable applicant nor shows a stale destination. A self-mint affordance covers the admin's own application.
- `components/admin/PreparedActionCard.tsx` — `PreparedActionCard({prepared: PreparedBatch | GovernanceProposalPayload, requiredRole?: RequiredRoleInfo})`. Batches render "PREPARED FOR YOUR SAFE — THIS PANEL NEVER SIGNS" + Copy calldata + Download Safe JSON. `RequiredRoleInfo{contract, role, holders}`. `data-testid="prepared-action-card"`, `"never-signs-label"`, `"required-role"`. Reuse UNCHANGED for adminMint (it is a `PreparedBatch`).
- `components/admin/ChainActionsApp.tsx` — the composer. `ActionDef{id,label,requires,fields,info?,mirror,build,role,defaults?}`; addresses come from `/api/admin/chain/params` (server-resolved; `available:false` graceful); validators `ADDRESS_RE`/`badAddress`/`badAmount`. A4 ADDS a generic "Admin mint" `ActionDef` (fields: address, name, motto, domicile) with a checksum validator + the verify-address warning `info`, `build: (v,ctx) => prepareAdminMint(ctx.chainId, ctx.addresses.passport!, addr(v,"to"), nameHashOf(v.name), toBytes32String(v.motto.slice(0,31)), toBytes32String(v.city.slice(0,31)))`, `role: () => ({contract:"passport", role:"PASSPORT_ADMIN_ROLE"})`. Import `nameHashOf`/`toBytes32String` from `@/lib/passport/attestation` (env-neutral, no signing token).
- `components/admin/AdminOverviewApp.tsx` — the Overview island. Stat tiles are `<article className="pillar" data-testid="overview-users|applications|content|flags">`. C1 wraps/replaces each with a real `<Link href=...>` (keyboard-focusable, `aria-label`). C2 adds the charts below the tiles from `/api/admin/stats`.
- `components/admin/bits.tsx` — `Skeleton`/`CardError`/`TagLabel`/`Field`/`inputStyle`/`Load<T>`. `components/ui/Spark.tsx` — `Spark({points, color?, bg?, width?, height?})`, flat baseline for `<2` points (already non-fabricating). `components/ui/Ledger` for tables.
- `components/admin/AdminShell.tsx` — wraps content in `styles.main` (`shell.module.css`), reuses the sidebar/drawer; mounts NO wallet/passport provider. `components/shell/shell.module.css:104-107` — global `≤760`: `.main :global([style*="grid-template-columns"]:not([data-grid="row"])) { grid-template-columns: 1fr !important; }` — so inline-grid tiles collapse for free at ≤760. C1's job is to VERIFY 390px overflow-free and fix any grid that rule misses (fixed-px `dl` grids in `ApplicationDetail`; any wide table → `overflow-x:auto` wrapper).

**Applicant reflection (A5).**

- `app/api/citizen/obligations/route.ts` — GET the caller's obligations. It reads the caller's `CitizenshipApplication` (`status`, `witnessNonce`, `_count.witnessSignatures`) BEFORE the address gate and pushes witness-stage obligations (`OATH_ACCEPTED` → "waiting for witness attestations (n of required)"; `WITNESSED` → "seal your passport"). A5 ADDS: when `adminApprovedAt != null` AND the chain does NOT yet show a passport, push an obligation `{kind:"witness", ref:"admin-approved", label:"An administrator has approved your application; your passport is being issued by the Republic."}` (or a distinct `kind:"admin-approved"` — pick one, keep `CitizenHomeApp`'s witness-pending grouping working). Honest: only when `!isCitizen` on chain.
- `app/dashboard/mint/MintFlow.tsx` — resume logic keyed on `application.status` (`OATH_ACCEPTED`/`WITNESSED` jump to steps). A5 ADDS: when `adminApprovedAt` is set and the chain shows no passport yet, show the "approved by an administrator — passport being issued" state INSTEAD of "waiting for 7 witnesses" (chain-truth gated: once `readHasPassport` true, the normal citizen state wins).
- `components/home/CitizenHomeApp.tsx` — renders the obligations list + a `witnessPending` passport-rail state (`data-testid="witness-pending"`, `"passport-rail-pending"`). A5 threads the admin-approved obligation into the SAME pending grouping (or adds an `data-testid="admin-approved-pending"` state); wording per constraint #3.

**E2E / a11y (C1/D).**

- `e2e/admin-panel.spec.ts` — the Wave-9 admin e2e: DIRECT-prisma bootstrap (absolute `file:` URL) + per-run random password hashed at runtime + `POST /api/auth/login` (NOT register); a COPIED axe helper (`expectNoCriticalOrSerious`, ZERO critical/serious). C1 adds a mobile-viewport (390px) station asserting no horizontal overflow on `/admin`, `/admin/users`, `/admin/applications`; A4/C2 add stations for the approve-mint prepared card + the charts' accessible alternative. Registration budget stays 9.
- `e2e/a11y.spec.ts` — the axe helper source to copy. `styles/tokens.css` — design tokens; `@media (prefers-reduced-motion: reduce)` (:151) is the precedent for the charts' reduced-motion guard.

**CSP (C2).**

- `middleware.ts` — nonce-based CSP; charts MUST be inline SVG (no external `<script>`, no CDN, no inline `on*` handlers). `next/dynamic` is fine (the islands are already `"use client"`). SVG `<title>`/`<desc>` + `role="img"` are CSP-safe.

**Docs to touch in D1:** `README.md` (wave table :122 add a Wave 10 row; the admin paragraph gains "admin-mint override + CSV exports"), `docs/ARCHITECTURE.md` (§11 admin — the admin-mint-override prepared path + off-chain-intent columns + CSV export allowlist + infographics), `docs/MAINNET_HANDOFF.md` (the admin-mint override is a witness-free passport issuance — operator caution; report exports contain PII → handle per policy), `CHANGELOG.md` (+0.10.0), `package.json` (version 0.10.0).

---

## File Structure (new/edited)

```
prisma/
  schema.prisma                              # EDIT (A1) — CitizenshipApplication.adminApprovedAt + adminApprovedBy
  postgres/schema.prisma                     # EDIT (A1) — SAME two columns (drift-identical)
  migrations/<ts>_wave10_admin_approval/     # NEW (A1) — sqlite ADD COLUMN x2
  postgres/migrations/<ts>_wave10_admin_approval/ # NEW (A1) — postgres ADD COLUMN x2
lib/
  admin/
    prepare.ts + prepare.test.ts             # EDIT (A2) — prepareAdminMint (pure) + tests
    mintParams.ts + mintParams.test.ts       # NEW (A3) — buildAdminMintParams(app) → {to, nameHash, motto, domicile} (server helper)
    audit.ts                                 # EDIT (A1) — AUDIT_FIELD_ALLOWLIST.APPLICATION += adminApprovedAt, adminApprovedBy
    csv.ts + csv.test.ts                     # NEW (B1) — toCsv(rows, columns) injection-safe + report allowlists (env-neutral)
  validation/admin.ts + admin.test.ts        # EDIT (A3) — approveMintSchema (.strict, EMPTY body) ; export query schemas (B2)
app/
  api/
    admin/
      applications/[id]/approve-mint/route.ts # NEW (A3) — POST: guard+audit; resolve to or 400; set adminApprovedAt/By; return params
      applications/[id]/route.ts               # EDIT (A4) — GET detail += resolvedMintTo (live resolveApplicantAddress) for the UI mint-gate
      export/users/route.ts                   # NEW (B2) — GET CSV (allowlisted, audited)
      export/applications/route.ts            # NEW (B2) — GET CSV
      export/audit/route.ts                   # NEW (B2) — GET CSV
      stats/route.ts                          # NEW (C2) — GET chart series (counts + chain reads, graceful)
    citizen/obligations/route.ts              # EDIT (A5) — admin-approved obligation (chain-truth gated)
  dashboard/mint/MintFlow.tsx                 # EDIT (A5) — "approved by an administrator" state
components/
  admin/
    ApplicationDetail.tsx + .test.tsx         # EDIT (A4) — Approve & mint (override) section + self-mint + PreparedActionCard
    ChainActionsApp.tsx + .test.tsx           # EDIT (A4) — generic "Admin mint" ActionDef (checksum + verify warning)
    UsersApp.tsx + .test.tsx                  # EDIT (B3) — "Download users CSV" button
    ApplicationsApp.tsx + .test.tsx           # EDIT (B3) — "Download applications CSV" button
    AuditViewer.tsx + .test.tsx               # EDIT (B3) — "Download audit CSV" button
    AdminOverviewApp.tsx + .test.tsx          # EDIT (C1 links; C2 charts)
    charts/
      BarChart.tsx + BarChart.test.tsx        # NEW (C2) — applications-by-status inline SVG + a11y alt
      CountTile.tsx + CountTile.test.tsx      # NEW (C2) — count + Spark sparkline + a11y
      ActivitySeries.tsx + .test.tsx          # NEW (C2) — audit-activity-over-time / census-by-city SVG
  home/CitizenHomeApp.tsx + .test.tsx         # EDIT (A5) — admin-approved pending state
test/
  no-admin-signing.test.ts                    # UNCHANGED (must stay green — new files add no tokens/imports)
  integration/admin-mint-e2e.test.ts          # NEW (A6) — anvil: prepared adminMint → ZERO-witness passport
e2e/
  admin-panel.spec.ts                         # EDIT (A4/C1/C2/D) — approve-mint station, 390px no-overflow, charts alt, +0 registrations
docs/ (D1)
  README.md, docs/ARCHITECTURE.md, docs/MAINNET_HANDOFF.md, CHANGELOG.md, package.json
```

---

# GROUP A — MINT OVERRIDE

---

## Task A1 — Schema (`adminApprovedAt` / `adminApprovedBy`) in BOTH schemas + drift guard + sqlite & postgres migrations + audit allowlist

**Files:**

- EDIT `prisma/schema.prisma` (sqlite) + `prisma/postgres/schema.prisma` (postgres) — the SAME two columns on `CitizenshipApplication`.
- NEW `prisma/migrations/<ts>_wave10_admin_approval/migration.sql` (sqlite) + `prisma/postgres/migrations/<ts>_wave10_admin_approval/migration.sql` (postgres).
- EDIT `lib/admin/audit.ts` — extend `AUDIT_FIELD_ALLOWLIST.APPLICATION`.
- (drift is enforced by the existing `prisma/schema-drift.test.ts` — no edit, it just must stay green.)

**READ FIRST:** `prisma/schema.prisma` `CitizenshipApplication` (:70-104 — the `reviewNote` comment convention, the "ALL PUBLIC data" invariant), `prisma/postgres/schema.prisma` `CitizenshipApplication` (:91-125), `prisma/schema-drift.test.ts` (WHOLE — what "identical" means: field name + normalized definition + block attrs), `prisma/migrations/20260702084147_wave9_admin/migration.sql` (the sqlite `ALTER TABLE … ADD COLUMN` shape for `reviewNote`), `prisma/postgres/migrations/20260702000000_init_postgres/migration.sql` (the postgres dialect + how it was generated — check `docs/DEPLOY_VERCEL.md` for the exact `prisma migrate diff` invocation), `lib/admin/audit.ts` (`AUDIT_FIELD_ALLOWLIST.APPLICATION` :63), `scripts/guard-no-secret-columns.sh`.

**Schema additions (BOTH files, ALL PUBLIC data — off-chain intent):**

```prisma
model CitizenshipApplication {
  // … existing fields unchanged (incl. reviewNote) …
  adminApprovedAt DateTime? // admin-mint override APPROVAL time (Wave 10) — OFF-CHAIN INTENT, never chain truth
  adminApprovedBy String?   // the admin userId who approved (Wave 10) — off-chain; citizen state stays chain-derived
}
```

**Audit allowlist (`lib/admin/audit.ts`):** add `"adminApprovedAt"`, `"adminApprovedBy"` to `AUDIT_FIELD_ALLOWLIST.APPLICATION` (so the approve-mint before/after snapshots carry them; still no secret keys).

**Migrations (additive, nullable, no backfill — prod-safe for existing rows):**

- sqlite: `pnpm db:migrate --name wave10_admin_approval` (i.e. `prisma migrate dev`) — produces `ALTER TABLE "CitizenshipApplication" ADD COLUMN "adminApprovedAt" DATETIME;` + `… "adminApprovedBy" TEXT;`.
- postgres: generate the postgres-dialect migration the SAME way `20260702000000_init_postgres` was (documented in `docs/DEPLOY_VERCEL.md` — a `prisma migrate diff … --script` against `prisma/postgres/schema.prisma`), producing `ALTER TABLE "CitizenshipApplication" ADD COLUMN "adminApprovedAt" TIMESTAMP(3);` + `… "adminApprovedBy" TEXT;`. Place under `prisma/postgres/migrations/<ts>_wave10_admin_approval/`. (Do NOT run against a real DB — generate the SQL only; D1 documents the prod `migrate deploy` order.)
- `pnpm db:generate` after the sqlite migrate so the local Prisma client has the fields.

**TDD steps:**

1. [ ] RED — `prisma/schema-drift.test.ts` MUST stay green (add the two columns to BOTH files FIRST so it never goes red for drift). Write a NEW `lib/admin/audit.test.ts` case (or extend the existing audit test): `serializeForAudit("APPLICATION", {id, adminApprovedAt: new Date(0), adminApprovedBy:"u1", passwordHash:"x"})` emits `adminApprovedAt` (ISO) + `adminApprovedBy` and NEVER `passwordHash` — RED before the allowlist edit.
2. [ ] GREEN — edit BOTH schemas; the two migrations; extend the allowlist; `pnpm db:generate`.
3. [ ] Run `pnpm guard:secrets` (green — the two columns are public) && `pnpm test prisma/schema-drift.test.ts lib/admin/audit.test.ts` && `pnpm typecheck`. Confirm both migration files exist with two ADD COLUMN statements each and NO other DDL (additive-only).
4. [ ] Commit.

---

## Task A2 — `prepareAdminMint` (pure encoder) in `lib/admin/prepare.ts` + unit tests

**Files:** EDIT `lib/admin/prepare.ts` + `lib/admin/prepare.test.ts`.

**READ FIRST:** `lib/admin/prepare.ts` (`prepareSetRequiredWitnesses` :208 — the template; `tx`/`single` helpers :90/:109; the header's PURE + environment-NEUTRAL + "validation MIRRORS the contract require strings and throws BEFORE encoding" doctrine), `lib/admin/abis.ts` (`adminPassportAbi` :39, `adminMint` :41), `lib/admin/prepare.test.ts` (the existing decode-round-trip pattern — `decodeFunctionData` against the abi), `contracts/src/CryptRepublicPassport.sol` (`adminMint` :122 + `_mintCitizen` reverts `ZeroAddress`/`AlreadyCitizen`), `lib/passport/attestation.ts` (`nameHashOf`, `toBytes32String` — the caller supplies the already-encoded bytes32 args; `prepareAdminMint` takes `Hex` args and does NOT re-encode strings, keeping it pure).

**Exact interface:**

```ts
// lib/admin/prepare.ts — PURE, environment-NEUTRAL (encodeFunctionData only).
/** PREPARE the witness-FREE admin passport mint (PASSPORT_ADMIN_ROLE). The `to`
 *  address and the three bytes32 args are supplied ALREADY resolved/encoded by
 *  the caller (per-application: resolveApplicantAddress + attestation encoders);
 *  this function only validates + encodes, mirroring the contract's ZeroAddress
 *  revert (an all-zero `to` throws BEFORE encoding). Returns a single-tx batch. */
export function prepareAdminMint(
  chainId: number,
  passport: `0x${string}`,
  to: `0x${string}`,
  nameHash: `0x${string}`,
  motto: `0x${string}`,
  domicile: `0x${string}`,
): PreparedBatch;
```

Behavior: reject `to` when it is not a 20-byte hex address OR is the zero address (`ZeroAddress` mirror) — throw a clear message BEFORE encoding. Reject `nameHash`/`motto`/`domicile` that are not 32-byte hex (`size(x) !== 32`). Then `single("Admin-mint passport to <to> (override witnesses)", tx(chainId, "passport", passport, adminPassportAbi, "adminMint", [to, nameHash, motto, domicile], { to, nameHash, motto, domicile }, "adminMint(<to>, nameHash, motto, domicile)"))`. Do NOT mirror `AlreadyCitizen` here (that needs a chain read — it's the route/UI's job; keep this pure).

**TDD steps:**

1. [ ] RED — `lib/admin/prepare.test.ts` (add a `describe("prepareAdminMint")`):
   - encodes `adminMint` with the four args: `decodeFunctionData({abi: adminPassportAbi, data: batch.txs[0].data})` → `functionName === "adminMint"`, args round-trip to `[to, nameHash, motto, domicile]` (decode round-trip).
   - `batch.kind === "single"`, `txs[0].to === passport`, `value === "0"`, `decoded.contract === "passport"`, `decoded.functionName === "adminMint"`, `decoded.summary` contains `adminMint`.
   - rejects the zero address (`0x0000…0000`) with a `ZeroAddress`/"must be a non-zero address" message; rejects a malformed `to` (not 40 hex); rejects a non-32-byte `nameHash`.
   - `safeTxBuilderJson(batch)` produces one transaction with the same `to`/`data` (Safe export works for the single-tx batch).
2. [ ] GREEN — implement `prepareAdminMint`.
3. [ ] Run `pnpm test lib/admin/prepare.test.ts` && `pnpm test test/no-admin-signing.test.ts` (the new pure encoder adds NO signing token) && `pnpm typecheck`.
4. [ ] Commit.

---

## Task A3 — Approve-mint API + server param builder + `.strict` schema + route tests

**Files:**

- NEW `lib/admin/mintParams.ts` + `lib/admin/mintParams.test.ts` — the server helper that builds the mint params from an application.
- NEW `app/api/admin/applications/[id]/approve-mint/route.ts`.
- EDIT `lib/validation/admin.ts` + `lib/validation/admin.test.ts` — `approveMintSchema`.
- NEW `test/admin-approve-mint-route.test.ts`.

**READ FIRST:** `app/api/admin/applications/[id]/review/route.ts` (WHOLE — the EXACT mutation shape to mirror: guard → `req.json()` try/catch → `safeParse` → `findUnique` before → `$transaction(update + writeAudit)` → json; the off-chain-honest `.strict()` doctrine), `lib/admin/routeGuard.ts` (`guardAdminMutation` signature + keyPrefix/limit/windowMs convention — reuse `keyPrefix:"admin-apps"` or a distinct `"admin-approve-mint"`; limit ~10/5min), `lib/applications/applicant.ts` (`resolveApplicantAddress` — the trusted `to`), `lib/passport/attestation.ts` (`nameHashOf`, `toBytes32String`), `lib/passport/serverReads.ts` (`readHasPassportServer` — to report already-citizen), `lib/validation/admin.ts` (the `.strict()` schema convention — `applicationReviewSchema`), `test/applications-route.test.ts` + the Wave-9 admin route tests (the prisma-seeded + `createSession` + hand-built `Request` pattern; `__resetRateLimit()` in `beforeEach`), `lib/http/responses.ts` (`json`/`badRequest`), MintFlow.tsx's seal payload (confirm the EXACT motto/domicile slice + source so the admin path byte-matches the witnessed path).

**Server param builder (`lib/admin/mintParams.ts`, `"server-only"`):**

```ts
// Resolves the TRUSTED mint destination + the three bytes32 args from an application row.
export interface AdminMintParams {
  to: `0x${string}`;         // resolveApplicantAddress(app.userId) — verified LinkedWallet
  nameHash: `0x${string}`;   // nameHashOf(app.name)
  motto: `0x${string}`;      // toBytes32String((app.motto ?? "").slice(0, 31))
  domicile: `0x${string}`;   // toBytes32String((app.domicileCity ?? "").slice(0, 31))
}
/** null when the applicant has no verified wallet (no trusted destination). */
export async function buildAdminMintParams(app: {
  userId: string; name: string | null; motto: string | null; domicileCity: string | null;
}): Promise<AdminMintParams | null>;
```

Mirror MintFlow's seal encoding EXACTLY (verify the slice lengths + which field maps to motto/domicile). `toBytes32String` throws > 31 bytes UTF-8 — the `.slice(0,31)` cap makes that unreachable for well-formed rows; still catch + surface a 400 in the route if it throws (defensive).

**`.strict()` schema (`lib/validation/admin.ts`):**

```ts
/** approve-mint accepts NO chain-cache fields — the body is EMPTY (or {}).
 *  A body naming status/citizenTokenId/sealTxHash/sealedAt/adminApprovedAt/
 *  adminApprovedBy is 400 by strictness (the server owns those). */
export const approveMintSchema = z.object({}).strict();
```

**Route (`POST /api/admin/applications/[id]/approve-mint`):**

Guard (`guardAdminMutation`) → `req.json()` try/catch (tolerate empty body → `{}`) → `approveMintSchema.safeParse` → `findUnique` the application (404 if missing) → `buildAdminMintParams(app)`; if `null` → `badRequest("This applicant has no verified wallet — adminMint needs a destination.")` (400). Optionally `readHasPassportServer(chainId, params.to)`; if already a citizen → return `{ ok:true, alreadyCitizen:true, mintParams }` WITHOUT re-writing approval (idempotent; the on-chain `adminMint` would revert `AlreadyCitizen` anyway) — OR still record approval but flag `alreadyCitizen:true` (record the choice; recommended: record approval + flag, so the audit trail shows the intent). In one `prisma.$transaction`: set `adminApprovedAt: new Date()` + `adminApprovedBy: actor.user.id` (idempotent — re-approve updates the timestamp; do NOT create duplicate approvals) + `writeAudit(tx, { actorUserId: actor.user.id, actorLabel, action:"application.approve_mint", targetType:"APPLICATION", targetId:id, before, after, userAgent })`. Return `json({ ok:true, alreadyCitizen, mintParams: { to, nameHash, motto, domicile }, chainId })`. The route NEVER signs and NEVER writes chain-cache columns.

**Idempotency + re-approve:** re-POSTing on an already-approved application updates `adminApprovedAt`/`adminApprovedBy` (a fresh approval) and writes a fresh audit row — that's honest (each approval is an event). Do NOT block it; the test asserts a second POST 200s and audits again. (This differs from grant-admin's short-circuit — approval is an event, not a role toggle.)

**TDD steps:**

1. [ ] RED — `lib/admin/mintParams.test.ts`: an application whose user has a verified wallet → `{to (checksummed), nameHash === nameHashOf(name), motto === toBytes32String(motto.slice(0,31)), domicile === toBytes32String(city.slice(0,31))}`; a user with NO verified wallet → `null`. `lib/validation/admin.test.ts`: `approveMintSchema` accepts `{}` and REJECTS `{status:"SEALED"}`, `{citizenTokenId:"1"}`, `{adminApprovedBy:"x"}` (strict). `test/admin-approve-mint-route.test.ts` (`// @vitest-environment node`, mirror `applications-route.test.ts`; `__resetRateLimit()` beforeEach): 401 (no cookie), 403 (role USER), CSRF (bad origin → 403), 429 (over the per-admin limit), 404 (missing app), 400 (applicant has no verified wallet — nothing written, no audit row), happy path (verified wallet → 200 with `mintParams` + `adminApprovedAt` set + ONE `application.approve_mint` audit row whose before/after contain NO passwordHash and DO contain `adminApprovedAt`/`adminApprovedBy`), and a strict-400 for a body naming `status`/`citizenTokenId`. Re-approve (second POST) → 200 + a second audit row.
2. [ ] GREEN — `mintParams.ts`; `approveMintSchema`; the route.
3. [ ] Run `pnpm test lib/admin/mintParams.test.ts lib/validation/admin.test.ts test/admin-approve-mint-route.test.ts test/applications-route.test.ts` && `pnpm test test/no-admin-signing.test.ts` (new server files add no signing token/import) && `pnpm guard:secrets` && `pnpm typecheck`.
4. [ ] Commit.

---

## Task A4 — Admin UI: ApplicationDetail "Approve & mint (override witnesses)" + self-mint + generic ChainActions "Admin mint"

**Files:** EDIT `components/admin/ApplicationDetail.tsx` + `.test.tsx`; EDIT `components/admin/ChainActionsApp.tsx` + `.test.tsx`; EDIT `app/api/admin/applications/[id]/route.ts` (+ its route test) — add the `resolvedMintTo` field so the UI gates on the live-resolved address.

**READ FIRST:** `app/api/admin/applications/[id]/route.ts` (WHOLE — the GET select-allowlist; it currently returns the STORED `applicantAddress` column, NOT a resolved address; A4 adds `resolvedMintTo: await resolveApplicantAddress(app.userId)`), `lib/applications/applicant.ts` (`resolveApplicantAddress` — the trusted `to` source, independent of the stored column), `app/api/applications/witnesses/request/route.ts` (the ONLY writer of `applicantAddress` — confirms the column is a witness-request-time snapshot, `null` for the witness-free case), `components/admin/ApplicationDetail.tsx` (WHOLE — the section layout, the `AppDetail` interface, the `fetch` load pattern, the Review form's POST pattern to mirror for approve-mint), `components/admin/PreparedActionCard.tsx` (props `{prepared, requiredRole}` — reuse UNCHANGED; the `RequiredRoleInfo{contract, role, holders}` shape; `data-testid`s), `lib/admin/prepare.ts` (`prepareAdminMint` from A2), `lib/passport/attestation.ts` (`nameHashOf`/`toBytes32String` — env-neutral, no signing token; safe to import into a `components/admin` file), `components/admin/ChainActionsApp.tsx` (the `ActionDef` shape :~/`ADDRESS_RE`/`badAddress`/`badAmount`/`addr`; how an action's `build`/`role`/`mirror`/`fields`/`info` compose; the `Ctx{chainId, addresses, params}` — `ctx.addresses.passport`; how the topology feeds `holders` into `PreparedActionCard`), `test/no-admin-signing.test.ts` (confirm `nameHashOf`/`toBytes32String`/`prepareAdminMint` add NO forbidden token).

**ApplicationDetail — the Approve & mint section:**

- **FIRST extend the detail GET route** (`app/api/admin/applications/[id]/route.ts`) to ALSO return `resolvedMintTo: await resolveApplicantAddress(app.userId)` — a distinct field (checksummed verified `LinkedWallet`, or `null`) computed from the SAME source A3's approve-mint route uses for `to`. Do NOT reuse the stored `applicantAddress` column for the mint gate: that column is written ONLY by the witness-request flow (`app/api/applications/witnesses/request/route.ts`) and is `null` for the witness-free override's primary case (a verified user who never ran witnesses), while stale/non-null it would display an address that is NOT the server's live mint `to`. Keep `applicantAddress` in the payload only as the (labeled) witness-request snapshot, never as the mint destination. The GET-route edit gets its own RED assertion in this task's step 1 (a verified-wallet user with `applicantAddress == null` still yields a non-null `resolvedMintTo`).
- Extend the `AppDetail` interface (loaded via `/api/admin/applications/[id]`) — surface the new `resolvedMintTo` field. Add an "Admin mint (override witnesses)" `article.pillar`:
  - When `resolvedMintTo` (the server-resolved `to`) is null → a DISABLED affordance with the reason: "This applicant has no verified wallet — adminMint needs a destination." (`data-testid="approve-mint-disabled"`). Gate on `resolvedMintTo`, NOT `applicantAddress` — byte-identical to the route's `to` resolution, so the UI never disables a mintable applicant (nor enables an unmintable one).
  - Else a button "Approve & prepare admin mint" that POSTs `approve-mint`, receives `{mintParams, chainId, alreadyCitizen}`, then renders `<PreparedActionCard prepared={prepareAdminMint(chainId, passportAddr, to, nameHash, motto, domicile)} requiredRole={{contract:"passport", role:"PASSPORT_ADMIN_ROLE", holders}} />`. The `to` displayed and used is the SERVER's `mintParams.to` (== `resolvedMintTo`), never the stored column. The `nameHash`/`motto`/`domicile` come from the SERVER's `mintParams` (already encoded bytes32) — pass them straight into `prepareAdminMint` (the client does not re-encode). `passportAddr` + `holders` come from `/api/admin/chain/params` + `/api/admin/chain/roles` (reuse the ChainActionsApp fetch, or fetch params here) — when unavailable, render the graceful "chain not registered" note and still show the resolved params for manual composition.
  - When `alreadyCitizen` → a note "This address already holds a passport on chain — adminMint would revert (AlreadyCitizen)." (`data-testid="already-citizen"`), and disable the prepared-card export.
  - An explicit honesty line: "Approval is off-chain intent. The passport is issued only when the prepared adminMint is signed and broadcast in your own wallet/Safe and the chain confirms it. This panel never signs."
- **Self-mint (MUST be concretely tested — it is in the request title + acceptance):** two code paths deliver self-mint, and at least ONE carries a dedicated RED assertion (see step 1): (a) the generic ChainActionsApp composer — an admin composing "Admin mint" to their OWN verified address is byte-identically the same path as minting to anyone else (the composer never inspects whose address it is), so a `ChainActionsApp.test.tsx` case that composes to the acting admin's own address and asserts a prepared `adminMint` card IS the self-mint proof; and (b) the per-application approve-mint on the admin's OWN `CitizenshipApplication` row (resolves the admin's own verified wallet via `resolveApplicantAddress(admin.userId)`). Add a small note in `ApplicationDetail` when `app.userId === currentAdminUserId` (thread the admin's id via a prop or a `/api/admin/me`-style read if one exists). Do NOT leave self-mint merely assumed: the RED step's composer-to-self assertion is what verifies "incl. self-mint", so it is not optional.

**ChainActionsApp — the generic "Admin mint" ActionDef:**

- Add an `ActionDef` `{ id:"admin-mint", label:"Admin mint (override witnesses)", requires:["passport"], fields:[{key:"to",label:"Destination address",kind:"text",placeholder:"0x…"},{key:"name",...},{key:"motto",...},{key:"city",...}], info:"VERIFY THIS ADDRESS OFF-CHAIN. A wrong address mints a soulbound passport to a stranger you cannot revoke. Prefer the per-application approve-mint, which uses the applicant's verified wallet.", mirror:(v)=> badAddress(v,"to","Destination") ?? checksumWarn(v,"to") ?? nameLenWarn ?? null, build:(v,ctx)=> prepareAdminMint(ctx.chainId, ctx.addresses.passport!, addr(v,"to"), nameHashOf(String(v.name)), toBytes32String(String(v.motto).slice(0,31)), toBytes32String(String(v.city).slice(0,31))), role:()=>({contract:"passport", role:"PASSPORT_ADMIN_ROLE"}) }`.
- **Checksum validation:** `badAddress` (existing) checks the 0x40-hex shape; ADD a checksum check — `getAddress(input) === input` (viem `getAddress` throws on a bad checksum) — surface "Address checksum is invalid — re-copy the exact checksummed address." The `build` uses `addr(v,"to")` (the exact input) so the checksummed form is what gets encoded; alternatively normalize via `getAddress` in `build`. Record the choice (recommend: validate checksum in `mirror`, encode the checksummed form in `build`).
- The verify-address warning renders via the existing `info` slot AND a distinct `data-testid="admin-mint-verify-warning"` so the test asserts it is present and prominent.

**TDD steps:**

1. [ ] RED — GET-route test (`app/api/admin/applications/[id]` route test): an application whose user has a verified `LinkedWallet` but `applicantAddress == null` in the DB (the witness-free case) STILL returns a non-null `resolvedMintTo` (checksummed), proving the UI-gate source is the live resolution, not the stale column; a user with no verified wallet → `resolvedMintTo: null`. `ApplicationDetail.test.tsx`: with a non-null `resolvedMintTo`, clicking "Approve & prepare admin mint" (mock `fetch` → `{ok:true, mintParams:{...}, chainId:31337}`) renders `data-testid="prepared-action-card"` + the `never-signs-label` + `required-role` (PASSPORT_ADMIN), and the displayed destination equals `mintParams.to`. With `resolvedMintTo:null` (even when a stale `applicantAddress` is present), `data-testid="approve-mint-disabled"` shows the reason and NO prepared card. `alreadyCitizen:true` → `data-testid="already-citizen"`. **Self-mint:** `ChainActionsApp.test.tsx` asserts the composer path IS the self-mint path — an admin composing "Admin mint" to their OWN verified address (a valid checksummed address matching the acting admin's wallet) builds a prepared card whose decoded summary contains `adminMint` and whose `to` is that address (the composer never re-checks whose address it is, so admin-to-self is the same code path — this is the concrete self-mint proof required by the request title/acceptance). `ChainActionsApp.test.tsx` (general): the "Admin mint" action is listed; a malformed address surfaces the address error; a valid checksummed address + name/motto/city builds a prepared card whose decoded summary contains `adminMint`; `data-testid="admin-mint-verify-warning"` is present.
2. [ ] GREEN — implement both UIs.
3. [ ] Run `pnpm test components/admin/ApplicationDetail.test.tsx components/admin/ChainActionsApp.test.tsx` && `pnpm test test/no-admin-signing.test.ts` (MUST stay green — verify the new imports/tokens) && `pnpm typecheck` && `pnpm lint`.
4. [ ] Commit.

---

## Task A5 — Applicant reflection: obligations + MintFlow + CitizenHomeApp show "approved by an administrator — passport being issued" (chain-truth gated)

**Files:** EDIT `app/api/citizen/obligations/route.ts`; EDIT `app/dashboard/mint/MintFlow.tsx`; EDIT `components/home/CitizenHomeApp.tsx` + `.test.tsx`; EDIT `test/` obligations route test (locate it — `grep -rl obligations test/`).

**READ FIRST:** `app/api/citizen/obligations/route.ts` (WHOLE — where the application is read BEFORE the address gate; how witness obligations are pushed; the `{isCitizen, tokenId, obligations}` return; the graceful try/catch around chain reads), `app/dashboard/mint/MintFlow.tsx` (the resume logic keyed on `application.status`; the witness-waiting copy; how `application` is loaded — extend the loaded fields to include `adminApprovedAt`), `components/home/CitizenHomeApp.tsx` (the `witnessPending` grouping :~110/:186/:331-346; `data-testid="witness-pending"`/`"passport-rail-pending"`), `lib/passport/serverReads.ts` (`readPassportStatusServer`/`readHasPassportServer` — the chain-truth gate), the obligations route test.

**Behavior (chain-truth gated — constraint #3):**

- `obligations/route.ts`: after loading the application, when `application.adminApprovedAt != null` AND the caller is NOT yet a citizen on chain (the existing `status`/`readPassportStatusServer` gates), push `{ kind:"admin-approved", ref:"issuing", label:"An administrator has approved your application; your passport is being issued by the Republic." }`. Do NOT push it once `readHasPassport` is true (the citizen state supersedes). Keep the existing witness obligations; if BOTH an admin approval AND a witness request exist, prefer the admin-approved message (approval overtakes the witness path) — record the choice.
- `MintFlow.tsx`: extend the loaded application fields with `adminApprovedAt`; when it is set and the chain shows no passport, render the "approved by an administrator — passport being issued" state INSTEAD of "waiting for N witnesses". Once `readHasPassport` true, the normal citizen/sealed state wins (unchanged).
- `CitizenHomeApp.tsx`: thread the new obligation into the pending grouping — either reuse `witnessPending` (treat `kind:"admin-approved"` as pending) with the admin-approved wording, or add a distinct `data-testid="admin-approved-pending"` passport-rail state. Keep the existing witness-pending behavior intact.

**TDD steps:**

1. [ ] RED — obligations route test: an application with `adminApprovedAt` set + a non-citizen caller (chain read mocked to `isCitizen:false`) → obligations include a `kind:"admin-approved"` entry with the exact copy; a citizen caller (chain `isCitizen:true`) → NO admin-approved entry. `CitizenHomeApp.test.tsx`: given an `admin-approved` obligation + non-citizen, the pending passport-rail state renders (its `data-testid`) with the admin-approved wording; given `isCitizen`, the normal citizen state renders. (MintFlow: add a focused test if the file has one; else assert via the obligations/home coverage + a manual note.)
2. [ ] GREEN — implement the three edits.
3. [ ] Run `pnpm test <obligations-route-test> components/home/CitizenHomeApp.test.tsx` && `pnpm typecheck` && `pnpm lint`.
4. [ ] Commit.

---

## Task A6 — Anvil integration proof: prepared `adminMint` mints a ZERO-witness passport

**Files:** NEW `test/integration/admin-mint-e2e.test.ts`.

**READ FIRST:** `test/integration/anvil-harness.ts` (`startAnvilWithContracts`, `AnvilDeployment` — the six addresses + `admin:{address, privateKey}` = anvil key #0 which holds PASSPORT_ADMIN_ROLE per Deploy.s.sol, `castSend`/broadcast helpers, `foundryAvailable()` skip guard, the `afterAll` cleanup), any existing Wave-9 `test/integration/admin-prepared-e2e.test.ts` (the pattern: build a prepared batch with `lib/admin/prepare`, broadcast its `data` with the throwaway admin key, assert on-chain state), `lib/admin/prepare.ts` (`prepareAdminMint`), `lib/passport/serverReads.ts` or the harness's read helpers (`readHasPassport`/`totalCitizens`), `lib/passport/attestation.ts` (`nameHashOf`/`toBytes32String` to build the args), `test/no-admin-signing.test.ts` (confirm this test lives OUTSIDE the scanned dirs — `test/integration/` is exempt; signing the throwaway key here is legal).

**Proof:**

- Start anvil with contracts. Pick a fresh, non-citizen throwaway address as `to` (e.g. anvil key #3). Build `params = { to, nameHash: nameHashOf("Ada Test"), motto: toBytes32String("code is law"), domicile: toBytes32String("Neo Berlin") }`. `batch = prepareAdminMint(31337, deployment.passport, to, params.nameHash, params.motto, params.domicile)`. (Self-mint is proven at the composer/route level in A4's RED step — the admin minting to their OWN verified address — not here; A6 proves the ZERO-witness on-chain mint mechanics with a throwaway destination, which is `to`-agnostic.)
- Read `totalCitizens()` before. Broadcast `batch.txs[0]` (`to`, `data`, `value:0`) signed with `deployment.admin.privateKey` (the throwaway PASSPORT_ADMIN key — INSIDE THE TEST ONLY).
- Assert: `readHasPassport(to)` is now `true`; `totalCitizens()` increased by exactly 1; the minted `Citizen`'s `nameHash`/`motto`/`domicile` (via a getter or the `CitizenMinted` log) match the params (decode motto/domicile with `decodeBytes32String`); ZERO `WitnessAttested` events for this mint (adminMint takes no witnesses); the Safe JSON (`safeTxBuilderJson(batch)`) is byte-faithful to the broadcast tx (`to`/`data`).
- Skip cleanly when `foundryAvailable()` is false (mirror the harness's skip).

**TDD steps:**

1. [ ] RED — write the test; it fails until `prepareAdminMint` (A2) is present + correct (it is, by now) and the broadcast wiring is right (first run may fail on the harness plumbing — fix the test, never the contract).
2. [ ] GREEN — `pnpm test:integration test/integration/admin-mint-e2e.test.ts` (local anvil).
3. [ ] Run the FULL `pnpm test:integration` — all green in one run; confirm forge untouched (still 165).
4. [ ] Commit.

---

# GROUP B — REPORTS

---

## Task B1 — CSV exporter util (`lib/admin/csv.ts`) — field-allowlisted + injection-safe + tests

**Files:** NEW `lib/admin/csv.ts` + `lib/admin/csv.test.ts`.

**READ FIRST:** `lib/admin/audit.ts` (`serializeForAudit` :125 — the allowlist-pick + BigInt→string + Date→ISO discipline to mirror; `AUDIT_FIELD_ALLOWLIST` :49 — reuse `USER`/`APPLICATION` field sets as the export source-of-truth where they overlap), `lib/admin/routeGuard.ts` (`USER_SELECT`/`SESSION_SELECT` — the no-secret select allowlist), `test/no-admin-signing.test.ts` (the FORBIDDEN token list — the CSV code must NOT contain the substring `sendTransaction` etc.; use `download`/`export`/`csv` identifiers), the OWASP CSV-injection guidance baked into constraint #5.

**Exact interface (environment-NEUTRAL — a node unit test imports it directly; NO `"server-only"`):**

```ts
export interface CsvColumn<T> { key: keyof T & string; header: string }

/** Serialize rows to a CSV string using an EXPLICIT column allowlist.
 *  - header row from columns[].header
 *  - value coercion: null/undefined → ""; bigint → String; Date → ISO;
 *    boolean/number → String; object → JSON.stringify (defensive)
 *  - FORMULA-INJECTION SAFE: a cell whose STRING value begins with = + - @
 *    TAB(\t) or CR(\r) is prefixed with a leading apostrophe AND quoted
 *  - QUOTING: a value containing , " \n or \r is wrapped in double quotes with
 *    inner " doubled ("")
 *  - line terminator: \r\n (Excel-friendly) */
export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string;
```

Only keys named in `columns` are ever emitted — a row carrying `passwordHash`/`tokenHash` cannot leak because those keys are not in any export column set. The three report column sets live here (or imported by the routes):

```ts
export const USERS_EXPORT_COLUMNS: readonly CsvColumn<...>[]; // id,email,name,role,kycStatus,suspendedAt,lockedUntil,failedLoginCount,createdAt,updatedAt  (== USER_SELECT; NO passwordHash)
export const APPLICATIONS_EXPORT_COLUMNS: readonly CsvColumn<...>[]; // id,userId,status,kycStatus,name,domicileCity,hostCountry,motto,applicantAddress,adminApprovedAt,adminApprovedBy,reviewNote,createdAt,updatedAt  (public; NO tokens)
export const AUDIT_EXPORT_COLUMNS: readonly CsvColumn<...>[]; // id,actorLabel,action,targetType,targetId,createdAt (NOT beforeJson/afterJson? — decide: include them, they are ALREADY allowlist-serialized, so safe; recommend include beforeJson/afterJson)
```

**TDD steps:**

1. [ ] RED — `lib/admin/csv.test.ts`:
   - header + rows: `toCsv([{a:1,b:"x"}],[{key:"a",header:"A"},{key:"b",header:"B"}])` → `"A,B\r\n1,x\r\n"`.
   - injection: a value `"=1+2"` → quoted with a leading apostrophe (`"'=1+2"` inside quotes); same for `+`,`-`,`@`,leading TAB, leading CR.
   - quoting: values with `,`, `"`, `\n`, `\r` are quoted and inner quotes doubled.
   - coercion: `bigint` → decimal string; `Date` → ISO; `null`/`undefined` → empty cell.
   - allowlist: a row with an extra `passwordHash` key + a column set NOT naming it → the output contains NO `passwordHash` value (only the allowlisted columns appear).
2. [ ] GREEN — implement `toCsv` + the three column sets.
3. [ ] Run `pnpm test lib/admin/csv.test.ts` && `pnpm test test/no-admin-signing.test.ts` (no forbidden substring) && `pnpm guard:secrets` && `pnpm typecheck`.
4. [ ] Commit.

---

## Task B2 — Export routes (`GET /api/admin/export/{users,applications,audit}.csv`) — guarded, audited, allowlisted

**Files:** NEW `app/api/admin/export/users/route.ts`, `app/api/admin/export/applications/route.ts`, `app/api/admin/export/audit/route.ts`; NEW `test/admin-export-routes.test.ts`; EDIT `lib/admin/audit.ts` ONLY IF adding an `EXPORT` audit target (see decision).

**READ FIRST:** `app/api/admin/overview/route.ts` (the `guardAdminGet` GET shape), `app/api/admin/applications/[id]/route.ts` (the select-allowlisted read), `lib/admin/routeGuard.ts` (`guardAdminGet(req, rl?)` — apply the per-admin rate limit here since exports are heavy: `{keyPrefix:"admin-export", limit:10, windowMs:5*60_000}`; `USER_SELECT`/`SESSION_SELECT`), `lib/admin/csv.ts` (B1 — `toCsv` + column sets), `lib/admin/audit.ts` (`writeAudit` — the export audit row; and whether to add an `EXPORT` target), `lib/db.ts`, `lib/http/responses.ts` (how to return a non-JSON body — construct a `new Response(csv, { headers })` directly), the Wave-9 admin route tests (test pattern).

**Audit-target decision (record it):** exports have no natural mutation target. Two honest options: (a) add `"EXPORT"` to `AuditTargetType` + `AUDIT_FIELD_ALLOWLIST` (allowlist e.g. `["kind","rowCount","requestedAt"]`) and write `writeAudit` with `targetType:"EXPORT", targetId:kind`; or (b) reuse an existing target with a synthetic id (e.g. `targetType:"USER", targetId:"*"` for the users export) — less honest. **Recommend (a):** add the `EXPORT` target. Since exports are READS (no `prisma.$transaction` mutation to bind to), write the audit row via a standalone `prisma.$transaction(async tx => writeAudit(tx, …))` (or `prisma.auditLog.create` through the serializer) BEFORE returning the body — audited but not transactionally bound to a mutation (constraint #4 allows this for exports).

**Route shape (each of the three):**

- `guardAdminGet(req, {keyPrefix:"admin-export", limit:10, windowMs:5*60_000})` → `if (instanceof Response) return it`.
- Query the rows with the SAME select-allowlist as the report columns (users → `USER_SELECT`; applications → the public application select incl. the new columns; audit → the audit columns). No pagination for v1 (export is the whole table) OR support `?limit=`/date-range via a `.strict()` query schema — v1: whole table, capped at a sane max (e.g. 50_000 rows) with a note.
- `const csv = toCsv(rows, <COLUMNS>)`.
- Write the audit row (`action:"admin.export.users|applications|audit"`, `targetType:"EXPORT"`, `targetId:kind`, `after:{kind, rowCount: rows.length}`, `userAgent`).
- `return new Response(csv, { status:200, headers: { "content-type":"text/csv; charset=utf-8", "content-disposition": \`attachment; filename="cryptrepublic-<kind>-<yyyy-mm-dd>.csv"\`, "cache-control":"no-store" } })`.

**Secret-exposure assertions:** each route test parses the CSV body and asserts it contains NO `passwordHash` and NO `tokenHash` string (and the users export never contains a session token; the audit export's before/afterJson are already allowlist-serialized so they carry no secret).

**TDD steps:**

1. [ ] RED — `test/admin-export-routes.test.ts` (`// @vitest-environment node`, `__resetRateLimit()` beforeEach): for EACH of the three — 401 (no cookie), 403 (role USER), 429 (over limit), happy path (role ADMIN → 200, `content-type: text/csv`, `content-disposition: attachment`, a header row matching the column set, at least the seeded rows present), and the SECRET assertion (body has no `passwordHash`/`tokenHash`). Each happy path writes ONE `admin.export.<kind>` audit row (assert it exists with `targetType:"EXPORT"`).
2. [ ] GREEN — add the `EXPORT` audit target (allowlist entry) if chosen; implement the three routes.
3. [ ] Run `pnpm test test/admin-export-routes.test.ts lib/admin/audit.test.ts` && `pnpm test test/no-admin-signing.test.ts` && `pnpm guard:secrets` (MUST stay green with the new routes) && `pnpm typecheck`.
4. [ ] Commit.

---

## Task B3 — Download buttons in Users / Applications / Audit admin screens

**Files:** EDIT `components/admin/UsersApp.tsx` + `.test.tsx`; EDIT `components/admin/ApplicationsApp.tsx` + `.test.tsx`; EDIT `components/admin/AuditViewer.tsx` + `.test.tsx`.

**READ FIRST:** `components/admin/UsersApp.tsx`, `components/admin/ApplicationsApp.tsx`, `components/admin/AuditViewer.tsx` (the header/toolbar area of each — where a button fits; the existing button styles `btn btn-ghost`/`btn btn-primary`), `components/admin/PreparedActionCard.tsx` (the `download()` pattern — `Blob` + `URL.createObjectURL` + `<a download>` — BUT for CSV we hit the server route, so a simpler pattern is a plain `<a href="/api/admin/export/<kind>.csv" download>` styled as a button, which triggers the browser download with the server's `content-disposition`; that avoids client-side blob building and re-uses the audited server route), `components/admin/bits.tsx`.

**Implementation:** in each screen's toolbar, add a link-styled button:

```tsx
<a className="btn btn-ghost" href="/api/admin/export/users.csv" download data-testid="download-users-csv">
  Download users CSV
</a>
```

Applications → `/api/admin/export/applications.csv` (`download-applications-csv`); Audit → `/api/admin/export/audit.csv` (`download-audit-csv`). A plain `<a download>` is keyboard-focusable and needs no JS — no `onClick`, no signing token. (If the routes are defined at `/api/admin/export/users` rather than `.../users.csv`, use that path — align B3 hrefs to B2's actual route paths; recommend the `.csv` suffix segment in B2 so the filename reads naturally, i.e. `app/api/admin/export/users.csv/route.ts` OR set filename via `content-disposition` and route at `/export/users`. Pick ONE and keep B2/B3 consistent — record it.)

**TDD steps:**

1. [ ] RED — each screen test asserts the download link is present with the correct `href` + `download` attribute + `data-testid`, and is a real anchor (keyboard-focusable), not an `onClick` div.
2. [ ] GREEN — add the three links.
3. [ ] Run `pnpm test components/admin/UsersApp.test.tsx components/admin/ApplicationsApp.test.tsx components/admin/AuditViewer.test.tsx` && `pnpm test test/no-admin-signing.test.ts` && `pnpm typecheck` && `pnpm lint`.
4. [ ] Commit.

---

# GROUP C — DASHBOARD UX

---

## Task C1 — Clickable stat tiles (real Links → sections) + responsive admin grids + mobile no-overflow e2e + axe

**Files:** EDIT `components/admin/AdminOverviewApp.tsx` + `.test.tsx`; EDIT `components/admin/ApplicationDetail.tsx` (fix any fixed-px `dl` grid that overflows at 390px) + other admin islands as the 390px audit reveals; EDIT `e2e/admin-panel.spec.ts` (mobile no-overflow + axe stations).

**READ FIRST:** `components/admin/AdminOverviewApp.tsx` (WHOLE — the four `<article className="pillar" data-testid="overview-*">` tiles; the inline `gridTemplateColumns:"1fr 1fr"` container; the `Tile` component), `components/admin/adminNavItems.ts` (the exact hrefs: `/admin/users`, `/admin/applications`, `/admin/content`, `/admin/flags`), `components/shell/shell.module.css` (the `≤760` global collapse :104-107 — inline `grid-template-columns` inside `.main` collapses to `1fr`; the `data-grid="row"` opt-out), `components/admin/AdminShell.tsx` (content is inside `styles.main`), `e2e/admin-panel.spec.ts` (the axe helper + bootstrap; add stations), `e2e/a11y.spec.ts` (the axe threshold), Next `Link` import convention (`next/link`).

**Clickable tiles (real Links, a11y):**

- Wrap each Overview stat `article.pillar` in a `<Link href=...>` (or make the article a `<Link>` styled as the pillar) with an `aria-label` describing the destination ("View all users", "Review citizenship applications", "Manage content", "Manage feature flags"). Keep the `data-testid` on the link. Users tile → `/admin/users`; Applications → `/admin/applications`; Content → `/admin/content`; Flags → `/admin/flags`. Chain-actions is NOT in the brief's four — leave it. The links MUST be keyboard-focusable (native `<a>` from `Link`) and NOT `onClick` divs. Add a subtle hover/focus affordance (a focus ring via `:focus-visible` — token-based; no new heavy CSS).

**Responsive audit (390px, overflow-free):**

- The `≤760` shell rule already collapses the Overview's inline `1fr 1fr` grid and the tiles' `flex-wrap` handles the inner tiles. VERIFY at 390px: no element causes `scrollWidth > innerWidth`. FIX offenders the rule misses: `ApplicationDetail`'s `dl` uses `gridTemplateColumns:"160px 1fr"` (fixed 160px + long mono addresses) — the `≤760` rule collapses it to `1fr` (good), but long unbroken addresses can still overflow → ensure `overflowWrap:"anywhere"` on the `dd` (already present on some; add where missing). Any wide `Ledger`/table → wrap in a `div` with `overflowX:"auto"` (scroll inside its own container; the page body never scrolls horizontally). Charts (C2) get the same treatment.

**TDD steps:**

1. [ ] RED — `AdminOverviewApp.test.tsx`: each stat tile is an anchor with the correct `href` (`/admin/users` etc.) and an `aria-label`; assert it is an `<a>` (role `link`), not a `div` with `onClick`. (Component test uses the testids + `closest("a")` or role query.)
2. [ ] GREEN — convert the tiles to Links; fix any grid overflow found in the manual 390px pass.
3. [ ] RED→GREEN e2e — add to `e2e/admin-panel.spec.ts`: a mobile station (`page.setViewportSize({width:390,height:844})`) visiting `/admin`, `/admin/users`, `/admin/applications` and asserting `await page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth + 1)` (no horizontal overflow) on each; a click station proving a tile navigates to its section; and axe (`expectNoCriticalOrSerious`) on `/admin` at mobile width. Registration budget stays 9.
4. [ ] Run `pnpm test components/admin/AdminOverviewApp.test.tsx` && `pnpm e2e e2e/admin-panel.spec.ts` && `pnpm typecheck` && `pnpm lint`.
5. [ ] Commit.

---

## Task C2 — Infographics: admin stats endpoint + self-contained SVG charts with accessible alternatives, rendered on Overview

**Files:** NEW `app/api/admin/stats/route.ts` + `test/admin-stats-route.test.ts`; NEW `components/admin/charts/BarChart.tsx` + `.test.tsx`, `CountTile.tsx` + `.test.tsx`, `ActivitySeries.tsx` + `.test.tsx`; EDIT `components/admin/AdminOverviewApp.tsx` + `.test.tsx` (render the charts).

**READ FIRST:** `app/api/admin/overview/route.ts` (the counts/`groupBy` shape to extend/mirror; `APP_STATUS_ORDER` from `lib/applications/state.ts`), `lib/passport/serverReads.ts` (`readTotalCitizensServer` — citizens count; graceful try/catch → `available:false`), `config/contracts.ts` (**NOTE: there is NO `passportAvailable` function** — the `*Available` probes are only `governanceAvailable`/`treasuryAvailable`/`distributorAvailable`/`tokenAvailable` (:119-131); passport availability is `Boolean(contractEntry(chainId).passport)` if you probe explicitly, but the graceful try/catch below makes an explicit probe unnecessary), `components/ui/Spark.tsx` (WHOLE — `Spark({points, color, ...})`, flat baseline for `<2` points, already non-fabricating — reuse in `CountTile`), `styles/tokens.css` (color tokens `--gold`/`--navy`/`--line`/`--muted`; `@media (prefers-reduced-motion: reduce)` :151 — the reduced-motion precedent), `middleware.ts` (CSP nonce — inline SVG only, no external `<script>`, no inline `on*`), the Wave-9 `AUDIT_FIELD_ALLOWLIST` (audit-activity buckets read the `AuditLog` table — group by day; no secret exposure).

**Stats endpoint (`GET /api/admin/stats`, `guardAdminGet` — chain reads may rate-limit):**

Return honest series (all from the DB + chain, graceful):

```ts
{
  applicationsByStatus: { status: string; count: number }[]; // groupBy status, in APP_STATUS_ORDER
  counts: { users: number; citizens: number | null; embassies: number }; // citizens = readTotalCitizensServer or null when available:false
  chainAvailable: boolean; // false → citizens null, honest
  auditActivity: { day: string; count: number }[]; // AuditLog grouped by day over the last N days (e.g. 14)
  // census: EITHER (a) live-aggregated from CitizenshipApplication.domicileCity (minted only) → set censusSource:"live",
  //         OR (b) CityCensus.seededCount → set censusSource:"seeded" so the UI labels it demonstrative (schema:189-192).
  censusByCity: { code: string; name: string; count: number }[];
  censusSource: "live" | "seeded"; // drives the mandatory SEEDED/demonstrative label when "seeded" (honesty guard)
}
```

Audit-activity grouping: query `auditLog.findMany({ where:{ createdAt: { gte: since } }, select:{ createdAt:true } })` then bucket by ISO day in JS (SQLite has no clean date_trunc via Prisma groupBy) — or `groupBy` with a computed key; keep it honest (empty days present with count 0 over the window). Citizens (do NOT call a `passportAvailable` — it does not exist; rely on the graceful catch, per note #8): `let citizens: number | null = null; let chainAvailable = false; try { citizens = Number(await readTotalCitizensServer(chainId)); chainAvailable = true; } catch { /* unregistered/unreachable → null, honest */ }`. Never let the read 500 the route.

**Chart components (self-contained inline SVG, a11y, reduced-motion):**

- `BarChart({ data: {label:string; value:number}[], title:string })` — applications-by-status. Inline `<svg role="img" aria-label={title}>` with `<title>`+`<desc>` summarizing the values, bars colored via `var(--navy)`/`var(--gold)`, axis baseline via `var(--line)`, labels via `var(--muted)`. PLUS a visually-hidden `<table>` (or `<ul>`) listing label→value as the accessible data alternative (screen-reader + axe). Any animated bar-grow uses a CSS class gated by `@media (prefers-reduced-motion: reduce) { animation:none }` — or NO animation (simplest, safest). No inline event handlers.
- `CountTile({ label:string, value:number|null, points?:number[] })` — a count + a `Spark` sparkline (reuse `components/ui/Spark.tsx`). `value===null` → an honest "—" + a "chain unavailable" note (never a fake number). `aria-label` = `${label}: ${value ?? "unavailable"}`.
- `ActivitySeries({ data:{label:string; value:number}[], title:string })` — a small inline-SVG line/bar series for audit-activity-over-time AND (reused) census-by-city. Same a11y pattern (`role="img"` + `<title>`/`<desc>` + visually-hidden data table). Wrap in `overflowX:"auto"` if it can exceed 390px. **Census honesty (finding-driven):** when the Overview passes `censusSource === "seeded"`, the census `ActivitySeries` MUST carry a title AND `<title>`/`<desc>`/visually-hidden-table text that explicitly reads "seeded / demonstrative — not live census" (e.g. `title="Census by city (SEEDED — demonstrative, not live)"`), so seeded geography is never presented as real citizen distribution (`prisma/schema.prisma:189-192`). Do NOT let the census chart's label imply live per-city citizen counts unless `censusSource === "live"`.

**Overview render:** below the (now-linked) stat tiles, add a "Republic at a glance" section with `BarChart` (applications-by-status), `CountTile`s (users / citizens / embassies with sparklines where a real series exists — else the flat baseline), `ActivitySeries` (audit activity + census). For the census `ActivitySeries`, pass the seeded label through when `censusSource === "seeded"` (per the component note above) so the "SEEDED — demonstrative, not live census" wording is visible in both the title and the accessible alternative. Fetch from `/api/admin/stats`; loading/error/empty states via `bits` (`Skeleton`/`CardError`). Honest empty: zero data → the flat baseline / "no activity yet", never a fabricated curve.

**TDD steps:**

1. [ ] RED — `test/admin-stats-route.test.ts` (node): 401/403 guard; happy path returns `applicationsByStatus` in `APP_STATUS_ORDER`, `counts.users` matching the seeded count, `chainAvailable:false` + `counts.citizens:null` when the chain is unregistered (default test env — the graceful catch, NO `passportAvailable` call), `auditActivity` buckets over the window, `censusByCity` + a `censusSource` of `"live"` or `"seeded"` (assert the field is present and one of the two — if the route uses `CityCensus.seededCount` it MUST be `"seeded"`); NO secret field anywhere in the payload. `BarChart.test.tsx`/`CountTile.test.tsx`/`ActivitySeries.test.tsx`: each renders an `<svg role="img">` with an `aria-label`/`<title>` AND a visually-hidden data alternative listing the values; `CountTile` with `value:null` renders "—" + the unavailable note (no fabricated number); with `<2` sparkline points renders the flat baseline (Spark's `spark-empty`). **Census honesty:** `ActivitySeries` rendered as the census chart with the seeded label asserts that the visible title AND the accessible text alternative both contain the "SEEDED"/"demonstrative"/"not live" wording (so seeded geography is never shown as real citizen distribution).
2. [ ] GREEN — the stats route; the three chart components; wire them into the Overview.
3. [ ] RED→GREEN e2e — add an `e2e/admin-panel.spec.ts` station: `/admin` at desktop + mobile shows the charts' accessible alternative (a testid on the visually-hidden table), and axe stays ZERO critical/serious with the charts present. Registration budget stays 9.
4. [ ] Run `pnpm test test/admin-stats-route.test.ts components/admin/charts/*.test.tsx components/admin/AdminOverviewApp.test.tsx` && `pnpm e2e e2e/admin-panel.spec.ts` && `pnpm guard:secrets` && `pnpm typecheck` && `pnpm lint`.
5. [ ] Commit.

---

# GROUP D — CLOSE-OUT

---

## Task D1 — Docs (README / ARCHITECTURE / MAINNET_HANDOFF / CHANGELOG) + version + prod migration run-order + FULL gate + acceptance checklist

**Files:** EDIT `README.md`, `docs/ARCHITECTURE.md`, `docs/MAINNET_HANDOFF.md`, `CHANGELOG.md`, `package.json` (`"version":"0.10.0"`).

**READ FIRST:** `README.md` (the wave table :114-122 — add a Wave 10 row; the admin paragraph :30; the scripts list), `docs/ARCHITECTURE.md` (§11 admin — where the prepared-tx model + audit + flags live; append the admin-mint-override + off-chain-intent columns + CSV export allowlist + infographics), `docs/MAINNET_HANDOFF.md` (the key-custody + admin sections — the admin-mint override is witness-free passport issuance; report exports carry PII), `docs/DEPLOY_VERCEL.md` (the `vercel-build` → `prisma migrate deploy` flow + how the postgres migration was generated — cite the exact prod run-order), `CHANGELOG.md` (Keep-a-Changelog shape; current `[Unreleased]` block), the Wave-9 D3 acceptance-checklist format.

**Content contracts:**

1. **README:** wave table → a Wave 10 row "Admin enhancements (admin-mint override + CSV exports + responsive + infographics) — Delivered (dated)"; the admin paragraph gains "an admin-mint override issues a passport WITHOUT the external witnesses — PREPARED only, signed in the admin's own wallet/Safe, never by the panel; field-allowlisted CSV report exports (users / applications / audit), injection-safe and audited". Test-matrix counts refreshed from the ACTUAL close-out run.
2. **ARCHITECTURE §11 (extend):** the admin-mint-override path (`adminMint` PASSPORT_ADMIN_ROLE, ZERO witnesses; `prepareAdminMint` pure → `PreparedActionCard`; `to` = resolved verified `LinkedWallet`, never client-supplied; the off-chain-intent `adminApprovedAt`/`adminApprovedBy` columns are NEVER chain truth — citizen state stays `readHasPassport`-derived); the CSV export allowlist model (explicit per-report columns; injection-safe; audited as `admin.export.<kind>`; never `passwordHash`/`tokenHash`); the infographics (self-contained inline SVG, CSP-safe, accessible alternatives, honest data with graceful `available:false`). Cross-link the non-custodial guard test.
3. **MAINNET_HANDOFF:** an "Admin-mint override (witness-free issuance)" note — the panel PREPARES `adminMint`; the operator signs in their own wallet/Safe; a wrong `to` mints a soulbound passport that cannot be revoked, so prefer the per-application path (verified wallet) and verify any manual address off-chain; the required role is PASSPORT_ADMIN_ROLE. A "Report exports" note — CSV exports contain PII (emails, addresses) → handle per data policy; secrets are never exported (allowlist). **Prod migration run-order (explicit):** the Wave-10 columns are additive-nullable; `vercel-build` runs `prisma migrate deploy` on `prisma/postgres/schema.prisma` so the postgres migration ships WITH the deploy and `migrate deploy` runs before the new server code serves traffic — the additive-nullable design means the currently-live code (which does not read the columns) is unaffected up to that point; for a manual/zero-downtime posture, run `prisma migrate deploy` against Neon FIRST, then deploy the code that reads the columns. Document both.
4. **CHANGELOG:** `## [0.10.0] — <date>` itemized per group A–D (honest); `package.json` version 0.10.0. Tagging stays USER-scoped.
5. **Close-out — run the FULL gate** and record real counts in the commit body:
   `pnpm guard:secrets && pnpm format:check && pnpm typecheck && pnpm lint && pnpm test && pnpm test:integration && pnpm e2e && (cd contracts && forge test && forge snapshot --check && bash scripts/coverage-gate.sh) && pnpm build` — ALL green (forge untouched this wave: still 165).

**Verification (docs "test"):**

1. [ ] Link-check every relative path in the touched docs — zero broken.
2. [ ] Honesty audit: the non-custodial boundary stated wherever admin-mint/exports appear; off-chain-intent columns never described as chain truth; counts pulled from the actual gate run.
3. [ ] The full gate (item 5) green; `pnpm format:check` green (covers the `.md` plan + docs).
4. [ ] Verify the final acceptance checklist below; check every box in the commit/PR body.
5. [ ] Commit. (Deploy + prod Neon migrate + GitHub push are the human operator's steps AFTER the gate — see the documented run-order in item 3.)

---

## Final acceptance checklist (verify before claiming Wave 10 complete)

- [ ] **Admin-mint override is PREPARED-only + witness-free:** `prepareAdminMint` (pure) encodes `adminMint(to,nameHash,motto,domicile)`; `PreparedActionCard` renders it with "PREPARED FOR YOUR SAFE — THIS PANEL NEVER SIGNS" + `required-role` PASSPORT_ADMIN; `test/no-admin-signing.test.ts` green on BOTH rules; the anvil proof (A6) mints a ZERO-witness passport → `readHasPassport` true + `totalCitizens` +1 with the signing done by the TEST's throwaway PASSPORT_ADMIN key only (A2, A4, A6).
- [ ] **Trusted destination, never client-supplied (per-application):** `to = resolveApplicantAddress(app.userId)`; the UI gates/displays on the GET route's live `resolvedMintTo` (== the route's `to`), NEVER the stale `applicantAddress` column, so a verified-wallet applicant with `applicantAddress == null` is still mintable; no verified wallet → approve DISABLED (UI) AND 400 (route); admin SELF-mint resolves the admin's OWN verified address the same way and has a concrete RED test (composer-to-self); the generic composer validates checksum + shows the prominent verify-off-chain warning and still never signs (A3, A4).
- [ ] **Chain-truth honesty:** `adminApprovedAt`/`adminApprovedBy` are off-chain intent; the approve-mint `.strict()` schema rejects any chain-cache field (400); the applicant UI says "an administrator has approved your application; your passport is being issued by the Republic" and only shows citizen once the chain confirms (A1, A3, A5).
- [ ] **Every new admin route authorized + audited:** guard stack (origin → requireAdmin → per-admin rateLimit) + zod `.strict()` on approve-mint + the three exports + stats; approve-mint writes its `application.approve_mint` audit row IN THE SAME `$transaction`; each export writes an `admin.export.<kind>` (`EXPORT` target) audit row; no route accepts `role` (A3, B2, C2).
- [ ] **Reports allowlisted + injection-safe + no secret leak:** explicit per-report columns; CSV escapes leading `= + - @` TAB CR and quotes/newlines; export bodies contain NO `passwordHash`/`tokenHash`; `pnpm guard:secrets` green (B1, B2, B3).
- [ ] **Schema additive + prod-safe + drift-clean:** `adminApprovedAt`/`adminApprovedBy` nullable in BOTH schemas; `prisma/schema-drift.test.ts` green; sqlite + postgres migrations are ADD COLUMN only (no backfill); `AUDIT_FIELD_ALLOWLIST.APPLICATION` extended; the prod `migrate deploy` run-order documented (A1, D1).
- [ ] **Clickable tiles + responsive + a11y:** the four Overview stat tiles are real keyboard-focusable `<Link>`s with `aria-label`s navigating to `/admin/{users,applications,content,flags}`; all admin screens overflow-free at 390px (mobile e2e no-overflow assertion); axe ZERO critical/serious on `/admin` at desktop + mobile (C1, C2).
- [ ] **Infographics self-contained + honest + accessible:** inline-SVG charts (applications-by-status, count tiles + sparklines reusing `Spark`, audit-activity, census-by-city); design-token colors; `prefers-reduced-motion` respected; NO external chart lib / CDN / inline handlers; data from `/api/admin/stats` (honest counts + chain reads via a graceful try/catch → `chainAvailable:false`, NO non-existent `passportAvailable` call, never fabricated); the census chart is either LIVE-aggregated (`censusSource:"live"`) OR, if it uses `CityCensus.seededCount`, is labeled "SEEDED / demonstrative — not live census" in BOTH its title and its accessible text alternative (never presented as real citizen geography — `prisma/schema.prisma:189-192`); each chart has an accessible text alternative (C2).
- [ ] **ZERO regressions + budgets:** full gate green — `pnpm guard:secrets && pnpm format:check && pnpm typecheck && pnpm lint && pnpm test && pnpm test:integration && pnpm e2e && (cd contracts && forge test && forge snapshot --check && bash scripts/coverage-gate.sh) && pnpm build`; unit > 678, integration > 15, e2e ≥ 29, forge = 165; e2e registrations = 9 (< 10, the run proves it) (D1).
- [ ] **Docs updated:** README (Wave 10 Delivered + admin-mint override + CSV exports), ARCHITECTURE §11 (override path + off-chain-intent columns + export allowlist + infographics), MAINNET_HANDOFF (witness-free issuance caution + PII-in-exports + prod migration run-order), CHANGELOG 0.10.0 + version bump (D1).
- [ ] **Local-anvil-only:** nothing deployed/signed/funded on a real network by the assistant; the A6 proof signs only the anvil throwaway key in `test/integration/`; per-task commits carry the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.

---

## Notes for the implementer (traps — verified)

1. **`sendTransaction` is a FORBIDDEN substring (case-insensitive) in `test/no-admin-signing.test.ts`.** The CSV exporter, the export routes, and any new admin file must NOT contain it — use `download`/`export`/`csv`/`report` identifiers. Also avoid `writeContract`/`signMessage`/etc. Run the guard test after EVERY new admin file.
2. **`prepareAdminMint` stays PURE.** It takes already-encoded bytes32 args (from `lib/passport/attestation`) — it does NOT re-encode strings or read the chain. The `AlreadyCitizen` guard is a chain read → route/UI concern, not the encoder's. Mirror only the `ZeroAddress` require (pure) here.
3. **Byte-match the witnessed mint encoding.** Confirm MintFlow's seal payload's exact motto/domicile source + slice (`.slice(0,31)`) and which app field maps to which bytes32 BEFORE writing `buildAdminMintParams` — an admin-minted passport must decode identically to a witnessed one (`decodeBytes32String`). `nameHash = nameHashOf(app.name)`.
4. **Edit BOTH prisma schemas in the SAME commit.** `prisma/schema-drift.test.ts` goes red the moment one file diverges. Both migrations (sqlite + postgres) land in A1 too.
5. **Do NOT origin-gate GETs.** The stats endpoint + the three export GETs use `guardAdminGet` (requireAdmin + optional per-admin rateLimit) — no `isAllowedOrigin` (same-origin GETs may carry neither Origin nor Referer). Only the approve-mint POST is origin-gated (via `guardAdminMutation`).
6. **`__resetRateLimit()` in `beforeEach`** of the approve-mint + export route suites — they fire more authed requests than a limit allows across cases (the standing Wave-8/9 pattern).
7. **BigInt in JSON/CSV throws.** `AssetCatalogEntry` BigInts don't appear in these reports, but if any BigInt reaches `toCsv`/the stats payload, stringify it (the exporter coerces `bigint`→`String`; the stats route stringifies chain reads). `readTotalCitizensServer` returns `bigint` → `Number(...)` or `.toString()` before JSON.
8. **Chain reads in the stats/approve-mint routes must be graceful.** Wrap `readTotalCitizensServer`/`readHasPassportServer` in try/catch → `null`/`available:false`; never let an unregistered/unreachable chain 500 the route (the default test env is unregistered — the route tests assert `chainAvailable:false`).
9. **The export audit target.** Adding `"EXPORT"` to `AuditTargetType` + `AUDIT_FIELD_ALLOWLIST` touches `lib/admin/audit.ts` (env-neutral — safe) and the audit test (assert the new allowlist has no secret key). Keep the allowlist tiny (`kind`/`rowCount`/`requestedAt`).
10. **Charts are CSP-safe inline SVG.** No `<script>`, no external `<link>`/CDN, no inline `on*` attributes. Animation, if any, is CSS-class-driven and gated by `prefers-reduced-motion`. `role="img"` + `<title>`/`<desc>` + a visually-hidden data table is the accessible alternative — axe checks it.
11. **The admin e2e registration budget is HARD < 10 (currently 9).** All new e2e stations ride inside `e2e/admin-panel.spec.ts`'s existing DIRECT-prisma + `POST /api/auth/login` bootstrap — ADD ZERO registrations. Re-verify `/api/auth/login` is still POSTed by no other spec before relying on its limit.
12. **Responsive is mostly free but must be PROVEN.** The `≤760` shell rule collapses inline grids inside `.main`; C1's value is the 390px no-overflow e2e assertion + fixing what the rule misses (long mono addresses → `overflowWrap:"anywhere"`; wide tables/charts → `overflowX:"auto"` wrappers). Do not assume — assert `scrollWidth <= innerWidth + 1`.
13. **Approval is an EVENT, not a toggle.** Re-approving updates `adminApprovedAt`/`adminApprovedBy` and writes a fresh audit row (unlike grant-admin's short-circuit). An already-citizen `to` is flagged (`alreadyCitizen:true`) so the UI can warn `adminMint` would revert — but the route still records the approval intent honestly.
14. **Prod is LIVE.** The two new columns are additive-nullable — safe for existing Neon rows with no backfill. The postgres migration ships in `prisma/postgres/migrations/` and is applied by `vercel-build`'s `prisma migrate deploy`; D1 documents running it against Neon before (or with) the deploy of the reading code.

---

## Post-review addenda (reviewer MINOR findings — honor during the build)

The adversarial review applied all 5 major findings above. Nine distinct **minor** findings remain; honor them during implementation:

1. **Self-mint for application-less admins:** an admin bootstrapped as a pure ADMIN user has NO CitizenshipApplication row, so the per-application approve path can't serve them. The composer "Admin mint" self-mint affordance must offer a "use MY verified address" fill that calls a server resolution of `resolveApplicantAddress(actor.user.id)` (e.g. returned by `/api/admin/chain/params` or a small guarded endpoint) — never rely purely on the admin typing their own address; if the admin has no verified LinkedWallet, show that reason.
2. **`.trim()` before `.slice(0,31)`:** `buildAdminMintParams` must encode `motto = toBytes32String(motto.trim().slice(0,31))` and `domicile = toBytes32String(city.trim().slice(0,31))` — byte-identical to the witnessed seal path in MintFlow. Add a RED case with padded whitespace.
3. **A5 obligation placement:** the existing obligations route pushes witness obligations BEFORE the chain-truth read and returns them unchanged for citizens. The new `admin-approved` obligation must be SUPPRESSED once `readPassportStatusServer` says citizen (and the witness obligation should be too, same branch) — place the push accordingly or filter before the citizen return.
4. **Checksum rule semantics:** `getAddress(input) === input` REJECTS valid all-lowercase addresses (viem checksums them without throwing). The composer's validity rule is `getAddress(input)` not throwing; normalize the displayed/encoded `to` to the checksummed form.
5. **Postgres migration generation:** `prisma migrate diff --from-migrations` needs `--shadow-database-url`. Either hand-author the two-statement ALTER TABLE migration for `prisma/postgres/migrations` (recommended — it's two ADD COLUMN lines) or provide a throwaway shadow Postgres. Verify by inspection + the drift test, and note the vercel-build `migrate deploy` picks it up on deploy.
6. **CitizenHomeApp gating:** the passport-rail pending state keys exclusively on `o.kind === "witness"`. Include `kind === "admin-approved"` in the pending computation and render branch (with its own copy), or the approved state silently falls back to the "Mint your passport" CTA.
7. **Visually-hidden pattern:** define the sr-only style once (inline style object is CSP-safe: absolute, 1px, clip, overflow hidden) in `components/admin/bits.tsx` and use it for every chart's accessible data table — none exists in the repo today.
8. **A5 test path:** the obligations tests live at `app/api/citizen/obligations/route.test.ts` (not `test/`) — target that file.
9. **Export route shape decided:** route at `/api/admin/export/{users,applications,audit}` (no `.csv` in the path; filename via `Content-Disposition`), and B3 hrefs use exactly those paths.
