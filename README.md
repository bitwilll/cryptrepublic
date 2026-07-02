# CryptRepublic

A **non-custodial network-state web app**: soulbound citizenship passports (ERC-721),
a dividend-bearing $CRYPT token (ERC-20), one-citizen-one-vote governance, a
governance-gated treasury, per-citizen dividend epochs, and staking — with an
embedded, client-side-encrypted multi-chain wallet. Next.js (App Router) + Prisma +
viem/wagmi + Foundry.

**The server never holds keys and never signs.** All transactions are signed
client-side (embedded vault or the user's connected wallet); the backend only
proxies allow-listed JSON-RPC reads and broadcasts raw, already-signed
transactions. Deploys, funding, and mainnet execution are **USER** steps — see
[docs/MAINNET_HANDOFF.md](docs/MAINNET_HANDOFF.md).

> **LEGAL.** $CRYPT is very likely a regulated security — see
> [docs/LEGAL_FLAGS_REFERENCE.md](docs/LEGAL_FLAGS_REFERENCE.md). This code is
> **not cleared for mainnet**: the Pre-Mainnet Gate (external audit, testnet
> burn-in, legal sign-off, bug bounty, key-custody adoption) is OPEN. Nothing in
> this repo is legal or financial advice.

## Quickstart (local dev)

```bash
pnpm install
cp .env.example .env        # defaults: testnet profile, SQLite
pnpm db:migrate && pnpm db:seed
pnpm dev                    # http://localhost:3000
```

Admin bootstrap (Wave 9): `pnpm admin:grant <email>` (`--revoke` to demote) —
operator-run with DB access only; no API can set roles and the panel cannot
promote. Audited as `cli`.

Contracts (Foundry lives in `contracts/`):

```bash
cd contracts && forge test
```

## Hosting (Vercel, testnet build)

The app deploys to Vercel with a Postgres production database while local dev
and the whole test suite stay on SQLite: a mirrored Prisma schema
(`prisma/postgres/schema.prisma`, held identical to the dev schema by a drift
test) plus a `vercel-build` script (Postgres client generate → `migrate
deploy` → `next build`). The hosted site is the **testnet** profile; on-chain
screens show their graceful "not deployed" states until the contracts land on
Base Sepolia (USER step). Full operator runbook — account, Neon Postgres, env
vars, deploy commands, seeding/admin bootstrap, cryptrepublic.com DNS:
[docs/DEPLOY_VERCEL.md](docs/DEPLOY_VERCEL.md).

## Test matrix

Counts as of the Wave-10 close-out (2026-07-03):

| Suite                     | Command                      | Count | What it proves                                                                                                                                                                                   |
| ------------------------- | ---------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit (Vitest)             | `pnpm test`                  | 799   | lib/API/component logic against jsdom + disposable SQLite (incl. the admin guard stack, audit allowlist, the no-signing guard, the dual-schema drift guard, the Wave-10 CSV/stats/charts suites) |
| Integration (local anvil) | `pnpm test:integration`      | 16    | REAL on-chain proofs: passport seal/mint, funded send + staking, castVote + dividend claim/no-double-claim, admin PREPARED calldata, ZERO-witness adminMint                                      |
| E2E (Playwright)          | `pnpm e2e`                   | 32    | browser flows on a prod build with deterministic stubbed reads (9 registrations/run — budget < 10; the admin spec registers nobody)                                                              |
| Contracts (Foundry)       | `cd contracts && forge test` | 165   | unit + fuzz + invariant (soulbound, one-vote, no-double-claim, solvency)                                                                                                                         |

Gates: `forge snapshot --check` (pinned fuzz seed + pinned CI toolchain) and
`bash contracts/scripts/coverage-gate.sh` (≥95% lines with two documented
no-regress exceptions + per-file no-regress branch floors — see
[contracts/audit/triage.md](contracts/audit/triage.md)).

## The release gate (honest split)

The release gate is **two commands, together**:

1. `pnpm e2e:critical` — the tagged browser spec (`e2e/critical-path.spec.ts`):
   the UI-side chain of the spec-§8.1 critical path (register → vault →
   attest/oath/witness gate → send-confirm → vote gating → claim gating →
   passport view) with **deterministic stubbed reads** on the default testnet
   env. It does **not** mint, send, vote, or claim on a real chain and never
   claims to.
2. `pnpm test:integration` — the four local-anvil suites where the **real
   on-chain proofs** live: passport seal/mint (`test/integration/mint-e2e.test.ts`),
   funded send + staking (`test/integration/wallet-e2e.test.ts`), governance
   castVote + dividend claim/no-double-claim
   (`test/integration/governance-dividends-e2e.test.ts`), and the admin panel's
   PREPARED calldata proven byte-correct end-to-end
   (`test/integration/admin-prepared-e2e.test.ts` — the TEST signs with anvil
   throwaway keys; the panel never signs).

Together the two halves cover every §8.1 station — on **LOCAL/STUBBED
environments only**. Executing the chain on live Base Sepolia remains a **USER
step** (deploy + fork tests + burn-in per
[contracts/docs/DEPLOY_RUNBOOK.md](contracts/docs/DEPLOY_RUNBOOK.md) and
[docs/MAINNET_HANDOFF.md](docs/MAINNET_HANDOFF.md)).

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — app structure, the single
  `NEXT_PUBLIC_CHAIN_ENV` switch, address registry, RPC-proxy model,
  non-custodial write path, testing strategy, perf budget, admin panel (§11)
- [docs/ENV_REFERENCE.md](docs/ENV_REFERENCE.md) — every environment variable
  (public/server-only), chain-swap procedure
- [docs/DEPLOY_VERCEL.md](docs/DEPLOY_VERCEL.md) — Vercel hosting runbook
  (Postgres via mirrored schema, env vars, domain, honest caveats)
- [docs/MAINNET_HANDOFF.md](docs/MAINNET_HANDOFF.md) — the USER-executed mainnet
  runbook + Pre-Mainnet Gate (honest statuses)
- [docs/LEGAL_FLAGS_REFERENCE.md](docs/LEGAL_FLAGS_REFERENCE.md) — all `// LEGAL:`
  markers mapped to spec-§10.1 risks
- [contracts/docs/DEPLOY_RUNBOOK.md](contracts/docs/DEPLOY_RUNBOOK.md) — contract
  deploy/configure/seed runbook (USER steps)
- [CHANGELOG.md](CHANGELOG.md) — release history (Waves 1–10)

## Wave status

| Wave | Deliverable                                                                                              | Status                                 |
| ---- | -------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 1    | Scaffold + design system + marketing home                                                                | Delivered                              |
| 2    | Auth (Argon2id + sessions + SIWE) + DB                                                                   | Delivered                              |
| 3    | Embedded/external wallets + multichain reads                                                             | Delivered                              |
| 4    | Contracts + tests (+ local anvil dry-run)                                                                | Delivered (testnet deploy = USER step) |
| 5    | Citizenship + 4-step passport mint                                                                       | Delivered                              |
| 6    | Wallet & Chain screen                                                                                    | Delivered                              |
| 7    | Remaining dashboard screens wired                                                                        | Delivered                              |
| 8    | Polish + tests + docs + mainnet runbook                                                                  | Delivered (assistant scope)            |
| 9    | Admin panel (capstone)                                                                                   | Delivered (2026-07-02)                 |
| 10   | Admin enhancements: admin-mint override + CSV report exports + responsive/clickable tiles + infographics | Delivered (2026-07-03)                 |

## Admin panel (Wave 9)

A role-gated back office at `/admin` (`User.role = ADMIN`; bootstrap is the
audited operator CLI `pnpm admin:grant <email>` — **no API can set or change
roles**, not even an admin's). Every admin mutation runs the full guard stack
(origin -> `requireAdmin` -> per-admin rate limit -> strict Zod) and writes its
audit row **in the same database transaction** through a serializer allowlist
that can never emit `passwordHash`/`tokenHash`. Screens: users (suspend =
revoke-all-sessions, KYC), citizenship-application review (off-chain-honest —
chain state is never admin-editable), content CRUD for the seeded catalog,
feature flags (declared defaults + one wired consumer: the population world
map), a read-only audit viewer, and chain actions.

**NON-CUSTODIAL, absolutely:** the chain-actions screen PREPARES
`{to, value, data, chainId, decoded}` calldata + a Safe Transaction Builder
JSON export for the USER's Safe to review and sign — the panel never holds
keys, signs, or broadcasts (statically enforced by
`test/no-admin-signing.test.ts`; calldata validity proven on local anvil in
`test/integration/admin-prepared-e2e.test.ts`). Treasury `GOVERNANCE_ROLE`
actions (disburse / fundDividends) are prepared as **governance-proposal
payloads** — the role is held by the Governance contract, so no direct Safe
transaction can honestly execute them.

Wave 10 extends the panel: an **admin-mint override** issues a passport
WITHOUT the seven external witnesses (`adminMint`, `PASSPORT_ADMIN_ROLE`) —
PREPARED only, signed in the admin's own wallet/Safe, never by the panel; the
mint destination is always the applicant's server-resolved verified wallet,
never client-supplied, and approval is recorded as off-chain intent
(`adminApprovedAt`/`By`) while citizen state stays chain-derived.
**Field-allowlisted CSV report exports** (users / applications / audit) are
injection-safe, audited as `admin.export.<kind>`, and can never contain
`passwordHash`/`tokenHash`. The Overview's stat tiles are keyboard-focusable
links into their sections, the panel is responsive at 390px, and a
"Republic at a glance" section renders self-contained inline-SVG infographics
(honest data from `/api/admin/stats`; the citizens count comes from the chain
or is shown as unavailable — never fabricated; census geography is labeled
SEEDED/demonstrative).

## Release (v0.10.0)

Current version: `0.10.0` ([CHANGELOG.md](CHANGELOG.md)). **Tagging is a USER
step** — on `main`:

```bash
git checkout main && git pull && git tag -a v0.10.0 -m "CryptRepublic v0.10.0 — Wave 10 admin enhancements" && git push origin v0.10.0
```

The assistant does not create or push tags. Three Wave-8 spec-row items remain
OPEN (USER): the runbook testnet dry-run, starting the ≥4-week burn-in, and
cutting this tag — see the Pre-Mainnet Gate in
[docs/MAINNET_HANDOFF.md](docs/MAINNET_HANDOFF.md).
