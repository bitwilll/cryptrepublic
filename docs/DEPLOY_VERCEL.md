# CryptRepublic — Vercel deployment runbook (testnet build)

Operator runbook for hosting the app on Vercel with a Postgres production
database, driven from a local machine with this repo checked out. Companion
docs: [ENV_REFERENCE.md](ENV_REFERENCE.md) (every env var),
[ARCHITECTURE.md](ARCHITECTURE.md) (incl. the dual-Prisma-schema note in §7),
[MAINNET_HANDOFF.md](MAINNET_HANDOFF.md) (mainnet is a much later, gated step).

> **HONESTY, up front.** What this deploys is the **TESTNET build**
> (`NEXT_PUBLIC_CHAIN_ENV=testnet`, Base Sepolia primary). The contracts are
> **not yet deployed** to Base Sepolia, so every on-chain screen (passport
> seal, governance, treasury, dividends, staking) renders its existing,
> deliberate "not deployed / unavailable" state until the USER runs
> [../contracts/docs/DEPLOY_RUNBOOK.md](../contracts/docs/DEPLOY_RUNBOOK.md)
> and registers the addresses in `config/contracts.ts` (then rebuilds).
> Auth, the embedded wallet (client-side, IndexedDB), citizenship
> applications, and all seeded/off-chain content work immediately.
> **Nothing here is cleared for mainnet** — see the Pre-Mainnet Gate in
> [MAINNET_HANDOFF.md](MAINNET_HANDOFF.md).

## How the pieces fit (read once)

- **Two Prisma schemas, one client API.**
  [../prisma/schema.prisma](../prisma/schema.prisma) (SQLite) stays
  authoritative for local dev and the entire local test suite.
  [../prisma/postgres/schema.prisma](../prisma/postgres/schema.prisma) is a
  **mirror** with `provider = "postgresql"` and its own migrations directory
  (`prisma/postgres/migrations/`). `prisma/schema-drift.test.ts` fails the
  unit suite if the two datamodels ever diverge, so the generated client API
  is identical either way.
- **Vercel builds with `vercel-build`** (Vercel prefers it over `build` when
  present):
  `prisma generate --schema prisma/postgres/schema.prisma && prisma migrate deploy --schema … && next build`.
  Install-time `@prisma/client` postinstall generates from the default
  (SQLite) schema; the first `vercel-build` step immediately regenerates from
  the Postgres schema, so the deployed client is always the Postgres one (and
  Vercel's dependency cache can never serve a stale client).
- **Migrations run at build time, not in a release phase.** `prisma migrate
  deploy` is idempotent (applies only unapplied migrations, records them in
  `_prisma_migrations`). For a single-region app on its first deploys this is
  the simplest correct choice. **Caveat, honestly:** the migration lands when
  the *build* succeeds, a few moments before the new code starts serving — a
  brief window where old code runs against the new schema, and a failed/
  cancelled promotion does not roll the migration back. All migrations so far
  are additive, which makes that window harmless. If migrations ever become
  destructive or multi-region rollout arrives, move `migrate deploy` to a
  dedicated release step (e.g. run it manually before `vercel --prod`).
- **No `vercel.json`.** Framework autodetection (Next.js 15 + pnpm via
  `packageManager`) plus the `vercel-build` script cover everything; an empty
  config would just be another file to keep honest.
- **Serverless notes (verified in-repo):** no runtime `fs`/`child_process`
  usage in `app/`, `lib/`, `config/`, or `middleware.ts`; the wallet vault is
  client-side IndexedDB; `middleware.ts` is the standard Next CSP-nonce
  pattern (Edge-runtime-safe). The login rate limiter
  (`lib/auth/ratelimit.ts`) is **in-memory and per-instance** — on serverless
  each instance counts separately, so the limiter is advisory there; the
  DB-backed per-account lockout (`lib/auth/lockout.ts`) is the durable layer.
  Upgrade path (future work, not done): a shared store (Upstash Redis /
  `@upstash/ratelimit`) behind the same `rateLimit()` signature.

## 1. Account + CLI login (USER step)

1. Create the Vercel account (Hobby tier is fine — buy nothing).
2. On this machine: `npm i -g vercel` (or `pnpm dlx vercel …` per-command),
   then `vercel login` and complete the browser auth.

## 2. Create the Postgres database

In the Vercel dashboard: **Storage → Create Database → Postgres (Neon)** —
free tier. Create it in the same region you'll deploy to, and **connect it to
the project** (step 4 creates the project; you can also create the DB after
`vercel link` and connect it then).

Connecting the database makes the Neon integration inject env vars into the
project automatically — the two that matter here:

- `DATABASE_URL` — the **pooled** connection string (PgBouncer). The app's
  runtime queries use this.
- `DATABASE_URL_UNPOOLED` — the **direct** connection string. Only the Prisma
  CLI uses it (the `directUrl` in `prisma/postgres/schema.prisma`) for
  `migrate deploy`, which must not run through a transaction-mode pooler.

If you use any other Postgres provider instead: set both variables yourself;
for an unpooled server it is fine to set both to the same URL. If your pooled
URL is PgBouncer-based and you see prepared-statement errors, append
`?pgbouncer=true&connect_timeout=15` to `DATABASE_URL`.

## 3. Environment variables (Vercel → Project → Settings → Environment Variables)

Set for **Production** (and Preview where noted). Full semantics in
[ENV_REFERENCE.md](ENV_REFERENCE.md). `NEXT_PUBLIC_*` values are **inlined at
build time** — changing one requires a redeploy.

| Variable                              | Value                                        | Scope note                                                                                                                                              |
| ------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_CHAIN_ENV`               | `testnet`                                    | Public (build-time). The single chain switch — keep `testnet` until the Pre-Mainnet Gate clears.                                                        |
| `NEXT_PUBLIC_APP_URL`                 | `https://cryptrepublic.com`                  | Public (build-time). Bound into SIWE messages + the CSRF Origin allowlist — must equal the real serving origin (see Preview caveat below).              |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`| your WalletConnect v2 project id             | Public client id (safe to expose). Optional — without it the WalletConnect connector is unavailable.                                                    |
| `DATABASE_URL`                        | injected by the Neon integration (pooled)    | **Server-only.** Never `NEXT_PUBLIC_`.                                                                                                                  |
| `DATABASE_URL_UNPOOLED`               | injected by the Neon integration (direct)    | **Server-only.** Used only by `prisma migrate deploy` during the build.                                                                                 |
| `RPC_BASE_SEPOLIA`                    | your keyed Base Sepolia RPC URL              | **Server-only.** Primary chain of the testnet profile; without it the RPC proxy 500s for that chain.                                                    |
| `ETHERSCAN_API_KEY`                   | your Etherscan API v2 key                    | **Server-only.** Optional — without it the tx-history route answers "History provider not configured".                                                  |
| `APP_URL`                             | (leave unset)                                | **Server-only** fallback for the CSRF host only — `NEXT_PUBLIC_APP_URL` already covers it. Set only if you ever need a server-side origin override.     |

Optional extras (same server-only posture): `RPC_ETHEREUM`, `RPC_ARBITRUM`,
`RPC_OPTIMISM`, `RPC_POLYGON` (testnet-profile networks of those names),
`RPC_SOLANA` — each unlocks reads on its chain, absent ones degrade gracefully.

**Preview deployments, honestly:** `NEXT_PUBLIC_APP_URL` is baked in at build
time, but Preview URLs are per-deploy (`*-git-*.vercel.app`). On a Preview
whose origin differs from the configured value, SIWE binding and the CSRF
Origin check will (correctly) reject state-changing requests. Either scope a
Preview-environment `NEXT_PUBLIC_APP_URL` to the stable branch alias and test
only on that alias, or treat Previews as read-only smoke checks and do auth
testing locally/in Production.

## 4. Link + deploy (run from this machine)

```bash
cd "<repo root>"
vercel link          # create/select the project (framework: Next.js, auto)
vercel               # first Preview deploy — sanity-check the build log:
                     #   prisma generate (postgres schema)
                     #   prisma migrate deploy  → "1 migration applied" (first run)
                     #   next build
vercel --prod        # promote to Production
```

`prisma migrate deploy` on subsequent deploys prints "No pending migrations"
— that is the idempotence working, not an error.

## 5. One-time production bootstrap (seed + admin)

These run **locally against the remote Postgres** — the scripts use whatever
client `prisma generate` last produced, so generate the Postgres client first
and **restore the SQLite client afterwards** (the local test suite depends on
it). An env var set on the command line overrides the `.env` value (Prisma
does not overwrite already-set variables), so prefix — don't edit `.env`.
Use the **direct (unpooled)** URL for these one-offs. Get both URLs from
Vercel → Storage → your database → `.env.local` tab, or `vercel env pull`.

```bash
pnpm db:generate:pg                                        # client -> postgres

DATABASE_URL="postgres://<direct-url>" pnpm db:seed        # idempotent upserts
DATABASE_URL="postgres://<direct-url>" pnpm admin:grant you@example.org
# (--revoke to demote; the granted email must have REGISTERED on the site first)

pnpm db:generate                                           # client -> sqlite (MANDATORY)
```

Both scripts are dialect-neutral by construction: `prisma/seed.ts` is
upserts-only, `scripts/grant-admin.ts` uses the same `@prisma/client` import
and plain updates. `pnpm admin:grant` is the ONLY way to mint an admin — no
API can set roles ([README](../README.md) §Admin panel).

## 6. Domain: cryptrepublic.com (Namecheap)

Add both hosts to the project (dashboard → Project → Settings → Domains, or):

```bash
vercel domains add cryptrepublic.com
vercel domains add www.cryptrepublic.com   # Vercel auto-redirects www -> apex
```

Then point Namecheap at Vercel — **either** option:

- **Option A (recommended — Vercel nameservers):** Namecheap → Domain →
  Nameservers → Custom DNS → `ns1.vercel-dns.com`, `ns2.vercel-dns.com`.
  Vercel then manages all records.
- **Option B (keep Namecheap DNS):** Advanced DNS →
  - `A` record, host `@`, value `76.76.21.21`
  - `CNAME` record, host `www`, value `cname.vercel-dns.com`

**The Vercel Domains tab is authoritative** — if it shows different values
than the above, use what the dashboard says. Remove Namecheap's default
parking page / URL-redirect records first (they conflict with the apex
record). TLS certificates are automatic once DNS resolves (minutes on Option
B; nameserver propagation for Option A can take longer).

Set `NEXT_PUBLIC_APP_URL=https://cryptrepublic.com` **before** the production
build you intend to serve on the domain (build-time inlining, again).

## 7. Caveats & limitations (the honest list)

1. **Testnet build.** The hosted site is the testnet profile end-to-end. It
   never claims mainnet readiness; the Pre-Mainnet Gate items remain OPEN.
2. **Contracts not yet on Base Sepolia.** On-chain features show their
   graceful "not deployed" states until the USER executes
   [../contracts/docs/DEPLOY_RUNBOOK.md](../contracts/docs/DEPLOY_RUNBOOK.md)
   and registers addresses in `config/contracts.ts` (+ redeploy). That is a
   deliberate, visible state — not a bug.
3. **Rate limiter is per-instance** on serverless (see "Serverless notes"
   above). Durable protection is the DB-backed account lockout; the Upstash
   shared-store upgrade is future work.
4. **SQLite vs Postgres split.** Local dev + the entire 600+-test local gate
   run SQLite; production runs Postgres from the mirrored schema. The drift
   test keeps the datamodels identical, but **no CI lane executes queries
   against a real Postgres** yet — the first true Postgres exercise is the
   deployed app itself. Stand up a Postgres CI lane before mainnet.
5. **Schema changes now touch two files.** Edit both schemas (the drift test
   fails the unit suite if you forget one), run `pnpm db:migrate` (SQLite dev
   migration) AND add a new Postgres migration under
   `prisma/postgres/migrations/<timestamp>_<name>/migration.sql`. Two honest
   ways to produce its SQL without a local Postgres server:
   - diff against the applied migrations using any throwaway Postgres as the
     shadow DB (`--from-migrations` requires one):
     `pnpm exec prisma migrate diff --from-migrations prisma/postgres/migrations --to-schema-datamodel prisma/postgres/schema.prisma --shadow-database-url "<throwaway-postgres-url>" --script`
   - or regenerate the full script with
     `pnpm exec prisma migrate diff --from-empty --to-schema-datamodel prisma/postgres/schema.prisma --script`
     (needs no DB) and hand-extract the delta versus the previous from-empty
     output.
   Nothing automatic checks the migration SQL — review it before deploying.
6. **e2e/integration suites stay local.** Playwright (stubbed reads) and the
   anvil integration suites are not wired to the hosted site; hosted smoke
   testing is manual for now.
7. **Migrations-at-build window** (see "How the pieces fit") — fine while
   additive; revisit before any destructive migration.
