# Changelog

Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
`0.8.0` is the first versioned release — Waves 1–7 shipped without version
numbers on the same branch line and are recorded below as dated development
history (dates are the real commit dates from the git trail).

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
