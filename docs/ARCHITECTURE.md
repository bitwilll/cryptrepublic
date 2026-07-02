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
- `prisma/` — schema, migrations, seed (SQLite in dev).
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
- **DB engines:** SQLite for dev/CI today. **Postgres-in-CI is a documented
  DEFERRAL** — the Prisma schema is engine-portable, but CI currently exercises
  the SQLite path only; stand up the Postgres CI lane before production.

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
