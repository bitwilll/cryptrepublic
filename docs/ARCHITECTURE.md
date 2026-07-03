# CryptRepublic — Architecture

How the app is put together, and the handful of load-bearing mechanisms every
contributor and operator must understand. Companion docs:
[ENV_REFERENCE.md](ENV_REFERENCE.md) (every env var),
[MAINNET_HANDOFF.md](MAINNET_HANDOFF.md) (USER mainnet runbook),
[../contracts/docs/DEPLOY_RUNBOOK.md](../contracts/docs/DEPLOY_RUNBOOK.md)
(contract deploy detail).

## 1. App structure

Next.js App Router with **server pages → client islands**:

- `app/` — routes. Server components fetch/frame; interactive screens are
  `"use client"` islands (`components/*/*App.tsx`) mounted by thin pages.
  `app/dashboard/layout.tsx` wraps every dashboard route in the shell
  (`components/shell/DashboardShell.tsx` — sidebar, topbar, mobile drawer,
  session/citizen context) behind the auth guard.
- `app/api/` — route handlers: auth (register/login/logout/session/SIWE),
  citizenship application + mint (attest/oath/witnesses/seal), dashboard
  content (governance comments, embassies, census, catalogs), and the proxies
  (`/api/rpc/[chain]`, `/api/rpc/solana`, `/api/history/[chain]`).
- `components/` — client islands + shared UI primitives (`components/ui/` —
  Modal, Ledger, TxButton, Spark, LiveNumber…).
- `lib/` — the logic layer, split by trust boundary:
  - **client-only** wallet code (`lib/wallet/**` — vault crypto, HD derivation,
    signing, services) imports `"client-only"` and is additionally fenced by an
    ESLint boundary rule + runtime guards so key material can never be imported
    into server code;
  - **server-only** code (`lib/auth/**`, `lib/db.ts`, `lib/rpc/allowlist.ts`)
    imports `"server-only"`;
  - per-contract read layers ship in pairs: a browser client (`client.ts`, via
    the RPC proxy) and `serverReads.ts` (direct keyed RPC on the server) — see
    `lib/governance/`, `lib/treasury/`, `lib/dividends/`, `lib/passport/`.
- `config/` — the typed registries (chains, contracts, tokens). **Nothing else
  in the app may hardcode a chainId, RPC URL, or contract address.**
- `contracts/` — the Foundry workspace (six contracts + EIP-712 witness lib,
  tests, deploy/configure/seed scripts, audit triage).
- `prisma/` — schema, migrations, seed (SQLite in dev), plus the mirrored
  Postgres deployment target `prisma/postgres/` (schema + own migrations) used
  by the Vercel build — held identical to the dev schema by
  `prisma/schema-drift.test.ts` (§7, [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md)).
- `e2e/`, `test/integration/` — Playwright and local-anvil suites (§7).

## 2. The single chain switch: `NEXT_PUBLIC_CHAIN_ENV`

`lib/config/chain.ts` resolves `NEXT_PUBLIC_CHAIN_ENV` to one of three profiles
(`testnet` default, `mainnet`, `local`), and `config/chains.config.ts` keys the
entire chain registry on it: chainIds, viem chains, explorer bases, and the
**name of the server-only env var** holding each chain's keyed RPC
(`serverRpcEnv`). Flipping environments is exactly one variable:

- `testnet` → Base Sepolia primary (84532) + Sepolia/Arb-Sepolia/OP-Sepolia/Amoy,
  Solana devnet;
- `mainnet` → Base primary (8453) + Ethereum/Arbitrum/Optimism/Polygon, Solana
  mainnet-beta;
- `local` → chainId 31337 (anvil) — used by the integration suites so the app's
  REAL read/broadcast path runs against a throwaway local node.

Because `NEXT_PUBLIC_*` values are inlined at **build time**, a chain swap
requires a rebuild (see [ENV_REFERENCE.md](ENV_REFERENCE.md) §chain-swap).

## 3. Address-registry flow

`config/contracts.ts` is the only place a CryptRepublic contract address lives:
`CONTRACTS[chainId]` entries for 31337 / 84532 / 8453.

- **Local:** after a local `Deploy.s.sol` broadcast,
  `scripts/emit-contract-addresses.mjs` parses
  `contracts/broadcast/Deploy.s.sol/<chainId>/run-latest.json` and rewrites
  `CONTRACTS[31337]` in place. The script is **LOCAL ANVIL ONLY** by design.
- **Testnet/mainnet:** the USER pastes verified addresses into
  `CONTRACTS[84532]` / `CONTRACTS[8453]` after their own deploy
  (see [MAINNET_HANDOFF.md](MAINNET_HANDOFF.md) step 6).
- **Consumption:** throwing accessors (`passportAddress`, `governanceAddress`, …)
  for code paths that require the contract, plus **non-throwing probes**
  (`governanceAvailable`, `treasuryAvailable`, `distributorAvailable`,
  `stakingAvailable`) that every UI card checks first — an unregistered chain
  renders an honest empty/unavailable state instead of crashing. This graceful
  degradation is test-asserted (e2e dashboard screen-state specs run on the
  unregistered default 84532).

## 4. RPC-proxy model (why keys never reach the client)

The browser **never** talks to an RPC provider directly:

1. Browser reads go to `/api/rpc/[chain]` (EVM) or `/api/rpc/solana` — the
   route validates the JSON-RPC body against a read-only **method allowlist**
   (`lib/rpc/allowlist.ts`; `eth_sendTransaction` is rejected — only
   `eth_sendRawTransaction` of a client-signed payload passes), then forwards to
   the keyed server RPC named by the registry's `serverRpcEnv`
   (`RPC_BASE_SEPOLIA`, `RPC_BASE`, …). Keyed URLs are server-only env vars and
   are never logged.
2. `publicFallbackRpc` in the chain registry is deliberately the **relative
   proxy path** (`/api/rpc/<chainId>`), so the CSP `connect-src 'self'`
   genuinely covers every browser RPC read; the only extra `connect-src`
   origins are WalletConnect's (for the external-wallet transport).
3. Tx history rides the same pattern via `/api/history/[chain]`
   (Etherscan v2, `ETHERSCAN_API_KEY` server-only).

## 5. Non-custodial write path (FROZEN pattern)

The embedded wallet is a BIP-39 vault encrypted client-side (AES-256-GCM under
an Argon2id/PBKDF2 KDF) and stored in IndexedDB; the passphrase never leaves
the browser and the server has **no signing key of any kind, anywhere, by
design** (CI enforces no secret columns via `pnpm guard:secrets`).

Every on-chain write follows the same frozen shape (canonical example:
`lib/wallet/services/staking.ts`; the mint/governance/dividend writes mirror it):

> simulate/estimate via `publicClientFor(chainId)` (→ `/api/rpc/<id>`) → build
> an EIP-1559 tx → **sign locally** with the unlocked embedded account
> (`withEvmSigner`) → broadcast the RAW signed tx through the proxy — never
> `eth_sendTransaction`, never `writeContract` on the embedded path (the
> allowlist rejects them).

External wallets (wagmi/viem: MetaMask, WalletConnect) sign in the user's own
extension/app; the SIWE handshake binds them to the session. Either way the
server only ever sees read requests and broadcast-ready payloads.

## 6. Auth & session model

- **Passwords:** Argon2id only (tuned, salted); enumeration-resistant responses;
  DB-backed per-account lockout (`lib/auth/lockout.ts`).
- **Sessions:** opaque random tokens in httpOnly + SameSite=Lax (+ Secure in
  prod) cookies, stored server-side (revocable) — no JWTs.
- **SIWE (EIP-4361):** server-issued single-use nonce, domain/chainId/expiry
  bound, verified server-side.
- **CSRF:** two layers — SameSite=Lax cookies + an Origin/Referer allowlist
  check (`lib/auth/csrf.ts`) on every state-changing route.
- **Rate limits:** in-memory `lib/auth/ratelimit.ts` — register 10/15min/IP,
  login + SIWE-verify 20/15min/IP, governance comments 10/5min/user,
  embassy proposals 5/15min/user. **Caveat (documented in the module header):**
  the limiter is process-local — DEV/single-instance only; a multi-instance
  deployment must swap in a shared store (Redis-class) first. The DB-backed
  lockout is the durable second layer.

## 7. Data honesty split (chain vs DB)

- **Trustless facts come from the chain, never the DB:** citizenship
  (passport ownership), vote tallies and proposal state, treasury reserves,
  dividend epochs/claims, staking positions, balances, tx history.
- **Off-chain-by-nature content comes from Prisma:** users/sessions,
  citizenship applications + witness signatures (pre-chain workflow), asset
  catalog, embassies directory, census profiles, constitution text, proposal
  comments. Seeded/demonstrative data always renders behind visible
  `SEEDED`/`SIMULATED`/`TESTNET` tags.
- **DB engines — dual Prisma schemas:** SQLite for dev/CI
  (`prisma/schema.prisma`, authoritative); Postgres for the Vercel production
  deploy via the mirrored `prisma/postgres/schema.prisma` + its own
  postgres-dialect migrations. The generated client comes from whichever
  schema `prisma generate` last ran (Vercel's `vercel-build` generates from
  the Postgres one), so `prisma/schema-drift.test.ts` asserts the two
  datamodels are IDENTICAL — a schema edit that touches only one file fails
  the unit suite. **Postgres-in-CI remains a documented DEFERRAL** — no CI
  lane runs queries against a real Postgres yet ([DEPLOY_VERCEL.md](DEPLOY_VERCEL.md)
  caveat 4); stand up the Postgres CI lane before mainnet.

## 8. Testing strategy & the honest release gate

| Suite | Where | What it proves |
| --- | --- | --- |
| Vitest unit (398) | `**/*.test.ts(x)` | crypto round-trips, HD vectors, API handlers on disposable SQLite, components (jsdom) |
| Integration (11) | `test/integration/` | the app's REAL write path against a throwaway local anvil: passport seal/mint; funded $CRYPT send + staking; governance castVote + dividend claim/no-double-claim |
| Playwright e2e (22) | `e2e/` | browser flows on a prod build with deterministic stubbed reads; a11y (axe) smoke; mobile smoke |
| Foundry (165) | `contracts/test/` | contract unit + fuzz + invariant suites |

**The release gate is two commands, together:** `pnpm e2e:critical` (the
`@critical` browser spec — the UI-side chain of the spec-§8.1 critical path
with deterministic stubbed reads on the default testnet env) **and**
`pnpm test:integration` (the three anvil suites where the real on-chain proofs
live). The browser spec does not mint, send, vote, or claim on a real chain and
never claims to — a fresh default env has unregistered contracts, and
fabricating a full-on-chain browser pass would be dishonest. The two halves
together cover every §8.1 station on **LOCAL/STUBBED environments only**;
executing the chain on live Base Sepolia remains a **USER step** (deploy + fork
tests + burn-in per
[../contracts/docs/DEPLOY_RUNBOOK.md](../contracts/docs/DEPLOY_RUNBOOK.md) /
[MAINNET_HANDOFF.md](MAINNET_HANDOFF.md)).

**E2E register budget:** one full `pnpm e2e` run performs exactly **9**
registrations against the 10/15min register limit; every spec header carries
the ledger and any future spec must stay under 10.

**Contract gates:** `forge snapshot --check` is deterministic under a pinned
fuzz seed (`contracts/foundry.toml`) + a version-pinned CI toolchain
(`.github/workflows/foundry.yml` — seed and toolchain are a PAIR, bump
together). `contracts/scripts/coverage-gate.sh` enforces ≥95% lines on every
`src/*.sol` with two pinned no-regress exceptions (CryptToken ≥86.67%,
CryptGovernance ≥98.82% — `--ir-minimum` instrumentation artifacts, real
coverage ~100%) and resolves the spec-§8.1 “≥90% branch” half with **per-file
no-regress branch floors** pinned from the 2026-07-02 `--ir-minimum` run
(Governance 71.43, Passport 89.47, Staking 60.00, others 100.00; 0-branch files
n/a; unlisted future files get the 90% default) — the `--ir-minimum` pipeline
inflates branch denominators, so a flat 90% floor would only be reachable by
gaming the tool. Full analysis:
[../contracts/audit/triage.md](../contracts/audit/triage.md).

## 9. Performance budget (no-regress)

Per-route **First Load JS** baseline from the Wave 8 A2 `pnpm build`
(2026-07-02, commit `be8d944`). This table is the budget: **no route may exceed
its baseline** (new routes add a row at their first measured value). Verified by
re-running `pnpm build` at each wave close-out.

| Route                       | First Load JS budget |
| --------------------------- | -------------------- |
| `/`                         | 111 kB               |
| `/_not-found`               | 108 kB               |
| `/auth`                     | 383 kB               |
| `/dashboard`                | 314 kB               |
| `/dashboard/embassies`      | 333 kB               |
| `/dashboard/embassies/[code]` | 112 kB             |
| `/dashboard/governance`     | 318 kB               |
| `/dashboard/holdings`       | 317 kB               |
| `/dashboard/mint`           | 333 kB               |
| `/dashboard/passport`       | 331 kB               |
| `/dashboard/population`     | 202 kB               |
| `/dashboard/treasury`       | 316 kB               |
| `/dashboard/wallet`         | 342 kB               |
| `/dashboard/witness`        | 325 kB               |
| `/wallet`                   | 283 kB               |
| shared chunks (all routes)  | 107 kB               |
| middleware                  | 32.3 kB              |

Optional optimizations (modal code-splitting via `next/dynamic`, list
memoization) were **deferred with the measured numbers recorded** in the A2
commit body: no route exceeded its baseline, so no optimization was warranted.
No Lighthouse claims are made — no Lighthouse run has been performed.

## 10. Security posture (app)

- **CSP with per-request nonce** (`middleware.ts`): `default-src 'self'`;
  prod scripts are `'self' 'nonce-…' 'wasm-unsafe-eval'`; `connect-src 'self'`
  + WalletConnect origins only; `frame-ancestors 'none'`.
- **HSTS** (prod-only): `max-age=31536000; includeSubDomains` — **no
  `preload`**; submitting to the browser preload list is a USER decision
  documented in [MAINNET_HANDOFF.md](MAINNET_HANDOFF.md).
- `x-frame-options: DENY`, `referrer-policy: strict-origin-when-cross-origin`,
  `x-content-type-options: nosniff`.
- **No secret columns** in the DB schema, enforced in CI (`pnpm guard:secrets`);
  no seed/key/plaintext-password storage anywhere server-side.
- Zod validation (unknown fields rejected) on every route; mutating dashboard
  routes verify passport ownership **on-chain** — no client-trusted `isCitizen`.

## 11. Admin panel (Wave 9)

**Role model.** `User.role` is a String union `USER|ADMIN` (default `USER`).
`requireAdmin(req)` (`lib/auth/guard.ts`) extends `requireSession` and throws
`forbidden()` for non-admins; the `/admin` layout server-guards (no session →
`/auth`; non-admin → `/dashboard` — a redirect, not a 403 page, so the admin
surface is not advertised; the API layer returns the real 401/403s). **No API
sets or changes `role`** — not even an admin's (no promotion path, enforced by
strict schemas with explicit 400 tests). Bootstrap is the operator CLI
`pnpm admin:grant <email>` (`scripts/grant-admin.ts`, DB-access operator only,
audited with `actorLabel: "cli"`; `--revoke` demotes).

**Suspend.** `User.suspendedAt` is distinct from the login-lockout
`lockedUntil`. Suspending sets it and revokes every session in ONE
transaction; enforcement is a single choke point — `validateSessionToken`
returns `null` for suspended users (killing every guard and page at once) —
plus generic-401 rejections at BOTH session-creating login paths (password and
SIWE verify), so no suspension oracle exists.

**Guard stack.** Every `/api/admin/*` mutation runs the Wave-8 stack verbatim:
`isAllowedOrigin` → `requireAdmin` → `rateLimit` (per-admin userId key, never
IP) → Zod `.strict()` → business → `prisma.$transaction` → `json`. GETs run
`requireAdmin` (chain GETs add the rate limit — they scan logs); same-origin
GETs are exempt from the origin check per the documented CSRF posture.

**Audit log.** EVERY admin mutation writes an `AuditLog` row **in the same
`prisma.$transaction`** as the mutation via `writeAudit(tx, …)`
(`lib/admin/audit.ts`). Before/after snapshots pass a per-targetType
serializer **allowlist** — `passwordHash`/`tokenHash` can provably never be
serialized (test-enforced against the full secret-name set). A read-only audit
viewer ships at `/admin/audit`. **Recorded exclusion:** composing/exporting
PREPARED calldata (below) is pure client-side and writes NO audit row — the
Safe's own review/queue is the audit surface for prepared transactions; the
"audit everything" rule is honestly scoped to server mutations.

**Feature flags.** `FeatureFlag` rows + declared per-flag defaults
(`lib/flags/defaults.ts`): missing row → the declared default, undeclared key
→ false, failures never throw. Public `GET /api/flags` serves
`Cache-Control: no-store` (test-pinned — live flips must be immediately
visible). Exactly ONE consumer is wired: `population_world_map` (default
true) gating the population world-map card.

**PREPARED on-chain actions (never signed).** `lib/admin/{abis,roles,prepare}`
are environment-neutral pure modules: `prepare*` functions validate against
mirrors of the contract `require` strings, then `encodeFunctionData` into
`{chainId, to, value: "0", data, decoded}` artifacts (single, 2-tx pull
batches for approve+openEpoch / approve+fundRewards, or a
`GovernanceProposalPayload`), plus a Safe Transaction Builder JSON export the
USER imports into their Safe. Treasury `GOVERNANCE_ROLE` actions
(disburse/fundDividends) are prepared as **full governance-proposal payloads**
(the role is held by the Governance CONTRACT; the proposer must be a citizen
wallet and the `descriptionHash` binds a `GovernanceProposalContent` row).
The static guard `test/no-admin-signing.test.ts` enforces the boundary with a
case-insensitive forbidden-token scan AND an import-boundary scan over
`lib/admin|app/admin|app/api/admin|components/admin`;
`test/integration/admin-prepared-e2e.test.ts` proves the calldata byte-correct
on local anvil (the TEST signs with anvil throwaway keys, panel code never).

**Chain reads.** `lib/admin/serverReads.ts` (server-only) reads per-contract
params and reconstructs the role topology from `RoleGranted` logs (candidates
from grants ONLY; membership is confirmed per-candidate via `hasRole` — a
set-difference fold would false-negative grant→revoke→re-grant histories).
The unregistered default chain returns `{available: false}` — never a 500.
**getLogs note:** topology scans use the registry entry's optional
`deployBlock` as `fromBlock` (default 0 — correct on anvil). On real networks
set `deployBlock` to the contract deploy block: providers commonly limit
from-genesis `eth_getLogs` ranges on Base/Base Sepolia.

**Wave 10 — admin-mint override (witness-free, PREPARED-only).** The passport
contract's `adminMint(to, nameHash, motto, domicile)` (`PASSPORT_ADMIN_ROLE`,
ZERO witnesses) gets a full panel path: `prepareAdminMint`
(`lib/admin/prepare.ts`, pure encoder — mirrors only the pure `ZeroAddress`
require) → `PreparedActionCard` ("PREPARED FOR YOUR SAFE — THIS PANEL NEVER
SIGNS"). The mint `to` is **never client-supplied** on the per-application
path: `buildAdminMintParams` (`lib/admin/mintParams.ts`) resolves the
applicant's live verified `LinkedWallet` via `resolveApplicantAddress` (no
verified wallet → approve disabled in the UI AND 400 from the route; the
stale `applicantAddress` snapshot column is never trusted), and encodes
motto/domicile byte-identically to the witnessed seal path
(`toBytes32String(x.trim().slice(0,31))`). `POST
/api/admin/applications/[id]/approve-mint` records **off-chain intent only**
(`adminApprovedAt`/`adminApprovedBy` — additive nullable columns in BOTH
schemas, drift-guarded): the `.strict()` empty-body schema rejects any
chain-cache field, citizen state stays `readHasPassport`-derived, and
re-approval is an audited EVENT (fresh `application.approve_mint` row in the
same `$transaction`), not a toggle. The applicant sees "an administrator has
approved your application; your passport is being issued" (obligations +
mint flow + home rail) — suppressed the moment the chain says citizen. The
generic composer variant (self-mint incl. admins without an application row)
resolves the admin's own verified wallet server-side, validates checksums via
`getAddress`, and warns to verify any manual address off-chain. Proven on
local anvil: `test/integration/admin-mint-e2e.test.ts` mints a ZERO-witness
passport from the prepared calldata (the TEST signs with an anvil throwaway
PASSPORT_ADMIN key; panel code never signs —
`test/no-admin-signing.test.ts`).

**Wave 10 — CSV report exports (allowlisted).** `lib/admin/csv.ts` `toCsv`
serializes ONLY explicit per-report column sets (users / applications /
audit — `passwordHash`/`tokenHash` are not in any set and `guard:secrets`
plus route tests enforce it), quotes/escapes RFC-4180 style, and neutralizes
formula injection (leading `= + - @`, TAB, CR). The three `GET
/api/admin/export/{users,applications,audit}` routes run `guardAdminGet` +
per-admin rate limit (10/5min), stream `text/csv` with a dated
`Content-Disposition` filename, and write an `admin.export.<kind>` audit row
(targetType `EXPORT`, tiny allowlist: kind/rowCount/requestedAt).

**Wave 10 — dashboard UX + infographics.** The four Overview stat tiles are
real keyboard-focusable `next/link` anchors (aria-labelled) into
`/admin/{users,applications,content,flags}`; admin screens are proven
overflow-free at 390px by e2e (long mono values wrap via
`overflowWrap:anywhere`; the shared `Ledger` scroll wrapper is a focusable
labeled region — axe `scrollable-region-focusable`). `GET /api/admin/stats`
serves honest series: applications-by-status in `APP_STATUS_ORDER`, DB
users/embassies counts, chain-derived citizens via graceful try/catch
(`chainAvailable:false` + `citizens:null` when unreadable — never fabricated,
never a 500), 14-day audit-activity buckets (empty days present as 0), and
`censusByCity` from `CityCensus.seededCount` with `censusSource:"seeded"`.
Charts (`components/admin/charts/`) are self-contained inline SVG — no chart
lib, no CDN, no scripts, no inline handlers, no animation (CSP-safe and
reduced-motion-safe by construction) — each with `role="img"` +
`<title>`/`<desc>` and a visually-hidden `<table>` as the accessible data
alternative; the seeded census chart is labeled "SEEDED — demonstrative, not
live census" in both its visible caption and its accessible alternative.

## 12. Wallet modes (Wave 11)

**Three non-custodial modes**, chosen once (persisted as PUBLIC metadata in
the wallet IndexedDB's `meta` store — DB v2, same `openDB` upgrade path as
the vault) and switchable any time; an existing vault user is never blocked
by the chooser:

1. **Embedded** — create a BIP-39 vault (existing) or **import** one
   (`importWallet`: normalize → `validateMnemonic` BEFORE any derivation →
   the same encrypt/save path as create; overwriting an existing vault
   requires an explicit confirmed `overwrite=true`).
2. **Hardware / external** — wagmi connect (`injected()` + WalletConnect;
   direct Ledger WebHID is a DOCUMENTED DEFERRAL — Ledger works today via
   Ledger Live/WalletConnect or the browser-extension path). Balances reuse
   the portfolio reads; `sendEvmExternal` sends via the wallet's OWN signer
   (native `sendTransaction`, ERC-20 `writeContract`); a correct-chain guard
   blocks send until `useSwitchChain` lands on the active chain.
3. **Watch-only + air-gapped** — a checksum-validated PUBLIC address drives
   the same read pipeline (portfolio/history/stats) read-only under a
   prominent WATCH-ONLY badge; sends are signed on a separate offline device
   via QR.

**The custody boundary (transitive-safe).** The watch-only build/broadcast
modules (`lib/wallet/airgapped/{build,broadcast}.ts`) hold NO key — and
because `services/send.ts` transitively imports the embedded signer, the
shared tx-encoding (`buildCall` + `EvmSendRequest`) lives in the SIGNER-FREE
`services/call.ts`; `build.ts` imports only from `call.ts`, never `send.ts`
(`send.ts` re-exports for compat). The offline signer
(`lib/wallet/airgapped/sign.ts`) signs via `withEvmSigner` and can never
broadcast (no `sendRawTransaction`, no `/api/rpc`, no `fetch`). All of this
is enforced STATICALLY by `lib/wallet/airgapped/boundary.test.ts` (including
the no-`send.ts`-import transitive guard a per-file symbol grep would miss),
at runtime by `sign.test.ts`'s zero-fetch spy, and end-to-end by
`test/integration/airgapped-e2e.test.ts` (anvil: the APP builds + broadcasts;
only the TEST's throwaway key signs).

**The air-gapped QR envelope** is a SELF-CONTAINED versioned CryptRepublic
format (`{v:1, t:"cr-eth-tx-unsigned", chainId, tx}` with bigints as decimal
strings; signed = a bare `0x` raw tx or `{v:1, t:"cr-eth-tx-signed", raw}`)
— NOT BC-UR; Keystone/Passport interop is documented follow-up.
`encodeUnsignedToQr` PINS `errorCorrectionLevel:"L"` and guards the exact
UTF-8 byte length against `QR_BYTE_LIMIT = 2953` (the version-40 EC-L cap of
the bundled `qrcode` 1.5.4) BEFORE rendering — an oversized payload throws
the "needs multi-part (BC-UR)" guard, never truncates. **ERC-20 honesty:**
an ERC-20 envelope's raw `tx.to` is the TOKEN CONTRACT and `tx.value` is 0 —
`decodeEnvelopeForDisplay` decodes the TRUE recipient + amount from the
transfer calldata (`decodeFunctionData`), refuses unknown calldata, and the
offline signer displays the decoded values PLUS the token contract; it never
shows the raw fields for an ERC-20.

**The scanner** (`QrScanner`) is bundled pure-JS `jsqr` — no CDN, no WASM,
no worker, ZERO CSP change. `getUserMedia` runs only on an explicit tap;
permission-denied/no-camera degrade to a manual-paste fallback; every
MediaStream track stops on decode/close/unmount.

**Scope + guards.** The watch-only/air-gapped MVP is EVM-only (Solana/BTC
watch-only is a `TODO(follow-up)` in `lib/wallet/mode.ts`). No new RPC
methods (`eth_sendRawTransaction` and the read set were already
allow-listed; `eth_sendTransaction`/`personal_sign`/`eth_sign` remain
rejected). `test/no-secret-to-fetch.test.ts` is EXTENDED across the
air-gapped loop: no mnemonic/entropy/private-key in any fetch body OR any QR
payload, signing makes zero network calls, and the forbidden methods never
appear on the wire. A wallet-verification flow (`POST /api/wallet/link`,
SIWE-proven key possession) binds a wallet to the LOGGED-IN account —
closing the gap where email-registered users could never satisfy
`resolveApplicantAddress`.

## 13. Referral policy & hybrid trust (Wave 12)

Three off-chain **policy** layers over the on-chain 7-witness seal — none of
them is ever citizenship (that stays chain-derived via `readHasPassport`):

**Referral-gated attestation.** A witness may only attest for an applicant they
**referred**. Enforced server-side in `POST /api/applications/witnesses/submit`,
after the citizen check and BEFORE the `WitnessSignature.create`: the witness is
known SOLELY by ECDSA recovery, mapped back to a `User` via a VERIFIED
`LinkedWallet` (`resolveUserByWalletAddress`), then a
`Referral(referrer=thatUser, referred=applicant)` must exist. A rejected witness
persists NO row, so the existing `collected >= requiredWitnesses → WITNESSED`
transition is untouched. Because every witness must independently be a referrer,
an applicant needs ≥ `requiredWitnesses` DISTINCT referrers to seal. The Wave-10
admin-mint OVERRIDE collects zero witnesses and never reaches this route — it is
DELIBERATELY exempt.

**Referral tokens (an off-chain admin quota).** `User.referralTokenBalance` is
an admin-allocated Int counter — **NOT an ERC-20** (an on-chain referral token is
documented future work). A citizen may create a referral (`POST /api/referrals`,
naming the referred user by email, resolved server-side) only if their trust
`finalScore > 50` (free) OR they hold a token (consumed only when trust ≤ 50;
exactly 50 is not a bypass). The create + conditional decrement run in one
transaction with a `updateMany({balance:{gt:0}})` race guard so a token can never
go negative or be double-spent; self-referral, referring an existing on-chain
citizen, and duplicates are rejected.

**Hybrid trust score (0..100).** `finalScore = clamp(computed + adminAdjustment,
0, 100)`, computed ON READ (no cache column). `computed` sums five bounded,
HONEST, chain-real sub-scores (each max 20): is-citizen, tenure (head − mint
block), referrals-who-became-citizens (live `readHasPassport` on each referred's
verified wallet — never `CitizenshipApplication.status`), governance votes, and
dividend claims. Every reader is try/catch-guarded (an unreachable chain degrades
a signal to 0, never a 500). A server-side STAKE signal is documented future
work. The only PERSISTED trust input is `User.trustAdjustment` — an admin-set,
audited signed delta. The score is surfaced READ-ONLY to the citizen.

**Admin surface + audit.** `POST /api/admin/users/[id]/referral-tokens` (add-only
1..1000) and `POST /api/admin/users/[id]/trust` (absolute −100..100) run the full
guard stack (origin → requireAdmin → per-admin rate limit → strict Zod) and write
their audit row in the SAME `$transaction`; `AUDIT_FIELD_ALLOWLIST.USER` gained
`referralTokenBalance` + `trustAdjustment` (public integers — no secret can
serialize). `GET /api/admin/users/[id]/referrals` is a guarded read whose
per-referral `becameCitizen` is chain-derived and labeled. No route can set
`User.role`.

**Schema + migrations.** The `Referral` model + the two `User` columns live
byte-identically in both prisma schemas (drift-guarded); a sqlite migration + a
hand-authored postgres migration share the same timestamp dir, additive and
prod-safe. New tables added after the postgres init snapshot live in incremental
migrations (the deploy-scripts guard now scans the union of all migrations).
