# Changelog

Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
`0.8.0` is the first versioned release — Waves 1–7 shipped without version
numbers on the same branch line and are recorded below as dated development
history (dates are the real commit dates from the git trail).

## [0.11.0] — 2026-07-03 (Wave 11 — Wallet modes: import · hardware · watch-only air-gapped)

The wallet becomes a three-mode chooser (persisted, non-custodial in every
mode) and the air-gapped signing loop closes entirely inside the product.
Full gate at this release: **876 unit / 18 integration (local
anvil) / 37 e2e (9 registrations, budget < 10) / 165 forge**, plus
`forge snapshot --check`, the coverage gate, `guard:secrets`, and a green
production build.

- **Import (A1/A2):** `importWallet` — normalize → `validateMnemonic` BEFORE
  any derivation (invalid → no vault written) → the exact create path;
  overwriting an existing vault requires an explicit confirmed checkbox. The
  mode chooser (embedded | hardware | watch-only) persists in the wallet
  IndexedDB `meta` store (DB v2); an existing vault user is never blocked;
  the three legacy wallet e2e specs pass THROUGH the chooser.
- **Hardware/external (B1/B2):** `sendEvmExternal` (native `sendTransaction`,
  ERC-20 `writeContract` — the wallet's OWN signer); the panel connects
  (injected + WalletConnect), shows live balances, enforces a correct-chain
  switch guard, and degrades honestly (no connector / rejection / revert).
  Direct Ledger WebHID = documented deferral.
- **Watch-only + air-gapped (C1–C5):** checksum-validated watched address →
  read-only portfolio under a WATCH-ONLY badge; SEND builds an UNSIGNED
  EIP-1559 envelope (versioned self-contained QR format, EC-L cap 2953 bytes
  guarded BEFORE render; BC-UR multi-part = follow-up) → the offline signer
  (embedded wallet, "scan a request to sign") decodes it HONESTLY — ERC-20
  recipient + amount from transfer calldata, token contract surfaced, never
  the raw token-contract `to`/`0` value — signs locally and NEVER broadcasts
  → the watch-only device scans the signed QR and relays via the allow-listed
  `eth_sendRawTransaction` proxy; "sent" only on a confirmed receipt. Camera
  scanning is bundled pure-JS `jsqr` (tap-to-scan, manual-paste fallback,
  track cleanup, ZERO CSP change).
- **Custody boundary, proven three ways:** a TRANSITIVE static guard
  (`boundary.test.ts` — build/broadcast import no signer symbol, no embedded
  module, and NOT `services/send` which transitively pulls the signer; the
  shared tx-encoding moved to signer-free `services/call.ts`); a runtime
  zero-fetch spy on the signer; and an anvil end-to-end proof
  (`airgapped-e2e.test.ts` — the APP builds + broadcasts, only the TEST's
  throwaway key signs, recipient balance moves, forbidden RPC methods never
  appear). `no-secret-to-fetch` extended: QR payloads AND fetch bodies are
  secret-free across the loop.
- **Wallet verification for existing accounts:** `POST /api/wallet/link` —
  SIWE-proven key possession binds a wallet to the LOGGED-IN account (409 on
  another account's wallet); "Citizenship wallet → Verify this wallet" card
  signs locally with the embedded vault. Closes the gap where
  email-registered users could never satisfy `resolveApplicantAddress`
  (witness requests AND the Wave-10 admin-mint override dead-ended).
- **e2e:** new `wallet-modes.spec.ts` (5 stations, login-bootstrapped, ZERO
  new registrations — total stays 9) incl. the camera permission-denied →
  paste fallback and an axe contrast fix on the WATCH-ONLY badge.
- **Deferred (documented):** BC-UR/Keystone interop, Ledger WebHID,
  Solana/BTC watch-only.

## [0.10.0] — 2026-07-03 (Wave 10 — Admin enhancements; live at cryptrepublic.com)

Two threads since 0.9.0: the site went **live in production** at
[https://cryptrepublic.com](https://cryptrepublic.com) (Vercel + Neon
Postgres, testnet profile), and Wave 10 shipped the admin enhancements —
witness-free admin-mint override (PREPARED-only), field-allowlisted CSV
report exports, clickable/responsive dashboard tiles, and honest inline-SVG
infographics. Full gate at this release: **799 unit / 16 integration (local
anvil) / 32 e2e (9 registrations, budget < 10) / 165 forge**, plus
`forge snapshot --check`, the coverage gate, `guard:secrets`, and a green
production build.

### Wave 10 Group A — admin-mint override (witness-free, PREPARED-only)

- **Schema (A1):** additive-nullable `adminApprovedAt`/`adminApprovedBy` on
  `CitizenshipApplication` in BOTH schemas (sqlite + postgres migrations are
  `ADD COLUMN` only; drift guard green); `AUDIT_FIELD_ALLOWLIST.APPLICATION`
  extended.
- **Pure encoder (A2):** `prepareAdminMint` encodes
  `adminMint(to, nameHash, motto, domicile)` (`PASSPORT_ADMIN_ROLE`, ZERO
  witnesses) into the standard `PreparedBatch` — the panel NEVER signs
  (static guard `test/no-admin-signing.test.ts` still green).
- **Approve route (A3):** `POST /api/admin/applications/[id]/approve-mint`
  records OFF-CHAIN INTENT only + returns server-resolved mint params; the
  `to` is the applicant's live verified `LinkedWallet`
  (`buildAdminMintParams`), never client-supplied and never the stale
  `applicantAddress` snapshot; no verified wallet → 400; `.strict()`
  empty-body schema rejects chain-cache fields; audited as
  `application.approve_mint` in the same `$transaction`; re-approval is a
  fresh audited event; motto/domicile encode byte-identically to the
  witnessed seal path (`.trim().slice(0,31)`).
- **Admin UI (A4):** ApplicationDetail "Approve & mint (override witnesses)"
  gated on the live resolved destination; generic Chain-Actions "Admin mint"
  composer with checksum validation (`getAddress`), a verify-off-chain
  warning, and a self-mint "use MY verified address" fill that also serves
  application-less admins.
- **Applicant reflection (A5):** obligations + mint flow + home rail show "an
  administrator has approved your application; your passport is being issued
  by the Republic" — chain-truth gated (suppressed the moment
  `readHasPassport` says citizen; approval is never presented as
  citizenship).
- **Anvil proof (A6):** `test/integration/admin-mint-e2e.test.ts` mints a
  ZERO-witness passport from the prepared calldata on local anvil (the TEST
  signs with a throwaway anvil PASSPORT_ADMIN key; panel code never signs);
  e2e station 8 proves the approve→prepared-card flow over the wire.

### Wave 10 Group B — CSV report exports

- **Exporter (B1):** `lib/admin/csv.ts` `toCsv` — explicit per-report column
  allowlists (users / applications / audit), RFC-4180 quoting, formula-
  injection neutralization (leading `= + - @`, TAB, CR); `passwordHash`/
  `tokenHash` are in NO column set.
- **Routes (B2):** `GET /api/admin/export/{users,applications,audit}` —
  `guardAdminGet` + per-admin 10/5min rate limit, `text/csv` with dated
  `Content-Disposition`, audited as `admin.export.<kind>` (targetType
  `EXPORT`, allowlist kind/rowCount/requestedAt).
- **UI (B3):** keyboard-focusable download buttons on Users / Applications /
  Audit screens.

### Wave 10 Group C — dashboard UX + infographics

- **Clickable tiles (C1):** the four Overview stat pillars are real
  keyboard-focusable `next/link` anchors (aria-labelled) →
  `/admin/{users,applications,content,flags}`; admin screens proven
  overflow-free at 390px by e2e (long mono values wrap; the shared `Ledger`
  scroll wrapper is now a focusable labeled region — fixes a serious axe
  `scrollable-region-focusable` at mobile width app-wide); axe zero
  critical/serious on `/admin` at desktop AND 390x844.
- **Infographics (C2):** `GET /api/admin/stats` (honest series:
  applications-by-status in order, DB users/embassies counts, chain-derived
  citizens via graceful try/catch → `citizens:null` + `chainAvailable:false`
  when unreadable — never fabricated, never a 500; 14-day audit-activity
  buckets with empty days as 0; census from `CityCensus.seededCount` with
  `censusSource:"seeded"`). Self-contained inline-SVG charts (BarChart /
  CountTile+Spark / ActivitySeries) — no chart lib, no CDN, no scripts, no
  inline handlers, CSP- and reduced-motion-safe — each with `role="img"` +
  `<title>`/`<desc>` + a visually-hidden data `<table>`; the census chart is
  labeled "SEEDED — demonstrative, not live census" visibly AND in the
  accessible alternative.

### Production hosting (post-0.9.0 line — live at cryptrepublic.com)

- **Deployed:** Vercel project + Neon Postgres integration; apex and www on
  Vercel nameservers; `vercel.json` pins `framework: "nextjs"`; Next.js
  15.1.0 → **15.5.20** (Vercel blocks known-CVE versions).
- **CSRF fix:** `isAllowedOrigin` accepts the `www.` twin of
  `NEXT_PUBLIC_APP_URL` + a permanent `www → apex` redirect — fixes all
  mutations 403ing from `www.cryptrepublic.com` ("Could not save your
  attestation").
- **Mint resume:** the mint flow resumes an in-flight application at its
  status-implied step (prefilled, back-locked, never rotates a live witness
  nonce); the dashboard shows witness-pending/waiting states; re-mint is
  blocked while an application is in flight.
- **Ops:** `.env.local` shadowing trap documented (Neon provisioning wrote
  prod `DATABASE_URL` into `.env.local`, breaking local e2e); jay@bitwill.com
  granted ADMIN in production via the audited `pnpm admin:grant` CLI.

### Vercel hosting preparation (`feat/vercel-hosting`, merged pre-deploy)

- **Dual Prisma schemas:** mirrored `prisma/postgres/schema.prisma`
  (`postgresql` provider + `directUrl` for pooled Neon) with its own
  postgres-dialect init migration (generated via
  `prisma migrate diff --from-empty`, no live DB needed). A RED-first drift
  guard (`prisma/schema-drift.test.ts`) asserts the two datamodels stay
  IDENTICAL. `guard:secrets` now sweeps both schema files.
- **Build wiring:** `vercel-build` script (Postgres client generate →
  idempotent `migrate deploy` → `next build`); ordering pinned by
  `test/deploy-scripts.test.ts`. No `vercel.json` (framework autodetection
  suffices). Serverless compatibility verified: no runtime fs usage,
  Edge-safe middleware; per-instance rate-limiter caveat documented.
- **Docs:** [docs/DEPLOY_VERCEL.md](docs/DEPLOY_VERCEL.md) operator runbook
  (Neon Postgres, env vars, deploy commands, one-time seed/admin bootstrap
  against the remote DB, cryptrepublic.com DNS at Namecheap, honest caveats);
  ENV_REFERENCE (`DATABASE_URL_UNPOOLED`, Vercel section), README Hosting
  section, ARCHITECTURE §1/§7 dual-schema notes, `.env.mainnet.example`.
- **Honesty unchanged:** hosted site is the testnet profile; on-chain screens
  keep their graceful "not deployed" states until contracts land on Base
  Sepolia (USER step); Postgres-in-CI remains a documented deferral.

## [0.9.0] — 2026-07-02 (Wave 9 — Admin panel, the capstone)

Non-custodial admin back office. Full gate at this release: **665 unit / 15
integration (local anvil) / 29 e2e (9 registrations per run) / 165 forge**,
plus `forge snapshot --check`, the coverage gate, and a green production
build. The same three spec-row items remain **OPEN (USER)** as at 0.8.0
(runbook testnet dry-run, burn-in started, release tag cut).

### Group A — Foundation

- Schema: `User.role` (`USER|ADMIN`, default `USER`), `User.suspendedAt`
  (distinct from the login lockout), `CitizenshipApplication.reviewNote`,
  `AuditLog`, `FeatureFlag` — all public data, `pnpm guard:secrets` green.
- `requireAdmin` guard; the suspend choke point in `validateSessionToken`
  plus generic-401 rejections at BOTH session-creating login paths (password
  and SIWE verify) — no suspension oracle.
- `scripts/grant-admin.ts` (`pnpm admin:grant <email>` / `--revoke`) — the
  ONLY role-change path (no promotion API), audited as `cli`; a real-tsx
  subprocess smoke test guards its import graph.
- `lib/admin/audit.ts`: `writeAudit(tx, …)` in the SAME transaction as every
  mutation, per-targetType serializer allowlist (`passwordHash`/`tokenHash`
  provably never serialized; BigInt-safe).
- Admin chain layer (`lib/admin/{abis,roles,prepare,serverReads}`): pure
  validated encoders → `{to, value, data, chainId, decoded}` + 2-tx pull
  batches + governance-proposal payloads + Safe Transaction Builder JSON;
  role topology from `RoleGranted` logs confirmed via `hasRole`;
  `test/no-admin-signing.test.ts` statically enforces the never-signs
  boundary (forbidden tokens + import boundary).

### Group B — API

- `/api/admin/*` routes (27): overview, audit list, users
  (list/detail/suspend/kyc/session-revoke), applications (list/detail/review
  — off-chain-honest: `status`/`citizenTokenId`/`sealTxHash` are 400 by
  strictness), content CRUD for the 6 seeded groups + comment moderation
  (deleted body preserved in `beforeJson`), flags CRUD, chain params/roles
  (graceful `available:false` on the unregistered default env). Wave-8 guard
  stack verbatim on every mutation; session revoke binds ownership (404 on a
  foreign sessionId).
- Honesty guards: fabricated-provenance regex 400, allocation-sum ≤ 10000
  mirror, proposal body immutable once `descriptionHash` is set.
- Public `GET /api/flags` (`Cache-Control: no-store`, never throws) +
  `lib/flags` declared-default helpers.

### Group C — UI

- `/admin` route group with a server layout guard (unauthenticated → `/auth`,
  non-admin → `/dashboard`) and a thin `AdminShell` (no citizen/wallet
  polling): Overview, Users, Applications, Content (tabbed CRUD), Flags,
  Chain actions, Audit viewer — Wave-7 state matrix + Wave-8 a11y patterns.
- Chain actions: per-contract params, hasRole-confirmed role topology, the
  prepared-tx composer with inline contract-require mirrors, required-role
  annotations, and `PreparedActionCard` ("PREPARED FOR YOUR SAFE — THIS PANEL
  NEVER SIGNS"; proposal payloads get the governance-payload variant and no
  Safe JSON).
- The ONE flag consumer: `population_world_map` (default true) gating the
  population world-map card; `dashboard-screens` stubs `/api/flags` for
  parallel-worker determinism.

### Group D — Verification + docs

- `test/integration/admin-prepared-e2e.test.ts`: prepared calldata proven
  byte-correct on local anvil — grant/revoke flip `hasRole`, setApr lands,
  the approve+openEpoch batch opens epoch 1 with the exact `perCitizen`, the
  Safe JSON is byte-faithful, and the disburse proposal payload executes
  end-to-end (citizen propose → vote → warp → execute moves the treasury;
  non-citizen propose reverts). The TEST signs with anvil throwaway keys —
  panel code never.
- `e2e/admin-panel.spec.ts`: 7 stations, ZERO registrations (budget stays
  9/run) — guard redirects + API 401/403, suspend kills the live session
  over the wire, content edit + audit afterJson, the live flag flip, the
  stubbed composer producing byte-exact calldata + the graceful unregistered
  state, axe zero critical/serious on the admin screens.
- Docs: README (wave row 9 Delivered + admin section + refreshed matrix),
  ARCHITECTURE §11 (role model, audit + the prepared-calldata audit
  exclusion, flags, prepared-tx model, getLogs `deployBlock` note),
  MAINNET_HANDOFF (panel-prepares-Safe-txs + grant-admin bootstrap runbook +
  prepared-calldata-not-audited note). Version 0.9.0 (tagging stays a USER
  step).

## [0.8.0] — 2026-07-02 (Wave 8 — Polish + Tests + Docs + Mainnet Runbook)

Assistant-scope close-out for the user's mainnet handoff. Full gate at this
release: **398 unit / 11 integration (local anvil) / 22 e2e (9 registrations
per run) / 165 forge**, plus `forge snapshot --check`, the coverage gate, and
a green production build. Three spec-row items remain **OPEN (USER)** by
design: runbook testnet dry-run, burn-in started, release tag cut.

### Group A — UX polish

- Responsive pass, CSS-only: one deliberate ≤760 grid-collapse mechanism with
  a `data-grid="row"` exemption for table-row grids, embassy cards 3→2→1
  column step, Topbar padding moved into the CSS module, marketing home ≤640
  brought to `Mobile.html` intent (hero/section clamps placed after the
  retheme cascade, stacked CTAs, 88vw passport). No JS redirects, no separate
  mobile pages.
- A11y with automated evidence: Modal focus capture/restore in a mount-only
  effect + `aria-labelledby` (12s-poll focus-theft regression-tested); global
  `:focus-visible`; `<main>` landmarks on the marketing home and `/wallet`;
  `prefers-reduced-motion` honored by `LiveNumber` (null-safe JS guard) and
  `SealingAnimation`; measured contrast fixes (Topbar chain status, auth
  wallet tiles) at the usage level — token definitions untouched; axe smoke
  (`e2e/a11y.spec.ts`) at a documented zero-critical/zero-serious threshold.
- Per-route First Load JS **no-regress perf budget** measured and committed
  (now in `docs/ARCHITECTURE.md` §9); optional optimizations deferred with
  numbers recorded.
- Error/empty/loading hardening: `app/error.tsx`, `app/not-found.tsx`,
  `app/dashboard/error.tsx` (in-voice copy, `reset()` retry), AuthForm busy
  indicator, empty-copy audit.

### Group B — Hardening + CI gates

- Production-only HSTS (`max-age=31536000; includeSubDomains`, **no
  `preload`** — a USER decision documented in `docs/MAINNET_HANDOFF.md`);
  CSP/nonce untouched.
- Per-user rate limits on the two previously unlimited Wave-7 mutation
  routes: governance comments 10/5min, embassy proposals 5/15min (429 +
  `Retry-After`, per-user keys).
- Foundry coverage gate (`contracts/scripts/coverage-gate.sh`): ≥95% lines on
  every `src/*.sol` with two pinned no-regress exceptions (CryptToken ≥86.67,
  CryptGovernance ≥98.82 — `--ir-minimum` instrumentation artifacts) and
  per-file no-regress **branch** floors pinned from the 2026-07-02 run (the
  spec's ≥90% branch half, decided explicitly; see
  `contracts/audit/triage.md`). `forge snapshot --check` made deterministic
  via a pinned fuzz seed paired with a pinned CI toolchain version.

### Group C — Test suites + honest release gate

- `e2e/critical-path.spec.ts` (`@critical`, one registration): the UI-side
  §8.1 chain — register → vault → attest/oath/witness gate → send-confirm →
  vote gating → claim gating → passport view — with axe and 390×844 stations.
- The **honest release-gate split** documented everywhere it matters:
  `pnpm e2e:critical` + `pnpm test:integration` together are the gate; the
  on-chain seal/vote/claim proofs live in the three anvil suites; both halves
  are LOCAL/STUBBED only; live Base Sepolia execution is a USER step.
- `e2e/mobile-smoke.spec.ts`: home + auth at 390×844, zero registrations;
  full-run register budget = 9 (< the 10/15min limit), documented in every
  spec header.

### Group D — Docs + release prep

- `README.md`, `docs/ARCHITECTURE.md` (app structure, the single
  `NEXT_PUBLIC_CHAIN_ENV` switch, address-registry flow, RPC-proxy model,
  non-custodial write path, testing strategy, perf budget),
  `docs/ENV_REFERENCE.md` (every env var from a full `process.env` sweep,
  incl. the `APP_URL` CSRF fallback; chain-swap procedure).
- `.env.mainnet.example` (placeholders only; never a key in a repo file) and
  a real `.env*` gitignore glob with template negations — verified in both
  directions; `contracts/docs/DEPLOY_RUNBOOK.md` stale references fixed
  (step 2 template, step 6 + testnet section now target
  `CONTRACTS[chainId]` in `config/contracts.ts`).
- `docs/MAINNET_HANDOFF.md`: the consolidated USER runbook — 8 steps with
  exact commands, rollback/pause plan, key-custody + incident-response
  runbook (drafted for user adoption), ≥4-week burn-in plan with P0/P1
  triage and the explicit LOCAL-suites-are-not-burn-in-evidence statement,
  HSTS-preload decision, and the **Pre-Mainnet Gate with honest statuses**
  (audit/burn-in/bounty/legal OPEN — USER; suite-green + static-analysis
  evidenced; custody + frozen-config drafted/templated, open until adopted).
- `docs/LEGAL_FLAGS_REFERENCE.md`: all 9 `// LEGAL:` contract markers quoted
  verbatim + the in-UI dividend note, mapped to the seven spec-§10.1 risks
  and the Gate items that clear them, with a mechanical completeness check.
- `version: 0.8.0`; this changelog; full-gate close-out run recorded in the
  close-out commit body.

## Wave 7 — 2026-07-01 (Remaining dashboard screens)

Dashboard shell (sidebar, topbar, mobile drawer, session/citizen context)
plus six screens wired to real contracts and Prisma-served content: citizen
home, governance with on-chain `castVote` (passport-gated, weight 1),
read-only treasury, sovereign holdings with on-chain dividend claim and the
visible LEGAL note, population/census with live `totalCitizens`, and
embassies with the gated propose flow. Zod-strict mutation routes verify
citizenship on-chain; no hardcoded mock data remains on any screen (seeded
content is visibly tagged). Governance-vote + dividend-claim (incl.
no-double-claim) proven on local anvil; dashboard screen-state e2e added.
Close-out gate: 378 unit / 11 integration / 11 e2e / 165 forge.

## Wave 6 — 2026-07-01 (Wallet & Chain screen)

The full wallet screen on real chain data: portfolio aggregator + token list,
honest chain stats, SEND with a two-phase explicit confirm, RECEIVE with a
checksummed address + QR, STAKE/UNSTAKE/CLAIM against `CryptStaking`
(exact-amount approve, TOCTOU-safe ordering), SWAP/BRIDGE as a clearly
flagged testnet mock, the passport SBT card, and an activity ledger. Staking
and $CRYPT send proven on local anvil; wallet screen-state e2e added.

## Wave 5 — 2026-07-01 (Citizenship + mint)

Citizenship application state machine and the 4-step mint (Attest → Oath →
Witnesses → Seal) wired end-to-end to the soulbound passport contract:
EIP-712 attestation builder matching the frozen contract digest, witness
signing surface, applicant-binding + stale-signature/nonce guards, and an
embedded-wallet mint path that signs locally and broadcasts raw (never
`eth_sendTransaction`). Contract address registry, local-anvil emit script,
and the `local` chain profile. Real SBT mint proven in a local-anvil
integration test; register→mint e2e added.

## Wave 4 — 2026-07-01 (Smart contracts)

The six-contract Foundry suite — `CryptToken` (capped, permit, pausable),
soulbound `CryptRepublicPassport` with EIP-712 witness attestation,
`CryptGovernance` (one-citizen-one-vote, execution timelock),
`CryptTreasury` (governance-gated disbursement), `DividendDistributor`
(equal per-citizen epochs, no double-claim), `CryptStaking` (prospective
APR, solvency-bounded) — with unit + fuzz + invariant tests, deploy/
configure/seed scripts, and the slither/solhint/coverage triage
(`contracts/audit/triage.md`). **Deploy boundary:** assistant scope ended at
a local anvil deploy/configure/seed dry-run; Base Sepolia and mainnet
deploys are documented USER steps (`contracts/docs/DEPLOY_RUNBOOK.md`) —
no live network was touched.

## Wave 3 — 2026-07-01 (Wallets + multichain)

Non-custodial embedded wallet: BIP-39 generation, HD derivation
(EVM/Solana/BTC) against published vectors, Argon2id/PBKDF2 KDF +
AES-256-GCM vault in IndexedDB, unlock/auto-lock lifecycle, and an enforced
client-only boundary (ESLint rule + guards) so key material cannot reach
server code. Chain/token registries, keyed server-only RPC/history proxies,
multichain balance reads + tx history, EVM/Solana send + QR receive, a
flagged swap testnet-mock, external connect (wagmi: MetaMask/WalletConnect)
with SIWE, and the CSP/security-header middleware.

## Wave 2 — 2026-07-01 (Auth + DB)

Email + passphrase auth with Argon2id, opaque DB-backed httpOnly sessions,
per-account lockout, in-memory rate limits, and two-layer CSRF (SameSite +
Origin allowlist); SIWE with server-issued single-use nonces; register/
login/logout/session routes with enumeration resistance; the citizenship
application API; the Auth screen ported and wired; register→logout→login
e2e.

## Wave 1 — 2026-07-01 (Scaffold + design system)

Next.js (App Router) + TypeScript scaffold with Prisma (SQLite dev) and the
no-secret-columns CI guard; the design-token system (Archivo + IBM Plex
Mono, navy/blue/gold/paper, radius 0, uppercase headings, mono data labels)
and UI primitives; the marketing home ported from `Home.html` to real
components with a Playwright smoke; CI skeletons for web/foundry/e2e.

---

**Release tagging (USER step, post-merge):** after merging to `main`, the
user cuts the release tag:

```bash
git checkout main && git pull && git tag -a v0.8.0 -m "CryptRepublic v0.8.0 — Wave 8 close-out" && git push origin v0.8.0
```

The assistant does not tag or push tags.
