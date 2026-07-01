# CryptRepublic Contracts — Deploy Runbook (USER steps)

This runbook documents how **you (the user)** deploy the CryptRepublic contract suite to Base Sepolia
(testnet) and, after the Pre-Mainnet Gate, to Base mainnet. It also records the design decisions an
operator needs to understand the wiring.

## Deploy boundary (read first)

The build assistant produces the contracts, scripts, tests, and this runbook, and validated everything
**locally**: `forge test` (unit + fuzz + invariant), `forge coverage`, and a **local `anvil` deploy +
configure + seed dry-run** using anvil's throwaway default dev key. The assistant **never**:

- holds or requests private keys / seed phrases,
- deploys to Base Sepolia or mainnet,
- funds the treasury / distributor / staking with real value,
- signs or broadcasts a real-value transaction.

**Wave 4 assistant-scope acceptance** = green suite + coverage gate met + slither/solhint clean-or-triaged
+ local anvil dry-run green. **"Deployed & verified on Base Sepolia" and "fork tests green against live
addresses" are USER steps below**, run with your own keys, faucet ETH, and RPC/explorer keys.

## Contracts (deploy order)

`CryptToken` → `CryptRepublicPassport` → `CryptGovernance` → `CryptTreasury` → `DividendDistributor` →
`CryptStaking`, then `Configure.s.sol` wires roles.

### Deploy-order caveat (Token ↔ Treasury mutual reference)

`CryptToken` and `CryptTreasury` are mutually referential: the token mints its initial supply to a holder,
and the treasury takes the token as a constructor `immutable` (so `fundDividends` can approve + open a
dividend epoch atomically in `$CRYPT`). `Deploy.s.sol` breaks the cycle by:

1. minting the genesis supply (`100,000,000 $CRYPT`, cap `1,000,000,000`) to **`admin`**;
2. deploying `CryptTreasury` with the token address;
3. `Configure.s.sol` (or the atomic path in `Deploy` when broadcaster == admin) then **transfers the
   genesis supply `admin` → treasury** — functionally the spec's intent (token held by treasury after
   genesis).

The `DeployTest` asserts `token.balanceOf(treasury) == 100_000_000e18` after `configure`.

## Roles wired by `Configure.s.sol`

- `MINTER_ROLE` (CryptToken) → `DividendDistributor` + `CryptStaking`
- `PAUSER_ROLE` (CryptToken) → `admin`
- `GOVERNANCE_ROLE` (CryptTreasury) → `CryptGovernance`
- `FUNDER_ROLE` (DividendDistributor) → `CryptTreasury` + `admin`
- `REWARDS_ADMIN_ROLE` (CryptStaking) → `admin`
- `PASSPORT_ADMIN_ROLE` + `GENESIS_ATTESTOR_ROLE` (Passport) → `admin`
- `Passport.setRequiredWitnesses(7)`; `Governance.setTargetAllowed(treasury, true)`

On a **live network** all admin/config roles then move to the **Safe multisig + `TimelockController`**
(48h delay) and the deployer EOA renounces its powers (see step 5 below).

## Design decisions an operator must know

### Governance execution timelock (treasury-drain gate)

The treasury-drain timelock lives **inside `CryptGovernance`** via `executionDelay` (deployed at `2 days`):
a passed proposal is `State.Queued` until `block.timestamp >= end + executionDelay`, only then
`State.Succeeded`/executable; `execute` reverts `TimelockNotElapsed` before the delay. Combined with
`minCitizensForProposal` (deployed at `3`, floor ≥1), a 1- or 2-citizen republic cannot instantly
self-pass and drain the treasury.

- **Chosen model:** in-Governance `executionDelay` (the simpler standard topology).
- **Alternative:** Governor + OZ `TimelockController` holding `GOVERNANCE_ROLE` on the treasury (the
  Timelock enforces the delay). Either satisfies the "passing proposal + timelock" requirement.
- On a live net, privileged **config** changes (role grants, APR, quorum, allocations) ALSO route through
  the Safe + `TimelockController` as defense-in-depth.

### Dividend funding model (atomic, pull-based)

`Treasury.fundDividends(distributor, amount)` does `crypt.forceApprove(distributor, amount)` then
`distributor.openEpoch(amount)` in the SAME tx; `openEpoch` **PULLS** the funds via
`crypt.safeTransferFrom(msg.sender, address(this), amount)`. So funding and epoch-open can never desync,
and an epoch is never opened for more than the deposited amount — every epoch is fully token-backed
(`remainingUnclaimed * perCitizen <= crypt.balanceOf(distributor)` holds by construction). Integer-division
dust stays in the distributor (favoring the protocol). Event: `DividendsFunded(distributor, amount, epochId)`.
The admin Safe (also holding `FUNDER_ROLE`) can open epochs directly by approving + calling `openEpoch`.

### Staking APR is genuinely prospective

`CryptStaking` uses a Synthetix-style `rewardPerToken` accumulator. `setApr` checkpoints the accumulator
at the OLD rate FIRST, so already-elapsed time is locked at the old rate and only future time uses the new
rate — for ALL stakers, not just recently-active ones. Payouts are capped at `rewardPoolRemaining`
(funded reserve), so the reward pool can never go insolvent and never eats staked principal.

### Soulbound passport

Transfers/approvals revert (`Soulbound`); only mint and burn are allowed. `burn`/`renounce` require
`burnEnabled` and clear `hasPassport` so the citizen flag can never desync from the token
(`hasPassport[a] == (balanceOf(a) == 1)` always holds). `tokenId` == sequential citizen number;
`totalCitizens()` is a monotonic counter (does not decrement on burn).

---

## USER — local dry-run (reproduce the assistant's validation)

```bash
cd contracts
anvil &                      # local node on 127.0.0.1:8545
forge script script/Deploy.s.sol:Deploy \
  --rpc-url http://127.0.0.1:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --broadcast -vvv          # anvil default account #0 — LOCAL ONLY, never a real key
# addresses are logged; broadcast/<chainId>/ JSON is written (git-ignored)
pkill anvil
```

## USER — Base Sepolia (testnet)

Prereqs: faucet ETH on Base Sepolia in your deployer/signer accounts, a Base Sepolia RPC, a Basescan API
key, and a hardware wallet / keystore (never a raw key in a repo file).

```bash
export BASE_SEPOLIA_RPC=...        # your RPC endpoint
export ETHERSCAN_API_KEY=...       # Basescan key for --verify
# Deploy (deployer == admin runs configure atomically; or split with Configure.s.sol below):
forge script script/Deploy.s.sol:Deploy \
  --rpc-url $BASE_SEPOLIA_RPC --broadcast --verify --account <keystore-or-ledger>

# If admin is a Safe (deploy and configure are separate txns), set the deployed addresses and run:
export CRYPT_TOKEN=0x... PASSPORT=0x... GOVERNANCE=0x... TREASURY=0x... DISTRIBUTOR=0x... STAKING=0x...
export ADMIN=0x<safe-or-admin>
forge script script/Configure.s.sol:Configure \
  --rpc-url $BASE_SEPOLIA_RPC --broadcast --account <keystore>

# Seed genesis citizens (broadcaster must hold GENESIS_ATTESTOR_ROLE):
export SEED_CITIZENS=0xaaa...,0xbbb...,0xccc...
forge script script/SeedGenesis.s.sol:SeedGenesis \
  --rpc-url $BASE_SEPOLIA_RPC --broadcast --account <keystore>
```

After seeding:

- **Revoke `GENESIS_ATTESTOR_ROLE`** (`passport.revokeRole(GENESIS_ATTESTOR_ROLE, seeder)`) so no further
  zero-witness bootstrap mints are possible — this is time-boxed by policy.
- Publish the verified `broadcast/<chainId>/run-latest.json` addresses into the app's
  `config/addresses.testnet.ts` (Wave 5/6 integration; a user step).

### Fork tests (once live addresses exist)

Fork tests against a live deployment are scaffolded as a documented follow-up and are **skipped** unless a
`BASE_SEPOLIA_RPC` env var + real deployed addresses exist (they do not yet). Run them with:

```bash
forge test --fork-url $BASE_SEPOLIA_RPC --match-path 'test/**/*fork*'
```

They are not required-green in this wave.

## USER — Base mainnet (Pre-Mainnet Gate REQUIRED)

**Do NOT proceed until the Pre-Mainnet Gate is satisfied: a full third-party audit AND written legal
sign-off on token characterization (`$CRYPT` is very likely a regulated security — see `// LEGAL:` markers
and spec §10.1), KYC/AML, and MSB/money-transmission posture.**

The mainnet steps mirror spec §8.3 (user-only):

1. **Obtain funds** — ETH on Base mainnet in deployer/signer accounts.
2. **Prepare config** — `.env.mainnet`; `NEXT_PUBLIC_CHAIN_ENV=mainnet`, mainnet RPC + explorer key; no
   private key in any repo file (hardware wallet / `cast wallet` / keystore reference); confirm no testnet
   addresses remain.
3. **Deploy** — `forge script script/Deploy.s.sol --rpc-url $BASE_MAINNET_RPC --broadcast --verify --ledger`
   (or `--account <keystore>`) in the order above, then `Configure.s.sol`.
4. **Verify** on Basescan (`--verify` / `forge verify-contract`); confirm source + constructor args; publish
   addresses.
5. **Transfer/renounce roles** — move admin/minter/attestor/treasury/governance/funder/rewards-admin roles
   to the Safe + `TimelockController`; renounce the deployer EOA; time-box + revoke the genesis attestor;
   confirm no single EOA can drain the treasury or mint passports.
6. **Set app config to mainnet** — paste verified addresses into `config/addresses.mainnet.ts`, set
   `NEXT_PUBLIC_CHAIN_ENV=mainnet`, deploy the app, confirm live reads + no testnet banners.
7. **Fund treasury / distributor / staking** — after legal sign-off, transfer real funds / `$CRYPT` via the
   multisig with explicit confirmation. `// LEGAL:` markers at the token mint, dividend open/claim, and
   treasury disburse/fund boundaries must survive into the mainnet code.
8. **Smoke & monitor** — one real end-to-end pass (apply → mint → small transfer → vote → claim); set
   monitoring/alerting on treasury + role events; keep the pause/rollback + incident-response plan at hand.

At every step the assistant may prepare, explain, and dry-run against testnet — but mainnet execution and
all signatures are the user's.

## Upgradeability

All six v1 contracts are **non-upgradeable** (no proxy, no `initialize()`, constructors only). Logic changes
ship as a new version + governance migration + frontend re-point. If a future contract genuinely needs UUPS,
it must be justified here and gated by the Safe behind a `TimelockController` with an initializer guard +
storage gap — v1 uses none of that.
