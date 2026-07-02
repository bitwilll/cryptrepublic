# CryptRepublic — Mainnet Handoff (USER runbook) + Pre-Mainnet Gate

The consolidated, USER-executed path from this repo to Base mainnet. Contract
deploy detail lives in
[../contracts/docs/DEPLOY_RUNBOOK.md](../contracts/docs/DEPLOY_RUNBOOK.md)
(this document deep-links it rather than duplicating it); app wiring in
[ARCHITECTURE.md](ARCHITECTURE.md); legal flags in
[LEGAL_FLAGS_REFERENCE.md](LEGAL_FLAGS_REFERENCE.md).

> **Hard boundary (spec §8.3).** The assistant produces mainnet-ready code,
> deploy scripts, config templates, and this runbook, and validates everything
> locally/on stubs. It **never** holds or requests keys or seed phrases, never
> deploys to any live network, never funds treasury/distributor/staking with
> real money, and never signs or broadcasts a real-value transaction. **Every
> step below is executed by the user** (or their authorized signers/multisig),
> on their own machines, with their own keys.

## Prerequisites (USER)

- The **Pre-Mainnet Gate** (bottom of this doc) fully satisfied — including the
  external audit and written legal sign-off.
- A hardware-wallet-backed **Safe multisig** (+ `TimelockController`, 48h
  delay per the deployed design) for the admin, treasury, and genesis-attestor
  roles.
- A Base mainnet RPC endpoint and a Basescan/Etherscan-v2 API key.
- ETH on Base mainnet in the deployer/signer accounts.

## The 8 mainnet steps (exact commands; mirrors spec §8.3 and the [DEPLOY_RUNBOOK mainnet section](../contracts/docs/DEPLOY_RUNBOOK.md#user--base-mainnet-pre-mainnet-gate-required))

1. **Obtain funds.** ETH on Base mainnet in the deployer/signer accounts for
   gas + initial operations.
2. **Prepare config.**

   ```bash
   cp .env.mainnet.example .env.mainnet   # placeholders — fill your own values
   ```

   Set `NEXT_PUBLIC_CHAIN_ENV=mainnet`, `RPC_BASE`, `ETHERSCAN_API_KEY`,
   production `NEXT_PUBLIC_APP_URL` and `DATABASE_URL`
   ([ENV_REFERENCE.md](ENV_REFERENCE.md)). **Never place a private key in a
   repo file** — use a hardware wallet, `cast wallet`, or a keystore
   reference. Confirm no testnet addresses remain.

3. **Deploy contracts.** Deploy order and the Token↔Treasury caveat are in the
   [DEPLOY_RUNBOOK](../contracts/docs/DEPLOY_RUNBOOK.md#contracts-deploy-order):

   ```bash
   cd contracts
   export BASE_MAINNET_RPC=...            # your Base mainnet RPC
   export ETHERSCAN_API_KEY=...           # Basescan key for --verify
   forge script script/Deploy.s.sol:Deploy \
     --rpc-url $BASE_MAINNET_RPC --broadcast --verify --ledger
   # (or --account <keystore>)
   # If admin is a Safe (deploy/configure split), export the deployed addresses
   # (CRYPT_TOKEN, PASSPORT, GOVERNANCE, TREASURY, DISTRIBUTOR, STAKING, ADMIN) and:
   forge script script/Configure.s.sol:Configure \
     --rpc-url $BASE_MAINNET_RPC --broadcast --account <keystore>
   ```

4. **Verify contracts** on Basescan (`--verify` above, or
   `forge verify-contract` per contract); confirm source + constructor args;
   publish the addresses.
5. **Transfer/renounce roles.** Move every admin/config role
   (admin/minter/attestor/treasury/governance/funder/rewards-admin — the full
   wiring table is in the
   [DEPLOY_RUNBOOK roles section](../contracts/docs/DEPLOY_RUNBOOK.md#roles-wired-by-configuressol))
   to the Safe + `TimelockController`; renounce the deployer EOA; time-box and
   **revoke `GENESIS_ATTESTOR_ROLE`** after seeding; confirm no single EOA can
   drain the treasury or mint passports.
6. **Set app config to mainnet.** Paste the verified mainnet addresses into
   `CONTRACTS[8453]` in `config/contracts.ts` — the app's only address
   registry (the `scripts/emit-contract-addresses.mjs` emitter is LOCAL-ANVIL
   ONLY; real-network registration is this manual USER step — see
   [ARCHITECTURE.md](ARCHITECTURE.md) §3). Set `NEXT_PUBLIC_CHAIN_ENV=mainnet`,
   **rebuild** (`NEXT_PUBLIC_*` is inlined at build time), deploy the app, and
   confirm live mainnet reads render and no testnet banners remain.
7. **Fund treasury / distributor / staking.** Only after written legal
   sign-off (Gate item 6), transfer real funds/$CRYPT via the multisig with
   explicit confirmation. The `// LEGAL:` markers at the token-mint,
   dividend-open/claim, and treasury disburse/fund boundaries
   ([LEGAL_FLAGS_REFERENCE.md](LEGAL_FLAGS_REFERENCE.md)) must survive into
   the deployed code.
8. **Smoke & monitor.** One real end-to-end pass (apply → mint → small
   transfer → vote → claim); enable the monitoring described under Burn-in
   below; keep this rollback/pause + incident-response plan at hand.

## Rollback / pause plan (Gate item 8)

**What CAN be paused.** `$CRYPT` only: `CryptToken` is `ERC20Pausable`;
`pause()`/`unpause()` are `PAUSER_ROLE`-gated (held by the Safe after step 5).
Pausing freezes **every** $CRYPT movement (transfer/mint/burn all route through
`_update`), which also halts dividend claims, staking stake/unstake/claim, and
treasury $CRYPT outflows. It does **not** stop ETH disbursements from the
treasury (those are governance-gated, not pausable) and does not affect
passports.

**What CANNOT be paused or upgraded.** The passport, governance, treasury,
distributor, and staking contracts have no pause switch, and **all six v1
contracts are non-upgradeable** (no proxy, constructors only — see the
[DEPLOY_RUNBOOK "Upgradeability" section](../contracts/docs/DEPLOY_RUNBOOK.md#upgradeability)).
A contract-logic fix ships as a new version + governance migration + frontend
re-point; there is no in-place patch.

**App-level rollback** (no on-chain action required):

- Un-register the app from the bad deployment: empty `CONTRACTS[8453]` in
  `config/contracts.ts` (every screen degrades gracefully to honest
  empty/unavailable states — this is test-asserted behavior), or flip
  `NEXT_PUBLIC_CHAIN_ENV` back to `testnet`; **rebuild + redeploy** the app.
- Or serve a static maintenance page at the host/CDN while deciding.

**Decision matrix.**

| Situation | Lever | Who | Delay |
| --- | --- | --- | --- |
| Token/dividend/staking-level incident | `CryptToken.pause()` | the Safe (PAUSER_ROLE) | immediate (Safe signature time) |
| App/UI-level incident | app rollback / maintenance page | app operator | minutes |
| Role or parameter change (incl. un-pausing policy, APR, quorum) | Safe + `TimelockController` | the Safe | 48h timelock |
| Contract-logic defect | new version + migration + re-point | the Safe + governance | days+ |

## Key custody + incident response (Gate item 7 — DRAFTED for USER adoption)

**Role → holder mapping** (the state after step 5; wiring per
[Configure.s.sol](../contracts/docs/DEPLOY_RUNBOOK.md#roles-wired-by-configuressol)):

| Role | Holder on mainnet |
| --- | --- |
| `DEFAULT_ADMIN_ROLE` (every contract) | Safe behind `TimelockController` (48h) |
| `PAUSER_ROLE` (CryptToken) | Safe |
| `MINTER_ROLE` (CryptToken) | `DividendDistributor` + `CryptStaking` (contracts, never an EOA) |
| `GOVERNANCE_ROLE` (CryptTreasury) | `CryptGovernance` (contract) |
| `FUNDER_ROLE` (DividendDistributor) | `CryptTreasury` + Safe |
| `REWARDS_ADMIN_ROLE` (CryptStaking) | Safe |
| `PASSPORT_ADMIN_ROLE` (Passport) | Safe |
| `GENESIS_ATTESTOR_ROLE` (Passport) | time-boxed seeder → **revoked** after seeding |

Safe **threshold and signer set are the user's decision** (spec §10.3 open
question 3 — e.g. 2-of-3 minimum, 3-of-5 preferred; hardware-backed signers).

**Rotation procedure (routine, e.g. quarterly or on personnel change):** add
the new signer to the Safe → confirm on-chain → remove the old signer →
verify threshold unchanged → record in the ops log. Contract roles never move
to EOAs during rotation; only Safe membership rotates.

**Compromise playbook (this is a P0 — see triage below):**

1. **Contain:** `CryptToken.pause()` via the Safe (freezes token value
   movement); take the app to the maintenance page.
2. **Rotate:** if a Safe **signer** key is compromised — swap that signer out
   immediately (the threshold is the protection; a single signer cannot act).
   If a **role-holding EOA** somehow still exists — revoke its roles via the
   Safe (`revokeRole`), grant to the Safe/timelock. Verify with an on-chain
   role audit (`hasRole` sweeps on every role above).
3. **Verify the deployer EOA is powerless** (roles renounced in step 5 —
   re-check, don't assume).
4. **Disclose:** publish an incident notice to citizens (what, impact,
   remediation, timeline); dividends/claims paused until resolved.
5. **Postmortem:** written within a week; feeds the burn-in/monitoring rules.

**Contact tree — USER fills before mainnet (named humans are not the
assistant's to invent):**

| Role | Name | Reachable via |
| --- | --- | --- |
| Incident lead | _user fills_ | _user fills_ |
| Safe signers (all) | _user fills_ | _user fills_ |
| Legal counsel | _user fills_ | _user fills_ |
| Infra/app operator | _user fills_ | _user fills_ |

## Burn-in plan (Gate item 2 — ≥4 continuous weeks on Base Sepolia)

Run against **your own live Base Sepolia deployment** (per the
[DEPLOY_RUNBOOK testnet section](../contracts/docs/DEPLOY_RUNBOOK.md#user--base-sepolia-testnet)),
exercising the spec-§8.1 critical path. The **only on-testnet evidence** each
week is these two USER-run activities:

1. **The manual 8-step smoke** against the live testnet deployment: apply →
   mint → small transfer → vote → claim (DEPLOY_RUNBOOK step-8 pattern),
   recorded with tx hashes.
2. **The fork tests** documented in the
   [DEPLOY_RUNBOOK fork-tests section](../contracts/docs/DEPLOY_RUNBOOK.md#fork-tests-once-live-addresses-exist):

   ```bash
   cd contracts
   forge test --fork-url $BASE_SEPOLIA_RPC --match-path 'test/**/*fork*'
   ```

**What is explicitly NOT burn-in evidence:** `pnpm e2e:critical` and
`pnpm test:integration` are **LOCAL-ONLY regression suites** and provide
**zero on-testnet evidence** — they *cannot* be pointed at live testnet
addresses. The browser spec runs with deterministic stubbed reads against
unregistered contracts (the honest release-gate split — see
[ARCHITECTURE.md](ARCHITECTURE.md) §8), and the integration suite is hardwired
to `NEXT_PUBLIC_CHAIN_ENV=local` (the `test:integration` script in
`package.json`) and spawns a throwaway local anvil that deploys fresh contracts
and rewrites `config/contracts.ts` (`test/integration/anvil-harness.ts` —
"LOCAL ANVIL ONLY"). Run them weekly during the burn-in **only** to guard
against code regressions — never cite them for Gate item 2.

**Triage definitions:**

- **P0** — funds, keys, soulbound-passport integrity, or vote integrity at
  risk. Stop-the-line: pause/contain per the playbook, fix, and **restart the
  4-week burn-in clock**.
- **P1** — a critical-path function broken but a workaround exists. Fix within
  the burn-in window; no clock restart; recorded in the burn-in log.
- **P2/P3** — degraded UX / cosmetic. Logged and scheduled; no gate impact.

**Monitoring (user-chosen tooling — no monitoring integration ships in this
repo):** watch, at minimum, treasury ETH/$CRYPT balances and the
`Disbursed`, `DividendsFunded`, `Paused`/`Unpaused`, `RoleGranted`/`RoleRevoked`
events via Basescan alerts or a Tenderly-class watcher; alert on any role event
not initiated by the Safe.

## HSTS preload (USER decision)

The app sends `Strict-Transport-Security: max-age=31536000; includeSubDomains`
in production (`middleware.ts`) — deliberately **without `preload`**.
Submitting your apex domain to the browser preload list
(hstspreload.org) is a USER decision because it is effectively irreversible
(removal takes months and every subdomain must serve HTTPS forever, including
non-app subdomains you may add later). Recommended: decide during the burn-in;
if all your subdomains are HTTPS-only, add `preload` to the header and submit;
otherwise leave as shipped.

## Pre-Mainnet Gate (spec §8.2 — ALL items blocking; honest statuses)

| # | Gate item (spec §8.2) | Status |
| --- | --- | --- |
| 1 | External contract audit; all High/Critical resolved; report published | **OPEN — USER.** No external audit has been performed or commissioned. |
| 2 | ≥4 continuous weeks Base Sepolia burn-in, critical path exercised, no unresolved P0/P1 | **OPEN — USER.** Not started (no user testnet deployment exists yet). Plan above. |
| 3 | Full test suite green on the exact deploy commit | **EVIDENCED at the v0.8.0 Wave-8 close-out** (2026-07-02, D3 close-out commit on this branch — full results in that commit body): 398 unit / 11 integration (anvil) / 22 e2e / 165 forge, plus `forge snapshot --check`, the coverage gate, and a green production build within the perf budget. **Must be re-verified on the exact deploy commit at deploy time** — this row evidences the release commit, not a future deploy commit. |
| 4 | slither/solhint clean or triaged | **EVIDENCED.** [../contracts/audit/triage.md](../contracts/audit/triage.md) — 0 high/medium findings; all results triaged with dispositions. |
| 5 | Bug bounty open before large treasury/dividend funding | **OPEN — USER.** No bounty program exists; platform/budget are the user's call (spec §10.3 #9). |
| 6 | Legal sign-off (spec §10) | **OPEN — USER.** See [LEGAL_FLAGS_REFERENCE.md](LEGAL_FLAGS_REFERENCE.md); blocks funding (step 7) and public mainnet. |
| 7 | Key-custody plan: treasury/admin/genesis-attestor behind Safe + timelock, rotation + incident-response runbook | **DRAFTED in this document — OPEN until the USER stands up the Safe + timelock and adopts the runbook** (fills the contact tree, picks threshold). |
| 8 | Frozen mainnet config/addresses/env with documented rollback/pause plan | **TEMPLATED** (`.env.mainnet.example` + the rollback/pause plan above) — **OPEN until the USER freezes real addresses** in `CONTRACTS[8453]` + `.env.mainnet`. |

Nothing above is marked done that is not done. Items 1, 2, 5, 6 **cannot** be
completed by the assistant under the hard boundary; items 7 and 8 become
satisfied only by user adoption.
