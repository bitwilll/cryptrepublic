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

## Test matrix

Counts as of the Wave 8 close-out (2026-07-02, this branch):

| Suite                     | Command                      | Count | What it proves                                                                                             |
| ------------------------- | ---------------------------- | ----- | ---------------------------------------------------------------------------------------------------------- |
| Unit (Vitest)             | `pnpm test`                  | 398   | lib/API/component logic against jsdom + disposable SQLite                                                  |
| Integration (local anvil) | `pnpm test:integration`      | 11    | REAL on-chain proofs: passport seal/mint, funded send + staking, castVote + dividend claim/no-double-claim |
| E2E (Playwright)          | `pnpm e2e`                   | 22    | browser flows on a prod build with deterministic stubbed reads (9 registrations/run — budget < 10)         |
| Contracts (Foundry)       | `cd contracts && forge test` | 165   | unit + fuzz + invariant (soulbound, one-vote, no-double-claim, solvency)                                   |

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
2. `pnpm test:integration` — the three local-anvil suites where the **real
   on-chain proofs** live: passport seal/mint (`test/integration/mint-e2e.test.ts`),
   funded send + staking (`test/integration/wallet-e2e.test.ts`), governance
   castVote + dividend claim/no-double-claim
   (`test/integration/governance-dividends-e2e.test.ts`).

Together the two halves cover every §8.1 station — on **LOCAL/STUBBED
environments only**. Executing the chain on live Base Sepolia remains a **USER
step** (deploy + fork tests + burn-in per
[contracts/docs/DEPLOY_RUNBOOK.md](contracts/docs/DEPLOY_RUNBOOK.md) and
[docs/MAINNET_HANDOFF.md](docs/MAINNET_HANDOFF.md)).

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — app structure, the single
  `NEXT_PUBLIC_CHAIN_ENV` switch, address registry, RPC-proxy model,
  non-custodial write path, testing strategy, perf budget
- [docs/ENV_REFERENCE.md](docs/ENV_REFERENCE.md) — every environment variable
  (public/server-only), chain-swap procedure
- [docs/MAINNET_HANDOFF.md](docs/MAINNET_HANDOFF.md) — the USER-executed mainnet
  runbook + Pre-Mainnet Gate (honest statuses)
- [docs/LEGAL_FLAGS_REFERENCE.md](docs/LEGAL_FLAGS_REFERENCE.md) — all `// LEGAL:`
  markers mapped to spec-§10.1 risks
- [contracts/docs/DEPLOY_RUNBOOK.md](contracts/docs/DEPLOY_RUNBOOK.md) — contract
  deploy/configure/seed runbook (USER steps)
- [CHANGELOG.md](CHANGELOG.md) — release history (Waves 1–8)

## Wave status

| Wave | Deliverable                                  | Status                                 |
| ---- | -------------------------------------------- | -------------------------------------- |
| 1    | Scaffold + design system + marketing home    | Delivered                              |
| 2    | Auth (Argon2id + sessions + SIWE) + DB       | Delivered                              |
| 3    | Embedded/external wallets + multichain reads | Delivered                              |
| 4    | Contracts + tests (+ local anvil dry-run)    | Delivered (testnet deploy = USER step) |
| 5    | Citizenship + 4-step passport mint           | Delivered                              |
| 6    | Wallet & Chain screen                        | Delivered                              |
| 7    | Remaining dashboard screens wired            | Delivered                              |
| 8    | Polish + tests + docs + mainnet runbook      | Delivered (assistant scope)            |
| 9    | Admin panel (capstone)                       | Pending                                |

## Release (v0.8.0)

Current version: `0.8.0` ([CHANGELOG.md](CHANGELOG.md)). **Tagging is a USER
step, post-merge** — after merging this branch to `main`:

```bash
git checkout main && git pull && git tag -a v0.8.0 -m "CryptRepublic v0.8.0 — Wave 8 close-out" && git push origin v0.8.0
```

The assistant does not create or push tags. Three Wave-8 spec-row items remain
OPEN (USER): the runbook testnet dry-run, starting the ≥4-week burn-in, and
cutting this tag — see the Pre-Mainnet Gate in
[docs/MAINNET_HANDOFF.md](docs/MAINNET_HANDOFF.md).
