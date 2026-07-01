# Wave 4 — Acceptance Record (Smart Contracts)

This maps every Wave 4 acceptance criterion (reframed spec §9 + the Wave 4 locked decisions) to evidence.
As of this commit the full local gate is **green**. The Base Sepolia + mainnet deploy is a documented
USER step (see `DEPLOY_RUNBOOK.md`), NOT executed by the assistant (spec §8.3 boundary).

## Contracts delivered (`contracts/src/`)

| Contract | Path |
|---|---|
| `CryptToken` ($CRYPT ERC-20, capped mint, permit, pausable) | `src/CryptToken.sol` |
| `CryptRepublicPassport` (soulbound ERC-721, witness + genesis mint) | `src/CryptRepublicPassport.sol` |
| `CryptGovernance` (passport-gated 1-citizen-1-vote + exec timelock) | `src/CryptGovernance.sol` |
| `CryptTreasury` (governance-gated disbursement, atomic fundDividends) | `src/CryptTreasury.sol` |
| `DividendDistributor` (equal per-citizen epoch dividends) | `src/DividendDistributor.sol` |
| `CryptStaking` (Synthetix-accumulator APR, solvency-bounded) | `src/CryptStaking.sol` |
| `WitnessAttestation` (EIP-712 witness verification lib) | `src/lib/WitnessAttestation.sol` |
| `Roles` (shared bytes32 role constants) | `src/lib/Roles.sol` |
| `IPassport`, `ICryptToken` (interfaces) | `src/interfaces/` |

Scripts: `script/Deploy.s.sol` (+ `DeployLib`), `script/Configure.s.sol`, `script/SeedGenesis.s.sol`.
Tests: one `*.t.sol` (unit + fuzz) and one `*.invariant.t.sol` per contract, plus `test/Deploy.t.sol`,
`test/Sanity.t.sol`, `test/helpers/PassportHelper.sol`, `test/mocks/{MockERC20,ReentrantToken}.sol`.

## Test suite (`forge test`)

**165 tests pass, 0 fail** across 15 suites (unit + fuzz + invariant). Per-contract:
CryptToken 21, Passport 38, WitnessAttestation 5, Governance 38, Treasury 20, Distributor 18,
Staking 23, Deploy 1, Sanity 1. `forge fmt --check` clean; `forge build` clean (solc 0.8.28, optimizer 200);
`forge snapshot --check` matches (`.gas-snapshot` committed).

## Invariants (all present + passing; `test/*.invariant.t.sol`)

| Contract | Invariants |
|---|---|
| Passport | `invariant_NoTransfersEver` (soulbound), `invariant_BalanceAtMostOne`, `invariant_HasPassportMatchesBalance` (citizen-flag consistency), `invariant_TotalSupplyEqualsCitizens` |
| CryptToken | `invariant_BalancesSumToSupply`, `invariant_TotalSupplyLeCap` |
| Governance | `invariant_NoDoubleVote`, `invariant_TallyLeCitizens`, `invariant_NoExecuteBeforeDelay` |
| Distributor | `invariant_NoDoubleClaim`, `invariant_SolvencyBacked` (remainingUnclaimed*perCitizen ≤ balance) |
| Treasury | `invariant_OutflowsLeInflows`, `invariant_EthConservation`, `invariant_NonGovCannotReduceBalance` |
| Staking | `invariant_TotalStakedEqualsSum`, `invariant_PrincipalCovered`, `invariant_ClaimedLeReserve`, `invariant_OwedRewardsBackedByFunding` |

Each runs 256 (governance 196) fuzz runs × ~128k calls with 0 assertion failures.

## Coverage

`forge coverage --ir-minimum --report summary` — 100% line for 5/7 src files; Governance 98.82%; CryptToken
86.67% is an `--ir-minimum` instrumentation artifact (the two "uncovered" lines are `_pause()`/`_unpause()`,
provably executed — see `audit/triage.md`). Plain coverage errors with `Stack too deep` on the Governance
struct getter; per the plan's fallback the suite is fully green and these are the accurate obtainable
numbers. Full breakdown + per-line explanation in `contracts/audit/triage.md`.

## Static analysis

- **solhint** (`npx solhint 'src/**/*.sol'`): **0 errors, 369 warnings** — all natspec/style/gas-hint;
  triaged in `audit/triage.md`.
- **slither** (`slither . --filter-paths "lib/|test/|script/"`): **16 findings, all low/informational** — no
  high or medium security defect; every finding triaged (false-positive or accepted-by-design) in
  `audit/triage.md`.

Both tools WERE available/installable in this environment (slither via `pip install slither-analyzer`,
solhint via `npx`) and were run.

## Local anvil deploy dry-run (assistant scope)

Started `anvil`, ran `Deploy.s.sol:Deploy` with anvil's default dev key (throwaway, local only) →
all six contracts deployed + configured atomically; on-chain wiring verified with `cast`
(treasury holds 100,000,000 $CRYPT; distributor holds MINTER_ROLE). `SeedGenesis.s.sol` genesis-minted
2 citizens; `Configure.s.sol` simulated cleanly. anvil stopped; `broadcast/` git-ignored (not committed).

## Deploy BOUNDARY honored

No real private key (only the public anvil default `0xac09…`), no real RPC URL, no Sepolia/mainnet
broadcast, no funding with real value anywhere in `script/` or `test/`. **"Deployed & verified on Base
Sepolia" and "fork tests against live addresses" are USER-run follow-ups, not assistant-executed (spec
§8.3 boundary).** See `DEPLOY_RUNBOOK.md`.

## App-side gate + LEGAL markers

- No app/TS files changed this wave (only `contracts/**`, `.github/workflows/foundry.yml`, `.gitmodules`,
  and `docs/superpowers/**`).
- `// LEGAL:` markers present at the token/dividend/treasury boundaries: `CryptToken.sol` (mint/supply),
  `DividendDistributor.sol` (openEpoch/claim), `CryptTreasury.sol` (disburse/fundDividends), plus Passport.
- CI: `.github/workflows/foundry.yml` extended with `forge coverage --ir-minimum` + slither + solhint
  (slither/solhint `continue-on-error`, local triage authoritative). `web.yml` untouched.

## Security fixes baked in (per plan)

Passport `burn` override (burnEnabled + hasPassport bookkeeping); Synthetix `rewardPerToken` accumulator so
`setApr` is prospective; witness `nameHash` binding; `requiredWitnesses` default 7 + `WitnessMintDisabled`
guard; atomic pull-based `openEpoch`/`fundDividends`; governance `executionDelay` + `minCitizensForProposal`
floor; treasury ETH-conservation invariant; passport `DOMAIN_SEPARATOR()` view.

## USER follow-ups

Base Sepolia deploy + Basescan verification + fork tests, then Base mainnet deploy (after the Pre-Mainnet
Gate: third-party audit + legal sign-off), all documented step-by-step in `contracts/docs/DEPLOY_RUNBOOK.md`.
Wave 5 (citizenship + mint UI) and Wave 6 (wallet screen) wire these ABIs into the app via `config/tokens.ts`
+ `lib/wallet/*` (filled from `broadcast/<chainId>/` JSON after the user's deploy).
