# CryptRepublic Wave 4 — Smart Contracts — Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL — before touching code, load `superpowers:test-driven-development` and `superpowers:subagent-driven-development` (or `superpowers:executing-plans`) to implement this plan task-by-task. Every task below is Foundry-style TDD: write the failing test FIRST, run `forge test` and SEE it fail (compile error counts as a fail only for the very first sanity task — thereafter the contract skeleton must compile so the *assertion* fails), implement the real Solidity, run `forge test` and SEE it pass, then `forge fmt` and commit. No step may be skipped or reordered. NEVER invent an OpenZeppelin or forge-std API: where a task uses OZ v5 (`ERC20`, `ERC20Permit`, `ERC20Pausable`, `ERC721`, `ERC721Burnable`, `AccessControl`, `ReentrancyGuard`, `EIP712`, `ECDSA`, `MessageHashUtils`, `Nonces`, `SafeERC20`, `TimelockController`) or forge cheatcodes (`vm.sign`, `vm.warp`, `vm.expectRevert`, `vm.prank`, `vm.startPrank`, `makeAddrAndKey`, `bound`, `targetContract`, `invariant_*`), FIRST verify the EXACT installed API surface by reading the file under `contracts/lib/openzeppelin-contracts/contracts/**` or `contracts/lib/forge-std/src/**` before writing code against it. OZ v5 changed many signatures vs v4 (e.g. `_update` replaced `_beforeTokenTransfer`; `AccessControl` errors are custom, not string reverts; `Ownable`/`ERC20` constructors take args). Match the exact signatures in each task's **Interfaces** block.

**Goal.** Deliver Wave 4 of spec §9: a complete Foundry smart-contract suite for CryptRepublic — `CryptToken` ($CRYPT ERC-20), `CryptRepublicPassport` (soulbound ERC-721 with EIP-712 witness attestation + genesis bootstrap), `CryptGovernance` (passport-gated one-citizen-one-vote), `CryptTreasury` (governance-gated disbursement), `DividendDistributor` (equal per-citizen epoch dividends), and `CryptStaking` (APR reward accrual) — plus a reusable EIP-712 witness-verification library, deploy/configure/seed scripts, and a full unit + fuzz + invariant test suite meeting the coverage gate. Everything is validated LOCALLY (`forge test`, `forge coverage`, a local `anvil` deploy dry-run). The real Base Sepolia / mainnet deploy is a DOCUMENTED USER STEP — the assistant NEVER deploys with real funds, holds keys, or broadcasts a real-value transaction.

**Architecture.** Six immutable (non-upgradeable), independently-deployed contracts wired together by roles, not inheritance. Identity is the primitive: `CryptRepublicPassport` issues a soulbound ERC-721 whose `tokenId` equals a sequential citizen number; every downstream civic mechanism keys off passport `tokenId` (governance votes, dividend claims) so Sybil resistance and "1 citizen = 1 share" are enforced by the passport, not by token balances. `CryptToken` is a capped-mint ERC-20 whose `MINTER_ROLE` is held only by `DividendDistributor` + `CryptStaking` (and optionally `Treasury`); the Treasury holds real value and disburses ONLY under a passing governance proposal routed through `GOVERNANCE_ROLE`. Access control is OZ `AccessControl` everywhere; `DEFAULT_ADMIN_ROLE` is a Safe multisig on any live network (an EOA only in local tests). All value-moving paths use checks-effects-interactions + `ReentrancyGuard` + `SafeERC20`. EIP-712 domains bind `chainId` + `verifyingContract`; nonces + deadlines + no-self-attest + no-duplicate-witness prevent replay. Every state change emits an indexed event so the Wave 7 backend indexer derives all dashboard stats.

**Tech Stack.** Solidity `0.8.28` (pinned in `contracts/foundry.toml`, `solc_version = "0.8.28"`); Foundry (`forge`/`cast`/`anvil`); OpenZeppelin Contracts v5.x (installed this wave as a git submodule under `contracts/lib/openzeppelin-contracts`, remapped in `foundry.toml`); `forge-std` (already a submodule under `contracts/lib/forge-std`). Optimizer on, `optimizer_runs = 200`. `forge fmt` with `line_length = 100`. Static analysis: `slither` + `solhint` (CI-optional / local gate, wired in Task 9). Target chains: Base (mainnet) / Base Sepolia (testnet) — no hardcoded chain assumptions; addresses come from `broadcast/<chainId>/` JSON.

---

## Global Constraints

Copy these verbatim into every reviewer's head. Violating any one fails CI, the coverage gate, or the security posture. Values are lifted directly from spec §6.0–6.9, §8.1–8.3, and the Wave 4 LOCKED DECISIONS.

- **The deploy BOUNDARY (spec §8.3, §6.9 — the single most important constraint).** The assistant WRITES contracts + scripts + tests and validates them LOCALLY ONLY: `forge test`, `forge coverage`, and a local `anvil` deployment dry-run. The assistant NEVER deploys to Base Sepolia or mainnet with real funds, NEVER holds or requests private keys / seed phrases, NEVER funds treasury/distributor/staking with real money, and NEVER signs or broadcasts a real-value transaction. **Wave 4 acceptance is REFRAMED from spec §9:** the spec's Wave 4 row says "deployed & verified on Base Sepolia" and "contracts verified on Base Sepolia; fork tests green against live addresses" — these are RE-SCOPED to a DOCUMENTED USER STEP. Wave 4 is DONE when: (1) all six contracts + the witness lib compile and `forge test` is fully green; (2) all invariants pass; (3) `forge coverage` meets ≥95% line / ≥90% branch on every `src/*.sol`; (4) `slither` + `solhint` are clean or every finding is triaged in `contracts/audit/triage.md`; (5) `forge fmt --check` passes; (6) `Deploy.s.sol` + `Configure.s.sol` + `SeedGenesis.s.sol` run green against a LOCAL `anvil` node (dry-run, throwaway anvil default key). Task 9 also UPDATES the spec §9 Wave 4 acceptance row and adds an explicit note that "deployed on Base Sepolia" + "fork tests against live addresses" are user-run follow-ups documented in the runbook (`contracts/docs/DEPLOY_RUNBOOK.md`), not assistant-executed steps. Fork tests (`--fork-url $BASE_SEPOLIA_RPC`) are written but SKIPPED in CI/local unless a `BASE_SEPOLIA_RPC` env var + real deployed addresses exist (they don't yet) — they are scaffolded and documented, not required-green this wave.
- **OpenZeppelin Contracts v5 (LOCKED).** Install via `forge install OpenZeppelin/openzeppelin-contracts@v5.1.0` (or the latest v5.x tag — verify the tag exists; pin an exact tag, not a floating branch) as a git submodule into `contracts/lib/openzeppelin-contracts`. Remap in `contracts/foundry.toml` (NOT a separate `remappings.txt`, to match the existing single-file config): `@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/`. Verify the exact v5 API before use — v5 differs from v4: `_update(address to, uint256 tokenId, address auth)` is the SINGLE ERC-721 transfer hook (no `_beforeTokenTransfer`); `ERC20`/`ERC721`/`Ownable` constructors take arguments; `AccessControl` reverts with custom errors (`AccessControlUnauthorizedAccount`), not strings; `ECDSA.recover` + `MessageHashUtils.toTypedDataHash` (or `EIP712._hashTypedDataV4`); `Nonces._useNonce`/`nonces`; `SafeERC20.safeTransfer`/`safeTransferFrom`; `ReentrancyGuard` `nonReentrant`.
- **solc 0.8.28 (LOCKED).** Every `src/`, `test/`, `script/` file starts with `// SPDX-License-Identifier: MIT` then `pragma solidity 0.8.28;` (PINNED, not `^0.8.x`) for production `src/` files; test/script files may use `pragma solidity ^0.8.28;` if a forge-std helper requires it — prefer the exact pin. Delete the `Counter.sol` + `Counter.t.sol` scaffold (Task 1). Solidity 0.8.x has checked arithmetic by default — rely on it; only use `unchecked` with an explicit justifying comment where overflow is provably impossible (e.g. loop counters).
- **Immutable / non-upgradeable (LOCKED, spec §6.8).** All six v1 contracts are non-upgradeable — NO proxy, NO `initialize()`, constructors only. Logic changes ship as a new version + governance migration + frontend re-point. If any future contract needs UUPS, it must be justified in `contracts/docs/DEPLOY_RUNBOOK.md` and gated by the Safe behind a `TimelockController` with an initializer guard + storage gap — but v1 uses NONE of that. Prefer `immutable` for constructor-set addresses (`passport`, `crypt`, `MAX_SUPPLY`).
- **Access control = OZ AccessControl roles (LOCKED, spec §6.1). Roles matrix (documented + tested):**
  | Role | `bytes32` constant | Held by (live) | Powers |
  |---|---|---|---|
  | `DEFAULT_ADMIN_ROLE` | OZ built-in `0x00` | User Safe multisig (EOA in tests) | Grant/revoke roles, set config, pause |
  | `GENESIS_ATTESTOR_ROLE` (Passport) | `keccak256("GENESIS_ATTESTOR_ROLE")` | User Safe early; **revoked after genesis** | Bootstrap-mint first citizens with NO witness sigs |
  | `PASSPORT_ADMIN_ROLE` (Passport) | `keccak256("PASSPORT_ADMIN_ROLE")` | User Safe | Set `requiredWitnesses`, `baseURI`, `burnEnabled`, `adminMint` |
  | `MINTER_ROLE` (CryptToken) | `keccak256("MINTER_ROLE")` | `DividendDistributor`, `CryptStaking` (optionally `Treasury`) | Mint `$CRYPT` within cap |
  | `PAUSER_ROLE` (CryptToken) | `keccak256("PAUSER_ROLE")` | User Safe | Pause/unpause transfers (emergency only) |
  | `GOVERNANCE_ROLE` (Treasury) | `keccak256("GOVERNANCE_ROLE")` | `CryptGovernance` contract | Authorize disbursements + `fundDividends` |
  | `FUNDER_ROLE` (DividendDistributor) | `keccak256("FUNDER_ROLE")` | `CryptTreasury`, User Safe | Open/fund dividend epochs |
  | `REWARDS_ADMIN_ROLE` (Staking) | `keccak256("REWARDS_ADMIN_ROLE")` | User Safe | Set APR, fund reward pool |
  Roles are `bytes32 public constant` exposed publicly. `GENESIS_ATTESTOR_ROLE` is time-boxed/renounceable + event-logged (every genesis mint emits `CitizenMinted`; role revocation via standard `AccessControl.revokeRole` emits `RoleRevoked`). All privileged setters emit events. On a live network all admin roles route through a `TimelockController` owned by the Safe (48h delay) — the Timelock is deployed/wired in `Configure.s.sol` for testnet/mainnet but tests may use a direct EOA admin.
- **Security invariants + patterns (LOCKED, spec §6.x, §8.2).** Checks-Effects-Interactions on EVERY value-moving function; OZ `ReentrancyGuard` `nonReentrant` on ALL payout/withdraw/claim/disburse/execute paths; OZ `SafeERC20` for all ERC-20 transfers; state flags set BEFORE external calls (mark-claimed / mark-executed first). Checked math with rounding FAVORING the protocol (integer-division dust stays in the contract — e.g. dividend `perCitizen = amount / snapshotCitizens`, remainder rolls to next epoch). An indexed EVENT for EVERY state change (indexer depends on it). EIP-712 domain binds `chainId` + `verifyingContract` (via OZ `EIP712` constructor `EIP712(name, version)` which captures both). Guard against: passport double-vote, dividend double-claim, witness self-attestation, duplicate witnesses, signature replay (nonce + deadline), staking reward-pool insolvency, treasury over-disbursement.
- **Invariants the test suite MUST include (LOCKED, spec §8.1) — each is a `invariant_*` fn in a `*.invariant.t.sol` handler-based suite:**
  - Passport: **soulbound — number of successful transfers == 0 for all inputs/all time**; `balanceOf(any) <= 1`; `totalSupply() == totalCitizens()` (citizen count).
  - CryptToken: `sum(balances) == totalSupply()`; `totalSupply() <= MAX_SUPPLY`.
  - Governance: **one-citizen-one-vote / no double vote** (a given `tokenId` votes at most once per proposal; `forVotes+againstVotes+abstainVotes <= snapshotCitizens`).
  - DividendDistributor: **no double-claim**; `sum(claims for epoch) <= epoch.amount` (epoch funding).
  - Treasury: balance never negative (trivially true for `uint`, but assert `sum(outflows) <= sum(inflows)` per asset + only-`GOVERNANCE_ROLE` spends).
  - Staking: principal recoverable (`sum(userStakes) == totalStaked`); rewards paid `<=` funded reserve (`rewardPoolRemaining` never underflows / total rewards `<=` total funded).
- **Coverage + gas gate (LOCKED, spec §8.1).** `forge coverage` ≥ 95% line AND ≥ 90% branch on every `src/*.sol`. Run `forge coverage --report summary` and fail the wave if any `src/` file is below the gate. `forge snapshot` produces `.gas-snapshot`; `forge snapshot --check` guards gas regressions (committed after Task 8). `slither .` + `solhint 'src/**/*.sol'` clean or every finding triaged in `contracts/audit/triage.md`. `forge fmt --check` must pass (line_length 100).
- **`// LEGAL:` markers (LOCKED, spec §10).** Place a `// LEGAL:` comment at the token/dividend/treasury boundaries: at `CryptToken`'s mint/supply (token characterization), at `DividendDistributor`'s `openEpoch`/`claim` (dividend = likely security), and at `CryptTreasury`'s `disburse`/`fundDividends` (payout/MSB boundary). Each marker states the flag in one line and points to spec §10.1. No real economic value is created on a testnet; these markers must survive into any mainnet code.
- **Deploy scripts + local validation (LOCKED, spec §6.9).** `script/Deploy.s.sol` deploys in order `CryptToken → CryptRepublicPassport → CryptGovernance → CryptTreasury → DividendDistributor → CryptStaking`. `script/Configure.s.sol` wires roles (`MINTER_ROLE` → Distributor + Staking; `GOVERNANCE_ROLE` → Governance on Treasury; `FUNDER_ROLE` → Treasury on Distributor), sets `requiredWitnesses`, and (on live nets) transfers admin to the Timelock/Safe. `script/SeedGenesis.s.sol` genesis-mints seed citizens. All three are validated by running against a LOCAL `anvil` node using anvil's default unlocked dev key (`--broadcast --rpc-url http://127.0.0.1:8545 --private-key <anvil-default-0>`), NEVER a real key. A Deploy test (`test/Deploy.t.sol`) runs the scripts in-process via `vm` and asserts the wiring.
- **App-side compatibility (spec §2.4, §5.9 — do NOT wire this wave).** The ABIs the app reads must be STANDARD so `lib/wallet/*` (viem) and `config/tokens.ts` / `config/chains.config.ts` can consume them in Waves 5/6. Keep `CryptToken` a standard ERC-20 (`balanceOf`, `transfer`, `decimals`, `symbol`, `name`, `totalSupply`, `Transfer`/`Approval` events) + ERC20Permit. Keep `CryptRepublicPassport` a standard ERC-721 (`ownerOf`, `balanceOf`, `tokenURI`, `Transfer` event on mint/burn). Do NOT edit any TS/app file this wave — the app integration is Wave 5/6. The typed placeholders in `config/tokens.ts` are filled AFTER deploy from `broadcast/<chainId>/` JSON (a user step).
- **Conventions (match the existing Foundry scaffold + Waves 1–3).** Files: `contracts/src/{CryptToken,CryptRepublicPassport,CryptGovernance,CryptTreasury,DividendDistributor,CryptStaking}.sol`, `contracts/src/lib/{Roles,WitnessAttestation}.sol`, `contracts/src/interfaces/{IPassport,ICryptToken}.sol`; tests `contracts/test/*.t.sol`; scripts `contracts/script/*.s.sol`. Roles are `bytes32 public constant NAME = keccak256("NAME")`. All `$CRYPT` math is 18-decimal fixed point. Run `forge fmt` before EVERY commit; CI runs `forge fmt --check`. Per-task commits (from inside `contracts/` or repo root — commit only `contracts/**` and CI/docs files this wave; do NOT touch app TS) ending with the trailer:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```
- **CI gate (`.github/workflows/foundry.yml`).** The existing job runs (in `contracts/`): `forge fmt --check` → `forge build` → `forge test -vvv`. Task 9 EXTENDS it with `forge coverage --report summary` (with the ≥95%/≥90% gate) and a `slither`/`solhint` step (documented as CI-optional if the runner cannot install them, with the local gate authoritative). Keep the app-side gate (`.github/workflows/web.yml` — `pnpm test`/`build`) UNTOUCHED and green: no TS/app files change this wave. `.gitignore` already ignores `contracts/out`, `cache`, `broadcast` — do NOT commit build artifacts or broadcast logs.
- **Version floors.** solc `0.8.28` (exact). OZ Contracts `v5.x` (pin the exact tag). Do NOT bump forge-std. Verify every external API against the installed submodule source before writing code against it.

---

## File Structure (created/modified this wave)

```
contracts/
├── foundry.toml                        # MODIFY: add remappings for openzeppelin-contracts
├── .gas-snapshot                       # CREATE (Task 8): forge snapshot output
├── lib/
│   ├── forge-std/                      # EXISTS (submodule)
│   └── openzeppelin-contracts/         # CREATE (Task 1): git submodule @ v5.x
├── src/
│   ├── Counter.sol                     # DELETE (Task 1)
│   ├── interfaces/
│   │   ├── IPassport.sol               # Task 4: minimal read interface (ownerOf/isCitizen/totalCitizens)
│   │   └── ICryptToken.sol             # Task 2: mint interface for Distributor/Staking
│   ├── lib/
│   │   ├── Roles.sol                   # Task 4/5/6/7/8: shared bytes32 role constants
│   │   └── WitnessAttestation.sol      # Task 3: EIP-712 witness-verification library
│   ├── CryptToken.sol                  # Task 2
│   ├── CryptRepublicPassport.sol       # Task 4
│   ├── CryptGovernance.sol             # Task 5
│   ├── CryptTreasury.sol               # Task 6
│   ├── DividendDistributor.sol         # Task 7
│   └── CryptStaking.sol                # Task 8
├── test/
│   ├── Counter.t.sol                   # DELETE (Task 1)
│   ├── Sanity.t.sol                    # Task 1: green sanity test proving OZ import compiles
│   ├── CryptToken.t.sol                # Task 2: unit + fuzz
│   ├── CryptToken.invariant.t.sol      # Task 2: invariants
│   ├── WitnessAttestation.t.sol        # Task 3: unit + fuzz
│   ├── CryptRepublicPassport.t.sol     # Task 4: unit + fuzz
│   ├── CryptRepublicPassport.invariant.t.sol  # Task 4: invariants + handler
│   ├── CryptGovernance.t.sol           # Task 5: unit + fuzz
│   ├── CryptGovernance.invariant.t.sol # Task 5: invariants + handler
│   ├── CryptTreasury.t.sol             # Task 6: unit + fuzz
│   ├── CryptTreasury.invariant.t.sol   # Task 6: invariants + handler
│   ├── DividendDistributor.t.sol       # Task 7: unit + fuzz
│   ├── DividendDistributor.invariant.t.sol    # Task 7: invariants + handler
│   ├── CryptStaking.t.sol              # Task 8: unit + fuzz
│   ├── CryptStaking.invariant.t.sol    # Task 8: invariants + handler
│   ├── Deploy.t.sol                    # Task 9: in-process deploy+configure wiring test
│   ├── mocks/
│   │   └── ReentrantToken.sol          # Task 6/7/8: malicious ERC-20 for reentrancy tests
│   └── helpers/
│       └── PassportHelper.sol          # Task 5/7: mint N citizens + EIP-712 sig helpers
├── script/
│   ├── Deploy.s.sol                    # Task 9
│   ├── Configure.s.sol                 # Task 9
│   └── SeedGenesis.s.sol               # Task 9
├── audit/
│   └── triage.md                       # Task 9: slither/solhint findings triage
└── docs/
    └── DEPLOY_RUNBOOK.md               # Task 9: Base Sepolia + mainnet USER runbook
.github/workflows/foundry.yml           # MODIFY (Task 9): add coverage gate + slither/solhint
docs/superpowers/specs/2026-07-01-cryptrepublic-network-state-design.md  # MODIFY (Task 9): reframe §9 Wave 4 acceptance
```

---

### Task 1: OZ v5 install, remappings, delete Counter scaffold, green sanity test

**Files:**
- Create: `contracts/lib/openzeppelin-contracts/` (git submodule)
- Modify: `contracts/foundry.toml`
- Delete: `contracts/src/Counter.sol`, `contracts/test/Counter.t.sol`
- Create/Test: `contracts/test/Sanity.t.sol`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: the remapping `@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/` that every later task imports; a green `forge test` baseline with no Counter scaffold.

- [ ] **Step 1: Verify forge is installed and the workspace builds today**

Run: `forge --version && forge build --root "/Users/justcurious/Desktop/CryptRepublic Web/contracts"`
Expected: forge version prints; build succeeds compiling `Counter.sol` (baseline before changes).

- [ ] **Step 2: Confirm the latest OZ v5 tag before pinning**

Run: `git ls-remote --tags https://github.com/OpenZeppelin/openzeppelin-contracts.git | grep -E 'refs/tags/v5\.[0-9]+\.[0-9]+$' | tail -5`
Expected: a list of v5 tags (e.g. `v5.0.2`, `v5.1.0`, `v5.2.0`, …). Pick the highest stable `v5.x` tag; use it verbatim in Step 3 (this plan writes `v5.1.0` — substitute the confirmed latest if higher).

- [ ] **Step 3: Install OpenZeppelin Contracts v5 as a submodule**

Run (from inside `contracts/`; `forge install` requires a git repo — the repo root IS a git repo per the project brief):
```bash
cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge install OpenZeppelin/openzeppelin-contracts@v5.1.0 --no-commit
```
Expected: `lib/openzeppelin-contracts/` populated; `.gitmodules` gains the submodule entry. If `--no-commit` is unknown on the installed forge version, run without it (newer forge no longer auto-commits). Verify: `ls contracts/lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol` exists.

- [ ] **Step 4: Add the OZ remapping to `foundry.toml`**

Modify `contracts/foundry.toml` to add a `remappings` key under `[profile.default]` (keeping existing keys):
```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
optimizer = true
optimizer_runs = 200
solc_version = "0.8.28"
remappings = [
    "@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/",
    "forge-std/=lib/forge-std/src/",
]

[fmt]
line_length = 100
```
(Explicitly listing the `forge-std/` remapping makes the config self-documenting even though forge auto-detects it.)

- [ ] **Step 5: Delete the Counter scaffold**

Run: `rm "/Users/justcurious/Desktop/CryptRepublic Web/contracts/src/Counter.sol" "/Users/justcurious/Desktop/CryptRepublic Web/contracts/test/Counter.t.sol"`

- [ ] **Step 6: Write the failing sanity test that imports OZ**

Create `contracts/test/Sanity.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

contract SanityTest is Test {
    function test_OZRemappingResolves() public pure {
        // Proves the OZ v5 remapping compiles and links.
        assertEq(Strings.toString(uint256(42)), "42");
    }
}
```

- [ ] **Step 7: Run the sanity test**

Run: `cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge test --match-contract SanityTest -vvv`
Expected: PASS (1 test). If the import cannot resolve, the remapping in Step 4 is wrong — fix and re-run. (This is the one task where "green immediately" is the goal — it proves the toolchain, not TDD logic.)

- [ ] **Step 8: Format and commit**

Run: `cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge fmt && forge fmt --check`
```bash
git add contracts/foundry.toml contracts/.gitmodules contracts/lib/openzeppelin-contracts contracts/test/Sanity.t.sol
git add -u contracts/src contracts/test   # stage the Counter deletions
git commit -m "chore(contracts): install OZ v5, add remappings, replace Counter scaffold

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: CryptToken — $CRYPT ERC-20 (capped mint, permit, pausable)

**Files:**
- Create: `contracts/src/CryptToken.sol`, `contracts/src/interfaces/ICryptToken.sol`
- Test: `contracts/test/CryptToken.t.sol`, `contracts/test/CryptToken.invariant.t.sol`

**Interfaces:**
- Consumes: OZ v5 `ERC20`, `ERC20Permit`, `ERC20Pausable`, `AccessControl`, `Nonces` (ERC20Permit uses Nonces internally in v5 — verify whether you must override `nonces` for the diamond; in v5, `ERC20Permit` extends `Nonces` so a contract mixing `ERC20Pausable` + `ERC20Permit` may need to override `_update` for the `ERC20Pausable`/`ERC20` linearization ONLY — verify the MRO by compiling).
- Produces (later tasks + app rely on these EXACT signatures):
  - `constructor(address admin, address treasury, uint256 initialSupply, uint256 maxSupply)`
  - `uint256 public immutable MAX_SUPPLY;`
  - `bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");`
  - `bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");`
  - `function mint(address to, uint256 amount) external;` (onlyRole MINTER_ROLE; reverts `CapExceeded` if `totalSupply()+amount > MAX_SUPPLY`)
  - `function pause() external;` / `function unpause() external;` (onlyRole PAUSER_ROLE)
  - standard ERC-20 (`balanceOf`, `transfer`, `approve`, `transferFrom`, `decimals`=18, `symbol`="CRYPT", `name`="CryptRepublic Token", `totalSupply`) + `permit` + `DOMAIN_SEPARATOR` + `nonces`.
  - `ICryptToken` interface exposing `mint(address,uint256)` + IERC20 for Distributor/Staking.

- [ ] **Step 1: Write `ICryptToken` interface**

Create `contracts/src/interfaces/ICryptToken.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ICryptToken is IERC20 {
    function mint(address to, uint256 amount) external;
    function MAX_SUPPLY() external view returns (uint256);
    function MINTER_ROLE() external view returns (bytes32);
}
```

- [ ] **Step 2: Write the failing unit tests**

Create `contracts/test/CryptToken.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CryptToken} from "../src/CryptToken.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

contract CryptTokenTest is Test {
    CryptToken internal token;
    address internal admin = makeAddr("admin");
    address internal treasury = makeAddr("treasury");
    address internal minter = makeAddr("minter");
    address internal alice = makeAddr("alice");

    uint256 internal constant INITIAL = 100_000_000e18;
    uint256 internal constant CAP = 1_000_000_000e18;

    function setUp() public {
        token = new CryptToken(admin, treasury, INITIAL, CAP);
        vm.prank(admin);
        token.grantRole(token.MINTER_ROLE(), minter);
    }

    function test_Metadata() public view {
        assertEq(token.name(), "CryptRepublic Token");
        assertEq(token.symbol(), "CRYPT");
        assertEq(token.decimals(), 18);
        assertEq(token.MAX_SUPPLY(), CAP);
    }

    function test_InitialSupplyToTreasury() public view {
        assertEq(token.totalSupply(), INITIAL);
        assertEq(token.balanceOf(treasury), INITIAL);
    }

    function test_MinterCanMintWithinCap() public {
        vm.prank(minter);
        token.mint(alice, 1e18);
        assertEq(token.balanceOf(alice), 1e18);
    }

    function test_NonMinterCannotMint() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, token.MINTER_ROLE()
            )
        );
        vm.prank(alice);
        token.mint(alice, 1e18);
    }

    function test_MintRevertsOverCap() public {
        vm.prank(minter);
        vm.expectRevert(CryptToken.CapExceeded.selector);
        token.mint(alice, CAP); // INITIAL already minted, so CAP more exceeds
    }

    function test_PauseBlocksTransfer() public {
        vm.prank(admin);
        token.grantRole(token.PAUSER_ROLE(), admin);
        vm.prank(admin);
        token.pause();
        vm.prank(treasury);
        vm.expectRevert(); // ERC20Pausable EnforcedPause
        token.transfer(alice, 1e18);
    }

    function test_Permit() public {
        (address owner, uint256 pk) = makeAddrAndKey("permitOwner");
        vm.prank(treasury);
        token.transfer(owner, 10e18);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                ),
                owner,
                alice,
                5e18,
                token.nonces(owner),
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        token.permit(owner, alice, 5e18, deadline, v, r, s);
        assertEq(token.allowance(owner, alice), 5e18);
    }
}
```

- [ ] **Step 3: Run tests to verify they fail (compile error — contract missing)**

Run: `cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge test --match-contract CryptTokenTest -vvv`
Expected: FAIL — `CryptToken` source not found / does not compile.

- [ ] **Step 4: Implement `CryptToken`**

Create `contracts/src/CryptToken.sol` (VERIFY the OZ v5 `_update` override signature + MRO by reading `lib/openzeppelin-contracts/contracts/token/ERC20/extensions/ERC20Pausable.sol`):
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Pausable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title CryptToken ($CRYPT)
/// LEGAL: A dividend-bearing $CRYPT is very likely a regulated security (spec §10.1).
/// LEGAL: Resolve token characterization + KYC/AML before ANY public mainnet distribution.
contract CryptToken is ERC20, ERC20Permit, ERC20Pausable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 public immutable MAX_SUPPLY;

    error CapExceeded();
    error ZeroAddress();

    constructor(address admin, address treasury, uint256 initialSupply, uint256 maxSupply)
        ERC20("CryptRepublic Token", "CRYPT")
        ERC20Permit("CryptRepublic Token")
    {
        if (admin == address(0) || treasury == address(0)) revert ZeroAddress();
        if (initialSupply > maxSupply) revert CapExceeded();
        MAX_SUPPLY = maxSupply;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        if (initialSupply > 0) _mint(treasury, initialSupply);
    }

    /// LEGAL: minting expands supply of a likely-security token; gate + audit before mainnet.
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        if (totalSupply() + amount > MAX_SUPPLY) revert CapExceeded();
        _mint(to, amount);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // Resolve the ERC20 / ERC20Pausable multiple-inheritance _update hook (OZ v5).
    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Pausable)
    {
        super._update(from, to, value);
    }
}
```
If the compiler complains about a `Nonces`/`nonces` conflict from `ERC20Permit`, read the installed `ERC20Permit.sol` — in v5 it inherits `Nonces` and exposes `nonces(address)`; only add an override if the compiler explicitly demands one.

- [ ] **Step 5: Run unit tests to verify they pass**

Run: `cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge test --match-contract CryptTokenTest -vvv`
Expected: PASS (all tests).

- [ ] **Step 6: Add fuzz tests to the same file**

Append to `CryptTokenTest`:
```solidity
    function testFuzz_MintNeverExceedsCap(uint256 amount) public {
        amount = bound(amount, 0, CAP - INITIAL);
        vm.prank(minter);
        token.mint(alice, amount);
        assertLe(token.totalSupply(), CAP);
    }

    function testFuzz_TransferConservesSupply(uint96 amount) public {
        uint256 amt = bound(uint256(amount), 0, INITIAL);
        uint256 supplyBefore = token.totalSupply();
        vm.prank(treasury);
        token.transfer(alice, amt);
        assertEq(token.totalSupply(), supplyBefore);
        assertEq(token.balanceOf(treasury) + token.balanceOf(alice), INITIAL);
    }
```

- [ ] **Step 7: Write the invariant suite**

Create `contracts/test/CryptToken.invariant.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CryptToken} from "../src/CryptToken.sol";

contract CryptTokenHandler is Test {
    CryptToken internal token;
    address internal minter;
    address[] internal actors;
    uint256 internal constant CAP = 1_000_000_000e18;

    constructor(CryptToken _token, address _minter) {
        token = _token;
        minter = _minter;
        actors.push(makeAddr("h1"));
        actors.push(makeAddr("h2"));
        actors.push(makeAddr("h3"));
    }

    function mint(uint256 who, uint256 amount) external {
        address to = actors[who % actors.length];
        amount = bound(amount, 0, CAP - token.totalSupply());
        vm.prank(minter);
        token.mint(to, amount);
    }

    function transfer(uint256 fromIdx, uint256 toIdx, uint256 amount) external {
        address from = actors[fromIdx % actors.length];
        address to = actors[toIdx % actors.length];
        amount = bound(amount, 0, token.balanceOf(from));
        vm.prank(from);
        token.transfer(to, amount);
    }

    function actorsList() external view returns (address[] memory) {
        return actors;
    }
}

contract CryptTokenInvariant is Test {
    CryptToken internal token;
    CryptTokenHandler internal handler;
    address internal admin = makeAddr("admin");
    address internal treasury = makeAddr("treasury");
    address internal minter = makeAddr("minter");

    function setUp() public {
        token = new CryptToken(admin, treasury, 0, 1_000_000_000e18);
        vm.prank(admin);
        token.grantRole(token.MINTER_ROLE(), minter);
        handler = new CryptTokenHandler(token, minter);
        targetContract(address(handler));
    }

    function invariant_TotalSupplyLeCap() public view {
        assertLe(token.totalSupply(), token.MAX_SUPPLY());
    }

    function invariant_BalancesSumToSupply() public view {
        address[] memory a = handler.actorsList();
        uint256 sum = token.balanceOf(treasury);
        for (uint256 i; i < a.length; i++) {
            sum += token.balanceOf(a[i]);
        }
        assertEq(sum, token.totalSupply());
    }
}
```

- [ ] **Step 8: Run the full CryptToken suite (unit + fuzz + invariant)**

Run: `cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge test --match-path 'test/CryptToken*' -vvv`
Expected: PASS all.

- [ ] **Step 9: Format and commit**

```bash
cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge fmt && forge fmt --check
git add contracts/src/CryptToken.sol contracts/src/interfaces/ICryptToken.sol contracts/test/CryptToken.t.sol contracts/test/CryptToken.invariant.t.sol
git commit -m "feat(contracts): CryptToken \$CRYPT ERC-20 (capped mint, permit, pausable)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: WitnessAttestation — EIP-712 witness-verification library

**Files:**
- Create: `contracts/src/lib/WitnessAttestation.sol`
- Test: `contracts/test/WitnessAttestation.t.sol`

**Interfaces:**
- Consumes: OZ v5 `ECDSA` (`ECDSA.recover(bytes32,bytes)`), `MessageHashUtils` (if needed) — but the digest is produced by the CALLING contract's `EIP712._hashTypedDataV4` in Task 4. This library is a PURE helper: it defines the struct + typehash + verification logic operating on a caller-supplied `domainSeparator` so the domain (chainId + verifyingContract) is bound by the caller. VERIFY `ECDSA.recover` returns `address` and reverts on malleable/invalid sigs in the installed v5.
- Produces (Task 4 relies on these EXACT signatures):
  - `struct Attestation { address applicant; bytes32 nameHash; uint256 nonce; uint256 deadline; }`
  - `bytes32 constant WITNESS_TYPEHASH = keccak256("Attestation(address applicant,bytes32 nameHash,uint256 nonce,uint256 deadline)");`
  - `function structHash(Attestation memory a) internal pure returns (bytes32);`
  - `function recoverWitness(bytes32 domainSeparator, Attestation memory a, bytes memory sig) internal pure returns (address);`

- [ ] **Step 1: Write the failing library tests**

Create `contracts/test/WitnessAttestation.t.sol`. Use a tiny harness contract that wraps the `internal` library fns so tests can call them, and build a real EIP-712 digest with a fixed domain separator:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {WitnessAttestation as WA} from "../src/lib/WitnessAttestation.sol";

contract WAHarness {
    function structHash(WA.Attestation memory a) external pure returns (bytes32) {
        return WA.structHash(a);
    }

    function recover(bytes32 ds, WA.Attestation memory a, bytes memory sig)
        external
        pure
        returns (address)
    {
        return WA.recoverWitness(ds, a, sig);
    }
}

contract WitnessAttestationTest is Test {
    WAHarness internal h;
    bytes32 internal constant DS = keccak256("test-domain-separator");

    function setUp() public {
        h = new WAHarness();
    }

    function _digest(WA.Attestation memory a) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", DS, WA.structHash(a)));
    }

    function test_RecoversCorrectSigner() public {
        (address witness, uint256 pk) = makeAddrAndKey("witness");
        WA.Attestation memory a = WA.Attestation({
            applicant: makeAddr("applicant"),
            nameHash: keccak256("Ada"),
            nonce: 0,
            deadline: block.timestamp + 1 hours
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _digest(a));
        address recovered = h.recover(DS, a, abi.encodePacked(r, s, v));
        assertEq(recovered, witness);
    }

    function test_WrongDomainRecoversDifferentSigner() public {
        (, uint256 pk) = makeAddrAndKey("witness");
        WA.Attestation memory a = WA.Attestation({
            applicant: makeAddr("applicant"),
            nameHash: keccak256("Ada"),
            nonce: 0,
            deadline: block.timestamp + 1 hours
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _digest(a));
        // Recover against a DIFFERENT domain separator -> must NOT equal the real witness.
        address recovered = h.recover(keccak256("other-domain"), a, abi.encodePacked(r, s, v));
        assertTrue(recovered != vm.addr(pk));
    }

    function testFuzz_SignatureRecovery(uint256 pkSeed, bytes32 nameHash, uint256 nonce) public {
        uint256 pk = bound(pkSeed, 1, type(uint128).max);
        WA.Attestation memory a = WA.Attestation({
            applicant: makeAddr("applicant"),
            nameHash: nameHash,
            nonce: nonce,
            deadline: block.timestamp + 1 hours
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _digest(a));
        assertEq(h.recover(DS, a, abi.encodePacked(r, s, v)), vm.addr(pk));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge test --match-contract WitnessAttestationTest -vvv`
Expected: FAIL — library not found.

- [ ] **Step 3: Implement the library**

Create `contracts/src/lib/WitnessAttestation.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title WitnessAttestation
/// @notice EIP-712 witness-attestation struct + signature recovery for passport minting.
/// @dev The caller (CryptRepublicPassport) supplies the EIP-712 domain separator, which binds
///      chainId + verifyingContract, so this pure library cannot be replayed across contracts/chains.
library WitnessAttestation {
    struct Attestation {
        address applicant;
        bytes32 nameHash;
        uint256 nonce;
        uint256 deadline;
    }

    bytes32 internal constant WITNESS_TYPEHASH =
        keccak256("Attestation(address applicant,bytes32 nameHash,uint256 nonce,uint256 deadline)");

    function structHash(Attestation memory a) internal pure returns (bytes32) {
        return keccak256(abi.encode(WITNESS_TYPEHASH, a.applicant, a.nameHash, a.nonce, a.deadline));
    }

    /// @dev Reverts on malleable/invalid signatures via OZ ECDSA.recover.
    function recoverWitness(bytes32 domainSeparator, Attestation memory a, bytes memory sig)
        internal
        pure
        returns (address)
    {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash(a)));
        return ECDSA.recover(digest, sig);
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge test --match-contract WitnessAttestationTest -vvv`
Expected: PASS.

- [ ] **Step 5: Format and commit**

```bash
cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge fmt && forge fmt --check
git add contracts/src/lib/WitnessAttestation.sol contracts/test/WitnessAttestation.t.sol
git commit -m "feat(contracts): EIP-712 WitnessAttestation library (domain-bound recovery)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: CryptRepublicPassport — soulbound ERC-721 (numbering, witness + genesis mint)

**Files:**
- Create: `contracts/src/CryptRepublicPassport.sol`, `contracts/src/interfaces/IPassport.sol`, `contracts/src/lib/Roles.sol`
- Test: `contracts/test/CryptRepublicPassport.t.sol`, `contracts/test/CryptRepublicPassport.invariant.t.sol`

**Interfaces:**
- Consumes: `WitnessAttestation` (Task 3); OZ v5 `ERC721`, `ERC721Burnable`, `AccessControl`, `EIP712`, `Nonces`, `ECDSA`. VERIFY the OZ v5 `_update(address to, uint256 tokenId, address auth) returns (address)` hook + `_hashTypedDataV4(bytes32) returns (bytes32)` + `Nonces._useNonce(address) returns (uint256)` + `nonces(address) returns (uint256)`.
- Produces (later tasks + app rely on these EXACT signatures):
  - `bytes32 public constant GENESIS_ATTESTOR_ROLE = keccak256("GENESIS_ATTESTOR_ROLE");`
  - `bytes32 public constant PASSPORT_ADMIN_ROLE = keccak256("PASSPORT_ADMIN_ROLE");`
  - `uint8 public requiredWitnesses;` (constructor DEFAULT = 7 — never 0; a 0 default opens a zero-witness self-mint window before Configure runs. `mintWithWitnesses` ALSO guards `if (requiredWitnesses == 0) revert WitnessMintDisabled();`) `bool public burnEnabled;`
  - `struct Citizen { bytes32 nameHash; bytes32 motto; bytes32 domicile; bool oathAccepted; uint64 mintBlock; }`
  - `mapping(uint256 => Citizen) public citizenOf;` `mapping(address => bool) public hasPassport;`
  - `function mintWithWitnesses(bytes32 nameHash, bytes32 motto, bytes32 domicile, bool oathAccepted, WitnessAttestation.Attestation[] calldata attestations, bytes[] calldata signatures) external returns (uint256 tokenId);` (each recovered witness's `Attestation.nameHash` MUST equal the minted `nameHash` — `require(attestations[i].nameHash == nameHash)` — so witnesses attest to WHO is being minted, not an arbitrary applicant record; see Major fix #3)
  - `function genesisMint(address to, bytes32 nameHash, bytes32 motto, bytes32 domicile) external returns (uint256 tokenId);` (onlyRole GENESIS_ATTESTOR_ROLE)
  - `function adminMint(address to, bytes32 nameHash, bytes32 motto, bytes32 domicile) external returns (uint256 tokenId);` (onlyRole PASSPORT_ADMIN_ROLE)
  - `function renounce(uint256 tokenId) external;` (self; only if burnEnabled)
  - `function burn(uint256 tokenId) public override;` (OVERRIDES `ERC721Burnable.burn` to run the SAME policy as `renounce` — see Blocker fix; the inherited public `burn` MUST NOT bypass the `burnEnabled` gate or leave `hasPassport` stale)
  - `function DOMAIN_SEPARATOR() external view returns (bytes32);` (mirrors the ERC20Permit convention; exposes `_domainSeparatorV4()` so the witness test helper at Step 6 + the frontend can build EIP-712 sigs)
  - `function totalCitizens() external view returns (uint256);` `function isCitizen(address who) external view returns (bool);`
  - `function setRequiredWitnesses(uint8 n) external;` `function setBaseURI(string calldata) external;` `function setBurnEnabled(bool) external;`
  - `IPassport` interface: `ownerOf`, `isCitizen`, `totalCitizens`, `balanceOf`.
  - `Roles` lib: shared `bytes32` constants used across contracts.

- [ ] **Step 1: Write the `Roles` library and `IPassport` interface**

Create `contracts/src/lib/Roles.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Shared AccessControl role identifiers (spec §6.1 roles matrix).
library Roles {
    bytes32 internal constant GENESIS_ATTESTOR_ROLE = keccak256("GENESIS_ATTESTOR_ROLE");
    bytes32 internal constant PASSPORT_ADMIN_ROLE = keccak256("PASSPORT_ADMIN_ROLE");
    bytes32 internal constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 internal constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 internal constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");
    bytes32 internal constant FUNDER_ROLE = keccak256("FUNDER_ROLE");
    bytes32 internal constant REWARDS_ADMIN_ROLE = keccak256("REWARDS_ADMIN_ROLE");
}
```
Create `contracts/src/interfaces/IPassport.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IPassport {
    function ownerOf(uint256 tokenId) external view returns (address);
    function balanceOf(address owner) external view returns (uint256);
    function isCitizen(address who) external view returns (bool);
    function totalCitizens() external view returns (uint256);
}
```

- [ ] **Step 2: Write failing unit tests (soulbound + numbering + genesis mint)**

Create `contracts/test/CryptRepublicPassport.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CryptRepublicPassport} from "../src/CryptRepublicPassport.sol";
import {WitnessAttestation as WA} from "../src/lib/WitnessAttestation.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

contract CryptRepublicPassportTest is Test {
    CryptRepublicPassport internal passport;
    address internal admin = makeAddr("admin");
    address internal genesis = makeAddr("genesis");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        passport = new CryptRepublicPassport(admin, "https://api.cryptrepublic.test/passport/");
        vm.startPrank(admin);
        passport.grantRole(passport.GENESIS_ATTESTOR_ROLE(), genesis);
        passport.grantRole(passport.PASSPORT_ADMIN_ROLE(), admin);
        passport.setRequiredWitnesses(3);
        vm.stopPrank();
    }

    function _genMint(address to) internal returns (uint256) {
        vm.prank(genesis);
        return passport.genesisMint(to, keccak256(abi.encode(to)), bytes32("motto"), bytes32("dom"));
    }

    function test_GenesisMintSequentialNumbering() public {
        uint256 id1 = _genMint(alice);
        uint256 id2 = _genMint(bob);
        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(passport.totalCitizens(), 2);
        assertEq(passport.ownerOf(1), alice);
        assertTrue(passport.isCitizen(alice));
    }

    function test_OnePassportPerAddress() public {
        _genMint(alice);
        vm.prank(genesis);
        vm.expectRevert(CryptRepublicPassport.AlreadyCitizen.selector);
        passport.genesisMint(alice, keccak256("x"), bytes32("m"), bytes32("d"));
    }

    function test_TransferReverts() public {
        _genMint(alice);
        vm.prank(alice);
        vm.expectRevert(CryptRepublicPassport.Soulbound.selector);
        passport.transferFrom(alice, bob, 1);
    }

    function test_ApproveReverts() public {
        _genMint(alice);
        vm.prank(alice);
        vm.expectRevert(CryptRepublicPassport.Soulbound.selector);
        passport.approve(bob, 1);
    }

    function test_SetApprovalForAllReverts() public {
        vm.prank(alice);
        vm.expectRevert(CryptRepublicPassport.Soulbound.selector);
        passport.setApprovalForAll(bob, true);
    }

    function test_NonGenesisCannotGenesisMint() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                alice,
                passport.GENESIS_ATTESTOR_ROLE()
            )
        );
        vm.prank(alice);
        passport.genesisMint(alice, keccak256("x"), bytes32("m"), bytes32("d"));
    }

    function test_RenounceOnlyWhenEnabled() public {
        _genMint(alice);
        vm.prank(alice);
        vm.expectRevert(CryptRepublicPassport.BurnDisabled.selector);
        passport.renounce(1);
        vm.prank(admin);
        passport.setBurnEnabled(true);
        vm.prank(alice);
        passport.renounce(1);
        assertFalse(passport.isCitizen(alice));
        // totalCitizens counter does NOT decrement (numbering monotonic); balanceOf drops to 0.
        assertEq(passport.balanceOf(alice), 0);
    }

    function test_TokenURI() public {
        _genMint(alice);
        assertEq(passport.tokenURI(1), "https://api.cryptrepublic.test/passport/1");
    }
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge test --match-contract CryptRepublicPassportTest -vvv`
Expected: FAIL — contract not found.

- [ ] **Step 4: Implement the passport (soulbound + numbering + genesis/admin mint)**

Create `contracts/src/CryptRepublicPassport.sol`. VERIFY OZ v5 `_update`/`_hashTypedDataV4`/`_useNonce` signatures against the installed source first:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Burnable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {WitnessAttestation as WA} from "./lib/WitnessAttestation.sol";
import {Roles} from "./lib/Roles.sol";

/// @title CryptRepublicPassport — soulbound ERC-721 (tokenId == sequential citizen number).
contract CryptRepublicPassport is ERC721, ERC721Burnable, AccessControl, EIP712, Nonces {
    using Strings for uint256;

    bytes32 public constant GENESIS_ATTESTOR_ROLE = Roles.GENESIS_ATTESTOR_ROLE;
    bytes32 public constant PASSPORT_ADMIN_ROLE = Roles.PASSPORT_ADMIN_ROLE;

    struct Citizen {
        bytes32 nameHash;
        bytes32 motto;
        bytes32 domicile;
        bool oathAccepted;
        uint64 mintBlock;
    }

    uint256 private _nextCitizenNumber = 1; // tokenId = citizen number, starts at 1
    uint8 public requiredWitnesses;
    string private _baseTokenURI;
    bool public burnEnabled;

    mapping(uint256 => Citizen) public citizenOf;
    mapping(address => bool) public hasPassport;

    error Soulbound();
    error AlreadyCitizen();
    error NotEnoughWitnesses();
    error DuplicateWitness();
    error SelfAttestation();
    error WitnessNotCitizen();
    error DeadlineExpired();
    error ArrayLengthMismatch();
    error BurnDisabled();
    error NotTokenOwner();
    error ZeroAddress();
    error WitnessMintDisabled();
    error NameHashMismatch();

    event CitizenMinted(uint256 indexed tokenId, address indexed citizen, bytes32 nameHash, uint64 mintBlock);
    event CitizenRenounced(uint256 indexed tokenId, address indexed citizen);
    event WitnessAttested(uint256 indexed tokenId, address indexed witness);
    event RequiredWitnessesSet(uint8 n);
    event BaseURISet(string uri);
    event BurnEnabledSet(bool enabled);

    constructor(address admin, string memory baseURI_)
        ERC721("CryptRepublic Passport", "CRPASS")
        EIP712("CryptRepublicPassport", "1")
    {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _baseTokenURI = baseURI_;
        requiredWitnesses = 7; // spec: "7 Witnesses"; NEVER default 0 (would open a zero-witness self-mint window)
    }

    // ---- Minting ----

    /// LEGAL: passport gates dividends/governance; KYC/Sybil resistance is a pre-mainnet concern (§10.1).
    function mintWithWitnesses(
        bytes32 nameHash,
        bytes32 motto,
        bytes32 domicile,
        bool oathAccepted,
        WA.Attestation[] calldata attestations,
        bytes[] calldata signatures
    ) external returns (uint256 tokenId) {
        if (requiredWitnesses == 0) revert WitnessMintDisabled(); // inert until PASSPORT_ADMIN configures a floor
        if (hasPassport[msg.sender]) revert AlreadyCitizen();
        if (attestations.length != signatures.length) revert ArrayLengthMismatch();
        if (attestations.length < requiredWitnesses) revert NotEnoughWitnesses();

        uint256 nonce = _useNonce(msg.sender); // per-applicant replay protection
        bytes32 ds = _domainSeparatorV4();
        address[] memory seen = new address[](attestations.length);

        for (uint256 i; i < attestations.length; i++) {
            WA.Attestation calldata a = attestations[i];
            if (a.applicant != msg.sender) revert SelfAttestation(); // reuse err: applicant must be caller
            if (a.nonce != nonce) revert SelfAttestation();
            if (a.nameHash != nameHash) revert NameHashMismatch(); // witnesses attest to THIS citizen's identity
            if (a.deadline < block.timestamp) revert DeadlineExpired();

            address witness = WA.recoverWitness(ds, a, signatures[i]);
            if (witness == msg.sender) revert SelfAttestation();
            if (!hasPassport[witness]) revert WitnessNotCitizen();
            for (uint256 j; j < i; j++) {
                if (seen[j] == witness) revert DuplicateWitness();
            }
            seen[i] = witness;
        }

        tokenId = _mintCitizen(msg.sender, nameHash, motto, domicile, oathAccepted);
        for (uint256 i; i < attestations.length; i++) {
            emit WitnessAttested(tokenId, seen[i]);
        }
    }

    function genesisMint(address to, bytes32 nameHash, bytes32 motto, bytes32 domicile)
        external
        onlyRole(GENESIS_ATTESTOR_ROLE)
        returns (uint256 tokenId)
    {
        tokenId = _mintCitizen(to, nameHash, motto, domicile, true);
    }

    function adminMint(address to, bytes32 nameHash, bytes32 motto, bytes32 domicile)
        external
        onlyRole(PASSPORT_ADMIN_ROLE)
        returns (uint256 tokenId)
    {
        tokenId = _mintCitizen(to, nameHash, motto, domicile, true);
    }

    function _mintCitizen(address to, bytes32 nameHash, bytes32 motto, bytes32 domicile, bool oath)
        internal
        returns (uint256 tokenId)
    {
        if (to == address(0)) revert ZeroAddress();
        if (hasPassport[to]) revert AlreadyCitizen();
        tokenId = _nextCitizenNumber++;
        hasPassport[to] = true;
        citizenOf[tokenId] =
            Citizen({nameHash: nameHash, motto: motto, domicile: domicile, oathAccepted: oath, mintBlock: uint64(block.number)});
        _safeMint(to, tokenId);
        emit CitizenMinted(tokenId, to, nameHash, uint64(block.number));
    }

    // ---- Renounce / burn ----

    function renounce(uint256 tokenId) external {
        _renounce(tokenId);
    }

    /// @dev OVERRIDES the inherited public `ERC721Burnable.burn` so it CANNOT bypass the
    ///      `burnEnabled` gate or leave `hasPassport[owner] == true` (which would brick the address:
    ///      `isCitizen` stays true forever while the token is gone). Routes through the SAME policy
    ///      as `renounce`. (Alternative acceptable design: `revert Soulbound();` if renounce is the
    ///      ONLY intended exit — pick one and keep the tests in sync.)
    function burn(uint256 tokenId) public override {
        _renounce(tokenId);
    }

    function _renounce(uint256 tokenId) internal {
        if (!burnEnabled) revert BurnDisabled();
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        hasPassport[msg.sender] = false; // clear FIRST so isCitizen == (balanceOf == 1) holds
        _burn(tokenId);
        emit CitizenRenounced(tokenId, msg.sender);
    }

    // ---- Soulbound enforcement ----

    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound(); // allow mint & burn only
        return super._update(to, tokenId, auth);
    }

    function approve(address, uint256) public pure override {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }

    // ---- Views ----

    function totalCitizens() external view returns (uint256) {
        return _nextCitizenNumber - 1;
    }

    function isCitizen(address who) external view returns (bool) {
        return hasPassport[who];
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string.concat(_baseTokenURI, tokenId.toString());
    }

    /// @notice Exposes the EIP-712 domain separator (chainId + verifyingContract bound) so witnesses
    ///         and the frontend can build the same digest the contract verifies. OZ `EIP712` keeps
    ///         `_domainSeparatorV4()` internal; this mirrors the `ERC20Permit.DOMAIN_SEPARATOR()` convention.
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ---- Admin setters ----

    function setRequiredWitnesses(uint8 n) external onlyRole(PASSPORT_ADMIN_ROLE) {
        require(n <= 10, "witnesses>10"); // gas bound (spec §6.8)
        requiredWitnesses = n;
        emit RequiredWitnessesSet(n);
    }

    function setBaseURI(string calldata uri) external onlyRole(PASSPORT_ADMIN_ROLE) {
        _baseTokenURI = uri;
        emit BaseURISet(uri);
    }

    function setBurnEnabled(bool enabled) external onlyRole(PASSPORT_ADMIN_ROLE) {
        burnEnabled = enabled;
        emit BurnEnabledSet(enabled);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
```
NOTE on the `SelfAttestation` reuse for the applicant/nonce checks: rename to dedicated errors (`ApplicantMismatch`, `BadNonce`) if you prefer clearer reverts — but keep the test expectations in sync. VERIFY `_requireOwned` exists in installed v5 `ERC721` (it does in v5); if not, use `ownerOf` (reverts on nonexistent).

- [ ] **Step 5: Run unit tests to verify they pass**

Run: `cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge test --match-contract CryptRepublicPassportTest -vvv`
Expected: PASS. Fix any `_update`/`_hashTypedDataV4`/`supportsInterface` override signature mismatches against the installed OZ v5 source.

- [ ] **Step 6: Add witness-mint + fuzz tests**

Append tests for `mintWithWitnesses`: mint 3 genesis citizens as witnesses, have them each `vm.sign` an `Attestation{applicant: dave, nameHash, nonce: passport.nonces(dave), deadline}`, then `vm.prank(dave); passport.mintWithWitnesses(...)`. Add assertions: succeeds with ≥ required distinct witnesses; reverts `NotEnoughWitnesses` with fewer; reverts `DuplicateWitness` when the same witness signs twice; reverts `WitnessNotCitizen` for a non-citizen signer; reverts `DeadlineExpired` after `vm.warp`; reverts `SelfAttestation` if dave signs his own attestation; reverts on replay (reuse a spent nonce). Add `testFuzz_mintOncePerAddress(uint256 seed)` that genesis-mints then asserts a second mint to the same address reverts.
```solidity
    function _mkWitnesses(uint256 count) internal returns (address[] memory w, uint256[] memory pk) {
        w = new address[](count);
        pk = new uint256[](count);
        for (uint256 i; i < count; i++) {
            (w[i], pk[i]) = makeAddrAndKey(string.concat("w", vm.toString(i)));
            vm.prank(genesis);
            passport.genesisMint(w[i], keccak256(abi.encode(w[i])), bytes32("m"), bytes32("d"));
        }
    }

    function _signAtt(uint256 pk, address applicant, uint256 nonce)
        internal
        view
        returns (WA.Attestation memory a, bytes memory sig)
    {
        a = WA.Attestation({
            applicant: applicant,
            nameHash: keccak256("Dave"),
            nonce: nonce,
            deadline: block.timestamp + 1 hours
        });
        bytes32 ds = passport.DOMAIN_SEPARATOR(); // public view added in Step 4 (see below)
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", ds, WA.structHash(a)));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        sig = abi.encodePacked(r, s, v);
    }
```
The `_signAtt` helper sets `a.nameHash = keccak256("Dave")` — the SAME value the applicant passes to `mintWithWitnesses(keccak256("Dave"), ...)`, so the Major #3 `NameHashMismatch` check passes on the happy path. Because OZ `EIP712` does not expose `DOMAIN_SEPARATOR()` publicly by default, the Step 4 implementation ADDS a tiny public view `function DOMAIN_SEPARATOR() external view returns (bytes32) { return _domainSeparatorV4(); }` to the passport (matches the ERC20Permit convention, lets the frontend build sigs, and is what this helper reads); it is listed in **Interfaces** above.

Additional REQUIRED tests this step:
- `test_burnRevertsWhenBurnDisabled`: genesis-mint alice, then (as alice) `vm.expectRevert(CryptRepublicPassport.BurnDisabled.selector); passport.burn(1);` — proves the OVERRIDDEN public `burn` runs the SAME `burnEnabled` gate as `renounce` and does NOT bypass it (Blocker fix #1). Then `setBurnEnabled(true)`, `burn(1)`, and assert `isCitizen(alice) == false` AND `hasPassport(alice) == false` AND `balanceOf(alice) == 0` (no stale citizen flag).
- `test_witnessNameHashMustMatch`: build 7 valid witness attestations whose `nameHash == keccak256("Dave")` but call `mintWithWitnesses(keccak256("NotDave"), ...)`; `vm.expectRevert(CryptRepublicPassport.NameHashMismatch.selector)` (Major fix #3).
- `test_witnessMintInertWhenUnconfigured`: deploy a FRESH passport WITHOUT calling `setRequiredWitnesses` and instead `setRequiredWitnesses(0)` (or a fresh instance whose constructor default is 7 — set it to 0 to simulate the disabled state); assert `mintWithWitnesses(...)` reverts `WitnessMintDisabled` when `requiredWitnesses == 0` (Major fix #4). Also assert the constructor default is `7` via `assertEq(passport.requiredWitnesses(), 7)` on a freshly-constructed instance before any setter runs.

- [ ] **Step 7: Write the invariant suite (soulbound / balanceOf<=1 / totalSupply==citizenCount / hasPassport-consistency)**

Create `contracts/test/CryptRepublicPassport.invariant.t.sol` with a handler that exposes SAFE actions (genesisMint to fresh actors; a `burn`/`renounce` action for actors that hold a passport when `burnEnabled`; an attempt-transfer that is EXPECTED to revert and counted). The handler tracks `transferSuccessCount` (must stay 0) and the set of minted holders. The critical NEW invariant (Blocker fix #1) is `invariant_HasPassportMatchesBalance`: for EVERY actor, `p.hasPassport(a) == (p.balanceOf(a) == 1)` — this catches the bug where the inherited `burn` clears the token but not `hasPassport` (bricking the address). Because the handler now exercises burns, drop the strict `totalCitizens == minted` invariant (burns don't decrement the monotonic counter) in favor of `p.totalCitizens() >= <live holders>` OR track `burned` and assert `liveHolders == minted - burned`.
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CryptRepublicPassport} from "../src/CryptRepublicPassport.sol";

contract PassportHandler is Test {
    CryptRepublicPassport internal p;
    address internal genesis;
    address internal admin;
    address[] internal actors;
    uint256 public transferSuccessCount;
    uint256 public minted;
    uint256 public burned;
    // tokenId held by each actor (0 == none); lets the burn action target the caller's own token.
    mapping(address => uint256) public tokenOf;

    constructor(CryptRepublicPassport _p, address _genesis, address _admin) {
        p = _p;
        genesis = _genesis;
        admin = _admin;
        for (uint256 i; i < 5; i++) {
            actors.push(makeAddr(string.concat("a", vm.toString(i))));
        }
    }

    function mint(uint256 who) external {
        address to = actors[who % actors.length];
        if (p.hasPassport(to)) return;
        vm.prank(genesis);
        uint256 id = p.genesisMint(to, keccak256(abi.encode(to)), bytes32("m"), bytes32("d"));
        tokenOf[to] = id;
        minted++;
    }

    // Exercises the OVERRIDDEN public burn (Blocker fix #1): must run the burnEnabled gate AND
    // clear hasPassport so the hasPassport <-> balance invariant holds.
    function burn(uint256 who) external {
        address holder = actors[who % actors.length];
        uint256 id = tokenOf[holder];
        if (id == 0 || !p.hasPassport(holder)) return;
        vm.prank(admin);
        p.setBurnEnabled(true);
        vm.prank(holder);
        p.burn(id); // routes through the same policy as renounce
        tokenOf[holder] = 0;
        burned++;
    }

    function tryTransfer(uint256 fromIdx, uint256 toIdx, uint256 tokenId) external {
        address from = actors[fromIdx % actors.length];
        address to = actors[toIdx % actors.length];
        tokenId = bound(tokenId, 1, minted == 0 ? 1 : minted);
        vm.prank(from);
        try p.transferFrom(from, to, tokenId) {
            transferSuccessCount++; // MUST never happen (soulbound)
        } catch {}
    }

    function actorsList() external view returns (address[] memory) {
        return actors;
    }
}

contract CryptRepublicPassportInvariant is Test {
    CryptRepublicPassport internal p;
    PassportHandler internal handler;
    address internal admin = makeAddr("admin");
    address internal genesis = makeAddr("genesis");

    function setUp() public {
        p = new CryptRepublicPassport(admin, "uri/");
        vm.startPrank(admin);
        p.grantRole(p.GENESIS_ATTESTOR_ROLE(), genesis);
        p.grantRole(p.PASSPORT_ADMIN_ROLE(), admin); // handler toggles burnEnabled via admin
        vm.stopPrank();
        handler = new PassportHandler(p, genesis, admin);
        targetContract(address(handler));
    }

    function invariant_NoTransfersEver() public view {
        assertEq(handler.transferSuccessCount(), 0);
    }

    function invariant_BalanceAtMostOne() public view {
        address[] memory a = handler.actorsList();
        for (uint256 i; i < a.length; i++) {
            assertLe(p.balanceOf(a[i]), 1);
        }
    }

    /// Blocker fix #1: the citizen flag must NEVER desync from the token — a stale
    /// `hasPassport==true` after a burn bricks the address (isCitizen true, no token).
    function invariant_HasPassportMatchesBalance() public view {
        address[] memory a = handler.actorsList();
        for (uint256 i; i < a.length; i++) {
            assertEq(p.hasPassport(a[i]), p.balanceOf(a[i]) == 1);
        }
    }

    function invariant_TotalSupplyEqualsCitizens() public view {
        // totalCitizens() is a MONOTONIC counter (does not decrement on burn); live holders == minted - burned.
        assertEq(p.totalCitizens(), handler.minted());
        assertEq(handler.minted() - handler.burned(), _liveHolders());
    }

    function _liveHolders() internal view returns (uint256 n) {
        address[] memory a = handler.actorsList();
        for (uint256 i; i < a.length; i++) {
            if (p.balanceOf(a[i]) == 1) n++;
        }
    }
}
```

- [ ] **Step 8: Run the full passport suite**

Run: `cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge test --match-path 'test/CryptRepublicPassport*' -vvv`
Expected: PASS all (unit + fuzz + invariant).

- [ ] **Step 9: Format and commit**

```bash
cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge fmt && forge fmt --check
git add contracts/src/CryptRepublicPassport.sol contracts/src/interfaces/IPassport.sol contracts/src/lib/Roles.sol contracts/test/CryptRepublicPassport.t.sol contracts/test/CryptRepublicPassport.invariant.t.sol
git commit -m "feat(contracts): CryptRepublicPassport soulbound ERC-721 (witness + genesis mint)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: CryptGovernance — passport-gated one-citizen-one-vote

**Files:**
- Create: `contracts/src/CryptGovernance.sol`, `contracts/test/helpers/PassportHelper.sol`
- Test: `contracts/test/CryptGovernance.t.sol`, `contracts/test/CryptGovernance.invariant.t.sol`

**Interfaces:**
- Consumes: `IPassport` (Task 4); OZ v5 `AccessControl`, `ReentrancyGuard`.
- Produces (Task 6 execution relies on Governance holding `GOVERNANCE_ROLE` on Treasury and calling `disburse`/`fundDividends`):
  - `constructor(address admin, IPassport passport, uint256 votingPeriod_, uint16 quorumBps_, uint256 executionDelay_, uint256 minCitizensForProposal_)` (Major fix #6 execution timelock + Minor fix #10 quorum floor)
  - `enum State { Pending, Active, Defeated, Succeeded, Queued, Executed, Cancelled }` `enum Vote { None, For, Against, Abstain }` (adds `Queued` — succeeded but still within the execution delay)
  - `uint256 public executionDelay;` (seconds after voting `end` before `execute` is allowed — spec §8.2 "treasury drain requires a passing proposal + timelock"; Major fix #6)
  - `uint256 public minCitizensForProposal;` (a 1-citizen republic cannot instantly self-pass a treasury drain — Minor fix #10; enforced at `propose` time against the snapshot AND folded into the quorum floor)
  - `function propose(address target, uint256 value, bytes calldata callData, bytes32 descriptionHash) external returns (uint256 proposalId);` (reverts `NotEnoughCitizens` if `passport.totalCitizens() < minCitizensForProposal`)
  - `function castVote(uint256 proposalId, uint256 tokenId, Vote support) external;`
  - `function state(uint256 proposalId) external view returns (State);` (returns `Succeeded` once the delay elapses, `Queued` while succeeded-but-waiting)
  - `function execute(uint256 proposalId) external returns (bytes memory);` (nonReentrant; reverts `TimelockNotElapsed` if `block.timestamp < end + executionDelay`)
  - `function cancel(uint256 proposalId) external;`
  - `function setVotingPeriod(uint256) external;` `function setQuorumBps(uint16) external;` `function setExecutionDelay(uint256) external;` `function setMinCitizensForProposal(uint256) external;` (all DEFAULT_ADMIN_ROLE, event-logged)
  - `function setTargetAllowed(address target, bool ok) external;` (DEFAULT_ADMIN_ROLE — allowlist so Governance is not an arbitrary-call proxy)
  - `PassportHelper`: `mintCitizens(CryptRepublicPassport p, address genesis, uint256 n) returns (address[] memory)` for test reuse.

- [ ] **Step 1: Write the `PassportHelper` test helper**

Create `contracts/test/helpers/PassportHelper.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Vm} from "forge-std/Vm.sol";
import {CryptRepublicPassport} from "../../src/CryptRepublicPassport.sol";

library PassportHelper {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function mintCitizens(CryptRepublicPassport p, address genesis, uint256 n)
        internal
        returns (address[] memory who)
    {
        who = new address[](n);
        for (uint256 i; i < n; i++) {
            who[i] = vm.addr(uint256(keccak256(abi.encode("citizen", i))));
            vm.prank(genesis);
            p.genesisMint(who[i], keccak256(abi.encode(who[i])), bytes32("m"), bytes32("d"));
        }
    }
}
```

- [ ] **Step 2: Write failing unit tests (lifecycle, 1p1v, quorum, no double vote, allowlisted execution, execution timelock, min-citizens floor)**

Deploy governance with a non-zero `executionDelay` (e.g. `2 days`) and `minCitizensForProposal = 3` in `setUp` so the timelock/floor paths are exercised (mint ≥3 citizens). Create `contracts/test/CryptGovernance.t.sol` covering: `propose` requires `isCitizen`; `propose` reverts `NotEnoughCitizens` when `totalCitizens() < minCitizensForProposal` (Minor fix #10 — e.g. a fresh 1-citizen republic cannot propose); `castVote` requires `ownerOf(tokenId)==msg.sender` and reverts on a second vote (`AlreadyVoted`); a proposal reaches `Succeeded` iff window passed AND the execution delay elapsed AND `forVotes>againstVotes` AND `(forVotes+abstainVotes)*10000 >= snapshotCitizens*quorumBps`; `Defeated` on failed quorum. Execution timelock (Major fix #6): after the vote window closes with a passing tally but BEFORE `end + executionDelay`, `state()` returns `State.Queued` and `execute` reverts `TimelockNotElapsed`; after `vm.warp(end + executionDelay)`, `state()` returns `State.Succeeded` and `execute` runs the allowlisted Treasury payload once and marks `executed` (reverts on re-execute). Add `test_executeRevertsBeforeDelay` explicitly. `execute` reverts for a non-allowlisted target; empty-payload (signalling) proposal cannot be executed. Use a `MockTarget` that records a call. Assert `VoteCast` event and vote-weight-1 (three citizens = 3 forVotes max).

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge test --match-contract CryptGovernanceTest -vvv`
Expected: FAIL — contract not found.

- [ ] **Step 4: Implement `CryptGovernance`**

Create `contracts/src/CryptGovernance.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPassport} from "./interfaces/IPassport.sol";

/// @title CryptGovernance — one passport = one vote (NOT token-weighted).
contract CryptGovernance is AccessControl, ReentrancyGuard {
    enum State {
        Pending,
        Active,
        Defeated,
        Queued, // succeeded, but still within the execution-delay timelock window (Major fix #6)
        Succeeded, // succeeded AND the execution delay has elapsed -> executable
        Executed,
        Cancelled
    }

    enum Vote {
        None,
        For,
        Against,
        Abstain
    }

    struct Proposal {
        address proposer;
        uint64 start;
        uint64 end;
        uint256 snapshotCitizens;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 abstainVotes;
        bool executed;
        bool cancelled;
        bytes32 descriptionHash;
        address target;
        uint256 value;
        bytes callData;
    }

    IPassport public immutable passport;
    uint256 public votingPeriod; // seconds
    uint16 public quorumBps;
    uint256 public executionDelay; // seconds after voting end before execute() is allowed (Major fix #6)
    uint256 public minCitizensForProposal; // floor so a tiny republic can't self-pass a drain (Minor fix #10)

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(uint256 => Vote)) public voteByPassport; // proposalId => tokenId => vote
    mapping(address => bool) public targetAllowed; // execution allowlist (Treasury only)
    uint256 public proposalCount;

    error NotCitizen();
    error NotTokenOwner();
    error AlreadyVoted();
    error VotingClosed();
    error VotingOngoing();
    error NotSucceeded();
    error AlreadyExecuted();
    error AlreadyCancelled();
    error TargetNotAllowed();
    error EmptyPayload();
    error ExecutionFailed();
    error ZeroAddress();
    error NotEnoughCitizens(); // propose blocked below the min-citizens floor (Minor fix #10)
    error TimelockNotElapsed(); // execute blocked before end + executionDelay (Major fix #6)

    event ProposalCreated(
        uint256 indexed proposalId, address indexed proposer, address target, bytes32 descriptionHash
    );
    event VoteCast(uint256 indexed proposalId, uint256 indexed tokenId, address indexed voter, Vote support);
    event ProposalExecuted(uint256 indexed proposalId);
    event ProposalCancelled(uint256 indexed proposalId);
    event VotingPeriodSet(uint256 period);
    event QuorumBpsSet(uint16 bps);
    event ExecutionDelaySet(uint256 delay);
    event MinCitizensForProposalSet(uint256 minCitizens);
    event TargetAllowedSet(address indexed target, bool ok);

    constructor(
        address admin,
        IPassport passport_,
        uint256 votingPeriod_,
        uint16 quorumBps_,
        uint256 executionDelay_,
        uint256 minCitizensForProposal_
    ) {
        if (admin == address(0) || address(passport_) == address(0)) revert ZeroAddress();
        require(quorumBps_ <= 10_000, "quorum>100%");
        require(minCitizensForProposal_ >= 1, "minCitizens<1"); // never allow a 0 floor (Minor fix #10)
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        passport = passport_;
        votingPeriod = votingPeriod_;
        quorumBps = quorumBps_;
        executionDelay = executionDelay_; // Major fix #6: treasury-drain timelock
        minCitizensForProposal = minCitizensForProposal_; // Minor fix #10: quorum floor
    }

    function propose(address target, uint256 value, bytes calldata callData, bytes32 descriptionHash)
        external
        returns (uint256 proposalId)
    {
        if (!passport.isCitizen(msg.sender)) revert NotCitizen();
        uint256 citizens = passport.totalCitizens();
        if (citizens < minCitizensForProposal) revert NotEnoughCitizens(); // Minor fix #10: no self-pass drain
        proposalId = ++proposalCount;
        Proposal storage p = proposals[proposalId];
        p.proposer = msg.sender;
        p.start = uint64(block.timestamp);
        p.end = uint64(block.timestamp + votingPeriod);
        p.snapshotCitizens = citizens; // quorum denominator snapshot
        p.descriptionHash = descriptionHash;
        p.target = target;
        p.value = value;
        p.callData = callData;
        emit ProposalCreated(proposalId, msg.sender, target, descriptionHash);
    }

    function castVote(uint256 proposalId, uint256 tokenId, Vote support) external {
        Proposal storage p = proposals[proposalId];
        if (block.timestamp < p.start || block.timestamp > p.end) revert VotingClosed();
        if (passport.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (voteByPassport[proposalId][tokenId] != Vote.None) revert AlreadyVoted();
        if (support == Vote.None) revert NotCitizen(); // reuse: cannot cast a None vote

        voteByPassport[proposalId][tokenId] = support; // effects before any external interaction
        if (support == Vote.For) p.forVotes += 1;
        else if (support == Vote.Against) p.againstVotes += 1;
        else p.abstainVotes += 1;
        emit VoteCast(proposalId, tokenId, msg.sender, support);
    }

    function state(uint256 proposalId) public view returns (State) {
        Proposal storage p = proposals[proposalId];
        if (p.proposer == address(0)) return State.Pending; // nonexistent -> Pending sentinel
        if (p.cancelled) return State.Cancelled;
        if (p.executed) return State.Executed;
        if (block.timestamp <= p.end) return State.Active;
        bool quorumMet = (p.forVotes + p.abstainVotes) * 10_000 >= p.snapshotCitizens * quorumBps;
        if (quorumMet && p.forVotes > p.againstVotes) {
            // Major fix #6: passed proposals sit in the execution-delay timelock before becoming executable.
            if (block.timestamp < uint256(p.end) + executionDelay) return State.Queued;
            return State.Succeeded;
        }
        return State.Defeated;
    }

    function execute(uint256 proposalId) external nonReentrant returns (bytes memory) {
        Proposal storage p = proposals[proposalId];
        State s = state(proposalId);
        // Major fix #6: explicit timelock guard. A passed-but-still-delayed proposal is `Queued`;
        // reverting with a dedicated error makes the "not yet" case unambiguous vs. a plain failed vote.
        if (s == State.Queued) revert TimelockNotElapsed();
        if (s != State.Succeeded) revert NotSucceeded();
        if (p.executed) revert AlreadyExecuted();
        if (p.callData.length == 0) revert EmptyPayload(); // signalling proposals are not executable
        if (!targetAllowed[p.target]) revert TargetNotAllowed();

        p.executed = true; // effects before interaction
        (bool ok, bytes memory ret) = p.target.call{value: p.value}(p.callData);
        if (!ok) revert ExecutionFailed();
        emit ProposalExecuted(proposalId);
        return ret;
    }

    function cancel(uint256 proposalId) external {
        Proposal storage p = proposals[proposalId];
        if (msg.sender != p.proposer && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert NotCitizen();
        if (p.executed) revert AlreadyExecuted();
        if (p.cancelled) revert AlreadyCancelled();
        p.cancelled = true;
        emit ProposalCancelled(proposalId);
    }

    function setVotingPeriod(uint256 period) external onlyRole(DEFAULT_ADMIN_ROLE) {
        votingPeriod = period;
        emit VotingPeriodSet(period);
    }

    function setQuorumBps(uint16 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(bps <= 10_000, "quorum>100%");
        quorumBps = bps;
        emit QuorumBpsSet(bps);
    }

    function setExecutionDelay(uint256 delay) external onlyRole(DEFAULT_ADMIN_ROLE) {
        executionDelay = delay; // Major fix #6
        emit ExecutionDelaySet(delay);
    }

    function setMinCitizensForProposal(uint256 minCitizens) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(minCitizens >= 1, "minCitizens<1"); // never a 0 floor (Minor fix #10)
        minCitizensForProposal = minCitizens;
        emit MinCitizensForProposalSet(minCitizens);
    }

    function setTargetAllowed(address target, bool ok) external onlyRole(DEFAULT_ADMIN_ROLE) {
        targetAllowed[target] = ok;
        emit TargetAllowedSet(target, ok);
    }

    receive() external payable {}
}
```
NOTE: rename the reused `NotCitizen`/`SelfAttestation`-style error reuses to dedicated errors (`InvalidVote`, `Unauthorized`) if clearer — keep tests in sync.

TIMELOCK MODEL (Major fix #6 + Minor fix #10 — spec §8.2 "treasury drain requires a passing proposal + timelock"). This plan enforces the treasury-drain timelock DIRECTLY IN GOVERNANCE via a built-in `executionDelay`: a passed proposal is `Queued` until `block.timestamp >= end + executionDelay`, only then `Succeeded`/executable; `execute` reverts `TimelockNotElapsed` before the delay. This is the simpler of the two standard topologies. The ALTERNATIVE canonical topology is Governor + OZ `TimelockController` (the Timelock holds `GOVERNANCE_ROLE`/spend rights on the Treasury; Governance `queue`s into the Timelock which enforces the delay). Either satisfies §8.2; DOCUMENT the chosen model (in-Governance `executionDelay`) in `DEPLOY_RUNBOOK.md`, and note that on a LIVE net the admin/config roles ALSO sit behind the Safe + `TimelockController` (Task 9) as defense-in-depth for privileged config changes. The `minCitizensForProposal` floor (≥1, set to 3 in `Deploy`) combines with the delay so a 1- or 2-citizen republic cannot instantly self-pass and immediately drain the treasury.

- [ ] **Step 5: Run unit tests to verify they pass**

Run: `cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge test --match-contract CryptGovernanceTest -vvv`
Expected: PASS.

- [ ] **Step 6: Add fuzz tests**

Add `testFuzz_voteWeightAlwaysOne(uint8 nCitizens, uint8 nFor)`: mint `nCitizens` (bounded `minCitizensForProposal`–50 so `propose` clears the Minor fix #10 floor) citizens, have `nFor` (bounded ≤ nCitizens) of them vote For; assert `forVotes == nFor` (each vote weight exactly 1) and `forVotes + againstVotes + abstainVotes <= snapshotCitizens`. Add `testFuzz_noDoubleVote`: a citizen voting twice on the same proposal reverts `AlreadyVoted` and the tally is unchanged.

- [ ] **Step 7: Write the invariant suite (one-citizen-one-vote / tally ≤ citizens)**

Create `contracts/test/CryptGovernance.invariant.t.sol`. In `setUp`, mint at least `minCitizensForProposal` citizens BEFORE the handler proposes (so `propose` clears the Minor fix #10 floor; deploy governance with e.g. `executionDelay = 2 days`, `minCitizensForProposal = 3`). The handler mints citizens and casts votes on a single open proposal (random tokenId + support), tracking `attemptedDoubleVotes` (each caught revert) and asserting invariants:
- `invariant_TallyLeCitizens`: `forVotes + againstVotes + abstainVotes <= snapshotCitizens`.
- `invariant_NoDoubleVote`: for every (proposal, tokenId) the stored `voteByPassport` is set at most once — track a mirror mapping in the handler and assert consistency.
- `invariant_NoExecuteBeforeDelay` (Major fix #6, optional but recommended): expose a `tryExecute` handler action that must ALWAYS revert while `block.timestamp < end + executionDelay` (count of successful pre-delay executions stays 0).

- [ ] **Step 8: Run the full governance suite**

Run: `cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge test --match-path 'test/CryptGovernance*' -vvv`
Expected: PASS all.

- [ ] **Step 9: Format and commit**

```bash
cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge fmt && forge fmt --check
git add contracts/src/CryptGovernance.sol contracts/test/CryptGovernance.t.sol contracts/test/CryptGovernance.invariant.t.sol contracts/test/helpers/PassportHelper.sol
git commit -m "feat(contracts): CryptGovernance passport-gated 1-citizen-1-vote

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: CryptTreasury — governance-gated disbursement (reentrancy-safe)

**Files:**
- Create: `contracts/src/CryptTreasury.sol`, `contracts/test/mocks/ReentrantToken.sol`
- Test: `contracts/test/CryptTreasury.t.sol`, `contracts/test/CryptTreasury.invariant.t.sol`

**Interfaces:**
- Consumes: OZ v5 `AccessControl`, `ReentrancyGuard`, `SafeERC20`, `IERC20`; `Roles` (Task 4). Governance (Task 5) holds `GOVERNANCE_ROLE` and calls `disburse`/`fundDividends`.
- Produces (Task 7 relies on Treasury funding the Distributor; Task 9 wires roles):
  - `constructor(address admin, IERC20 crypt)` (the `crypt` token is `immutable` so `fundDividends` can approve+open an epoch atomically in $CRYPT)
  - `bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");`
  - `uint256 public constant EXECUTION_DELAY` / `executionDelay` — NOT on Treasury; the treasury-drain timelock lives on Governance execution (Task 5, Major fix #6). Treasury only spends when Governance (holding `GOVERNANCE_ROLE`) calls after the delay has elapsed.
  - `function disburse(address token, address to, uint256 amount) external;` (onlyRole GOVERNANCE_ROLE, nonReentrant; `token==address(0)` ⇒ ETH via checked `call`)
  - `function fundDividends(address distributor, uint256 amount) external returns (uint256 epochId);` (onlyRole GOVERNANCE_ROLE, nonReentrant — ATOMIC: `crypt.forceApprove(distributor, amount)` then `distributor.openEpoch(amount)` (which PULLS the funds) in ONE tx, so funding and epoch-open can never desync; emits `DividendsFunded(amount, epochId)` to match spec §6.5 `DividendsFunded(amount, epoch)`. Minor fixes #5/#7. The `crypt` token address is a constructor `immutable` on the Treasury rather than a per-call `token` arg — dividends are always paid in $CRYPT per spec §6.5/§6.6.)
  - `function setAllocation(bytes32 bucket, uint16 bps) external;` (DEFAULT_ADMIN_ROLE; sum ≤ 10000)
  - `function setAssetWhitelist(address token, bool ok) external;` (DEFAULT_ADMIN_ROLE)
  - `function balanceOf(address token) external view returns (uint256);`
  - `receive() external payable;`
  - `mapping(bytes32 => uint16) public allocationBps;` `mapping(address => bool) public assetWhitelist;`

- [ ] **Step 1: Write the `ReentrantToken` mock**

Create `contracts/test/mocks/ReentrantToken.sol` — a minimal ERC-20 whose `transfer` re-enters `CryptTreasury.disburse` (via a stored target + calldata) so the test proves `nonReentrant` blocks it. Keep it a faithful ERC-20 (balances/allowances) plus a reentrancy hook toggled by the test.

- [ ] **Step 2: Write failing unit tests**

Create `contracts/test/CryptTreasury.t.sol`: construct the treasury with a mock $CRYPT token (`new CryptTreasury(admin, IERC20(address(crypt)))`); fund the treasury with a mock ERC-20 + ETH; assert only `GOVERNANCE_ROLE` can `disburse` (non-role reverts `AccessControlUnauthorizedAccount`); `disburse` transfers the right amount and reduces balance; `disburse` of ETH sends via `call` and reverts on a rejecting recipient; `setAllocation` rejects a bucket set that pushes the sum > 10000 (`AllocationOverflow`); a reentrancy attempt via `ReentrantToken` reverts (`ReentrancyGuardReentrantCall`). Add `test_fundDividendsAtomicOpensEpoch` (Minor fixes #5/#7): deploy a real `DividendDistributor`, grant it `FUNDER_ROLE` to the treasury, genesis-mint ≥1 citizen, fund the treasury with $CRYPT, then (as `GOVERNANCE_ROLE`) call `treasury.fundDividends(distributor, amount)` and assert (a) it returns a non-zero `epochId`, (b) the distributor now holds `amount` of $CRYPT (funds PULLED atomically), (c) `DividendsFunded(distributor, amount, epochId)` is emitted with the spec §6.5 (amount, epoch) fields, and (d) the residual allowance is 0. Assert `Disbursed`/`AllocationSet` events.

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge test --match-contract CryptTreasuryTest -vvv`
Expected: FAIL — contract not found.

- [ ] **Step 4: Implement `CryptTreasury`**

Create `contracts/src/CryptTreasury.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Roles} from "./lib/Roles.sol";

/// @notice Minimal view of the DividendDistributor's pull-funded epoch opener (Task 7).
interface IDividendDistributor {
    function openEpoch(uint256 amount) external returns (uint256 epochId);
}

/// @title CryptTreasury — holds funds; disburses ONLY under Governance authorization.
/// LEGAL: treasury outflows/dividend funding may implicate MSB/securities/tax regimes (spec §10.1).
contract CryptTreasury is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant GOVERNANCE_ROLE = Roles.GOVERNANCE_ROLE;

    IERC20 public immutable crypt; // dividends are always paid in $CRYPT (spec §6.5/§6.6)

    mapping(bytes32 => uint16) public allocationBps; // bucket => target bps
    mapping(address => bool) public assetWhitelist;
    uint16 public totalAllocationBps;

    error ZeroAddress();
    error AllocationOverflow();
    error EthTransferFailed();

    event Disbursed(address indexed token, address indexed to, uint256 amount);
    /// @dev Signature reconciled with spec §6.5 `DividendsFunded(amount, epoch)` (Minor fix #7); the
    ///      distributor is added as an INDEXED topic for the indexer without changing the spec's core fields.
    event DividendsFunded(address indexed distributor, uint256 amount, uint256 indexed epochId);
    event AllocationSet(bytes32 indexed bucket, uint16 bps);
    event AssetWhitelisted(address indexed token, bool ok);
    event Received(address indexed from, uint256 amount);

    constructor(address admin, IERC20 crypt_) {
        if (admin == address(0) || address(crypt_) == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        crypt = crypt_;
    }

    /// LEGAL: disbursement of a likely-security token / real value — gate + audit before mainnet.
    function disburse(address token, address to, uint256 amount)
        external
        onlyRole(GOVERNANCE_ROLE)
        nonReentrant
    {
        if (to == address(0)) revert ZeroAddress();
        emit Disbursed(token, to, amount); // effects/log before interaction
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert EthTransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    /// LEGAL: dividend funding treats $CRYPT as a distribution of a likely security (spec §10.1).
    /// @dev Minor fixes #5/#7: ATOMIC funding — approve the distributor for `amount` in $CRYPT, then
    ///      call `openEpoch(amount)` (which PULLS the funds) in the SAME tx, so a funded balance and an
    ///      open epoch can never desync (no implicit 2-step transfer-then-openEpoch race). Emits
    ///      `DividendsFunded(distributor, amount, epochId)` — the (amount, epoch) fields match spec §6.5.
    function fundDividends(address distributor, uint256 amount)
        external
        onlyRole(GOVERNANCE_ROLE)
        nonReentrant
        returns (uint256 epochId)
    {
        if (distributor == address(0)) revert ZeroAddress();
        crypt.forceApprove(distributor, amount); // exact allowance for the atomic pull
        epochId = IDividendDistributor(distributor).openEpoch(amount);
        crypt.forceApprove(distributor, 0); // clear residual allowance (defense-in-depth)
        emit DividendsFunded(distributor, amount, epochId);
    }

    function setAllocation(bytes32 bucket, uint16 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint16 newTotal = totalAllocationBps - allocationBps[bucket] + bps;
        if (newTotal > 10_000) revert AllocationOverflow();
        totalAllocationBps = newTotal;
        allocationBps[bucket] = bps;
        emit AllocationSet(bucket, bps);
    }

    function setAssetWhitelist(address token, bool ok) external onlyRole(DEFAULT_ADMIN_ROLE) {
        assetWhitelist[token] = ok;
        emit AssetWhitelisted(token, ok);
    }

    function balanceOf(address token) external view returns (uint256) {
        return token == address(0) ? address(this).balance : IERC20(token).balanceOf(address(this));
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }
}
```
NOTE (funding model — Minor fixes #5/#7): `fundDividends` and `DividendDistributor.openEpoch` are now a SINGLE atomic path. Task 6 `fundDividends(distributor, amount)` does `crypt.forceApprove(distributor, amount)` then `distributor.openEpoch(amount)`; Task 7 `openEpoch(amount)` PULLS via `crypt.safeTransferFrom(msg.sender, address(this), amount)`. So the Treasury (the `msg.sender` into `openEpoch`, holding `FUNDER_ROLE` on the distributor) is the source of the pulled funds, funding and epoch-open cannot desync, and an epoch is never opened for more than the deposited amount. `forceApprove` is OZ v5 `SafeERC20` — VERIFY it exists in the installed source (it does in v5). The admin Safe can ALSO open epochs directly (it holds `FUNDER_ROLE` per `Configure`) by approving the distributor and calling `openEpoch` itself. Ensure both tasks agree before Task 7 Step 4.

- [ ] **Step 5: Run unit tests to verify they pass**

Run: `cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge test --match-contract CryptTreasuryTest -vvv`
Expected: PASS.

- [ ] **Step 6: Add fuzz test**

`testFuzz_disburseWithinBalance(uint256 fund, uint256 amount)`: mint `fund` of the mock token to the treasury, bound `amount <= fund`, grant `GOVERNANCE_ROLE` to a caller, `disburse`, assert balance decreased by `amount` and recipient increased by `amount`; a `disburse` of `amount > balance` reverts (SafeERC20).

- [ ] **Step 7: Write the invariant suite (only-governance-spends; outflows ≤ inflows)**

Create `contracts/test/CryptTreasury.invariant.t.sol` with a handler tracking cumulative token `inflows`/`outflows` AND ETH `ethIn`/`ethOut`. Actions:
- `fund` (mint the mock token to treasury, add to `inflows`) and `govDisburse` (only via the GOVERNANCE_ROLE holder, add to `outflows`).
- `fundEth` (Minor fix #8): send ETH to the treasury's `receive()` (e.g. `vm.deal(handler, x); (bool ok,) = address(treasury).call{value: x}(""); require(ok);`), add to `ethIn`.
- `govDisburseEth` (Minor fix #8): as the GOVERNANCE_ROLE holder, `treasury.disburse(address(0), recipient, amount)` where `recipient` is a payable sink the handler controls; bound `amount <= address(treasury).balance`; add to `ethOut`.
Assert:
- `invariant_OutflowsLeInflows`: `outflows <= inflows` and `token.balanceOf(treasury) == inflows - outflows`.
- `invariant_EthConservation` (Minor fix #8): `ethOut <= ethIn` and `address(treasury).balance == ethIn - ethOut`.
- `invariant_NonGovCannotReduceBalance`: expose a `tryNonGovDisburse` action (token AND ETH variants) that must always revert (tracked count stays 0).

- [ ] **Step 8: Run the full treasury suite**

Run: `cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge test --match-path 'test/CryptTreasury*' -vvv`
Expected: PASS all.

- [ ] **Step 9: Format and commit**

```bash
cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge fmt && forge fmt --check
git add contracts/src/CryptTreasury.sol contracts/test/CryptTreasury.t.sol contracts/test/CryptTreasury.invariant.t.sol contracts/test/mocks/ReentrantToken.sol
git commit -m "feat(contracts): CryptTreasury governance-gated disbursement (reentrancy-safe)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: DividendDistributor — equal per-citizen epoch dividends (no double-claim)

**Files:**
- Create: `contracts/src/DividendDistributor.sol`
- Test: `contracts/test/DividendDistributor.t.sol`, `contracts/test/DividendDistributor.invariant.t.sol`

**Interfaces:**
- Consumes: `IPassport` (Task 4), `IERC20`/`SafeERC20`, `AccessControl`, `ReentrancyGuard`, `Roles`. Funded by Treasury (Task 6) transfers; `FUNDER_ROLE` opens epochs.
- Produces:
  - `constructor(address admin, IPassport passport, IERC20 crypt)`
  - `bytes32 public constant FUNDER_ROLE = keccak256("FUNDER_ROLE");`
  - `struct Epoch { uint256 amount; uint256 snapshotCitizens; uint256 perCitizen; uint64 openedAt; bool open; }`
  - `function openEpoch(uint256 amount) external returns (uint256 epochId);` (onlyRole FUNDER_ROLE; PULLS `amount` atomically via `crypt.safeTransferFrom(msg.sender, address(this), amount)` so the epoch is BACKED — the caller-supplied `amount` can never exceed real deposited funds; Major fix #5)
  - `function claim(uint256 epochId, uint256 tokenId) external;` (nonReentrant)
  - `function claimMany(uint256 epochId, uint256[] calldata tokenIds) external;` (nonReentrant)
  - `function claimable(uint256 epochId, uint256 tokenId) external view returns (uint256);`
  - `mapping(uint256 => Epoch) public epochs;` `mapping(uint256 => mapping(uint256 => bool)) public claimed;` `uint256 public currentEpoch;`

- [ ] **Step 1: Write failing unit tests**

Create `contracts/test/DividendDistributor.t.sol`: deploy passport + a plain mock ERC-20 (mint freely) + distributor; genesis-mint 4 citizens; the FUNDER `approve`s the distributor for `amount` and calls `openEpoch(amount)`, which PULLS the tokens atomically (`crypt.safeTransferFrom(funder, distributor, amount)`) and snapshots `totalCitizens()`, setting `perCitizen = amount / snapshot`; a citizen `claim(epochId, tokenId)` transfers exactly `perCitizen` and marks `claimed`; a second `claim` reverts `AlreadyClaimed`; a non-owner claiming reverts `NotTokenOwner`; a `tokenId > snapshotCitizens` reverts `NotEligible`; `openEpoch` with `snapshotCitizens == 0` reverts `NoCitizens`; integer-division dust remains in the contract. Add `test_openEpochRevertsWhenUnderfunded` (Major fix #5): the FUNDER approves only `amount - 1` (or holds insufficient balance) and calls `openEpoch(amount)`; assert it REVERTS (SafeERC20 transfer failure) — an epoch can NEVER be opened for more than the funds actually deposited, so `remainingUnclaimed * perCitizen` is always backed by the contract balance. Assert `EpochOpened`/`DividendClaimed` events.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge test --match-contract DividendDistributorTest -vvv`
Expected: FAIL — contract not found.

- [ ] **Step 3: Write minimal implementation**

Create `contracts/src/DividendDistributor.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPassport} from "./interfaces/IPassport.sol";
import {Roles} from "./lib/Roles.sol";

/// @title DividendDistributor — equal per-citizen dividends per epoch (anti-double-claim).
/// LEGAL: per-citizen dividends make $CRYPT a likely security; resolve before funding (spec §10.1).
contract DividendDistributor is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant FUNDER_ROLE = Roles.FUNDER_ROLE;

    struct Epoch {
        uint256 amount;
        uint256 snapshotCitizens;
        uint256 perCitizen;
        uint64 openedAt;
        bool open;
    }

    IPassport public immutable passport;
    IERC20 public immutable crypt;

    mapping(uint256 => Epoch) public epochs;
    mapping(uint256 => mapping(uint256 => bool)) public claimed; // epochId => tokenId => claimed
    uint256 public currentEpoch;

    error NoCitizens();
    error EpochClosed();
    error NotEligible();
    error NotTokenOwner();
    error AlreadyClaimed();
    error ZeroAddress();

    event EpochOpened(uint256 indexed epochId, uint256 amount, uint256 snapshotCitizens, uint256 perCitizen);
    event DividendClaimed(uint256 indexed epochId, uint256 indexed tokenId, address indexed to, uint256 amount);

    constructor(address admin, IPassport passport_, IERC20 crypt_) {
        if (admin == address(0) || address(passport_) == address(0) || address(crypt_) == address(0)) {
            revert ZeroAddress();
        }
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        passport = passport_;
        crypt = crypt_;
    }

    /// LEGAL: opening a funded dividend epoch is a distribution of a likely security (spec §10.1).
    /// @dev Major fix #5: PULLS `amount` atomically from the FUNDER so the epoch is BACKED — the
    ///      caller-supplied `amount` can never exceed real deposited funds. The FUNDER (Treasury or
    ///      the admin Safe) must `approve` this contract for `amount` first. This keeps the solvency
    ///      invariant `remainingUnclaimed * perCitizen <= crypt.balanceOf(this)` true by construction.
    function openEpoch(uint256 amount) external onlyRole(FUNDER_ROLE) nonReentrant returns (uint256 epochId) {
        uint256 snapshot = passport.totalCitizens();
        if (snapshot == 0) revert NoCitizens();
        crypt.safeTransferFrom(msg.sender, address(this), amount); // pull funds atomically — epoch is backed
        epochId = ++currentEpoch;
        uint256 per = amount / snapshot; // dust (remainder) stays in the contract, favoring protocol
        epochs[epochId] = Epoch({
            amount: amount,
            snapshotCitizens: snapshot,
            perCitizen: per,
            openedAt: uint64(block.timestamp),
            open: true
        });
        emit EpochOpened(epochId, amount, snapshot, per);
    }

    function claim(uint256 epochId, uint256 tokenId) external nonReentrant {
        _claim(epochId, tokenId);
    }

    function claimMany(uint256 epochId, uint256[] calldata tokenIds) external nonReentrant {
        for (uint256 i; i < tokenIds.length; i++) {
            _claim(epochId, tokenIds[i]);
        }
    }

    function _claim(uint256 epochId, uint256 tokenId) internal {
        Epoch storage e = epochs[epochId];
        if (!e.open) revert EpochClosed();
        if (tokenId == 0 || tokenId > e.snapshotCitizens) revert NotEligible();
        if (passport.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (claimed[epochId][tokenId]) revert AlreadyClaimed();

        claimed[epochId][tokenId] = true; // effects (anti-double-claim flag) BEFORE transfer
        uint256 amount = e.perCitizen;
        emit DividendClaimed(epochId, tokenId, msg.sender, amount);
        crypt.safeTransfer(msg.sender, amount);
    }

    function claimable(uint256 epochId, uint256 tokenId) external view returns (uint256) {
        Epoch storage e = epochs[epochId];
        if (!e.open || tokenId == 0 || tokenId > e.snapshotCitizens || claimed[epochId][tokenId]) {
            return 0;
        }
        return e.perCitizen;
    }
}
```

- [ ] **Step 4: Run unit tests to verify they pass**

Run: `cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge test --match-contract DividendDistributorTest -vvv`
Expected: PASS.

- [ ] **Step 5: Add fuzz tests**

`testFuzz_claimAmounts(uint8 nCitizens, uint96 amount)`: bound `nCitizens` 1–50, mint them, fund + `openEpoch`, assert every eligible `claim` pays exactly `amount / nCitizens` and the sum of all claims `<= amount`. `testFuzz_multiEpoch`: open two epochs; a token can claim once per epoch; claiming epoch 1 does not affect epoch 2 eligibility.

- [ ] **Step 6: Write the invariant suite (no double-claim; sum(claims) ≤ funding)**

Create `contracts/test/DividendDistributor.invariant.t.sol` with a handler that mints citizens, opens one funded epoch via `openEpoch(amount)` (the handler holds `FUNDER_ROLE`, mints itself `amount` of the mock token, and `approve`s the distributor so the atomic PULL succeeds — Major fix #5 means the handler can NEVER open an unbacked epoch), and lets random tokenIds claim (tracking cumulative `totalClaimed`, a per-token `claimedMirror`, and `remainingUnclaimed` = eligible tokens not yet claimed). Assert:
- `invariant_NoDoubleClaim`: for each token, the handler's mirror agrees with `distributor.claimed(epoch, tokenId)`, and `totalClaimed <= epoch.amount`.
- `invariant_SolvencyBacked` (Major fix #5 — asserts against the ACTUAL contract balance, NOT the caller-supplied `amount`): `remainingUnclaimed * perCitizen <= crypt.balanceOf(distributor)` — every still-claimable dividend is fully token-backed because `openEpoch` pulled the funds. (The old formulation `remainingClaims * perCitizen <= token.balanceOf(distributor)` is retained but is now GUARANTEED by construction rather than assumed.)

- [ ] **Step 7: Run the full distributor suite**

Run: `cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge test --match-path 'test/DividendDistributor*' -vvv`
Expected: PASS all.

- [ ] **Step 8: Format and commit**

```bash
cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge fmt && forge fmt --check
git add contracts/src/DividendDistributor.sol contracts/test/DividendDistributor.t.sol contracts/test/DividendDistributor.invariant.t.sol
git commit -m "feat(contracts): DividendDistributor equal per-citizen epoch dividends

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: CryptStaking — APR reward accrual (reentrancy-safe, solvency-bounded)

**Files:**
- Create: `contracts/src/CryptStaking.sol`
- Test: `contracts/test/CryptStaking.t.sol`, `contracts/test/CryptStaking.invariant.t.sol`
- Create: `contracts/.gas-snapshot`

**Interfaces:**
- Consumes: `IERC20`/`SafeERC20`, `AccessControl`, `ReentrancyGuard`, `Roles`.
- Produces (Synthetix-style `rewardPerToken` accumulator so APR changes are GENUINELY prospective — spec §6.7 "prospective only"; Blocker fix #2):
  - `constructor(address admin, IERC20 crypt, uint16 aprBps_)`
  - `bytes32 public constant REWARDS_ADMIN_ROLE = keccak256("REWARDS_ADMIN_ROLE");`
  - `uint256 public constant YEAR = 365 days;`
  - `uint256 public constant PRECISION = 1e18;` (accumulator fixed-point scale)
  - `struct StakeInfo { uint256 amount; uint256 rewardAccrued; uint256 userRewardPerTokenPaid; }` (NO per-user `lastUpdate` — accrual is driven by the GLOBAL accumulator + a single global `lastUpdate`)
  - `uint256 public rewardPerTokenStored;` `uint64 public lastUpdate;` (global checkpoint)
  - `function stake(uint256 amount) external;` `function unstake(uint256 amount) external;` `function claim() external;` (all nonReentrant; each runs the global `updateReward(msg.sender)` modifier FIRST)
  - `function rewardPerToken() external view returns (uint256);` (global accumulator incl. pending elapsed time)
  - `function earned(address user) external view returns (uint256);`
  - `function setApr(uint16 bps) external;` (REWARDS_ADMIN_ROLE; CHECKPOINTS the accumulator via `_updateReward(address(0))` FIRST so the new rate is prospective for ALL stakers, not retroactive) `function fundRewards(uint256 amount) external;` (REWARDS_ADMIN_ROLE)
  - `uint256 public totalStaked;` `uint256 public rewardPoolRemaining;` `mapping(address => StakeInfo) public stakes;`

- [ ] **Step 1: Write failing unit tests**

Create `contracts/test/CryptStaking.t.sol`: deploy a mint-free mock ERC-20; give alice tokens; `stake(100e18)` pulls tokens and sets `totalStaked`; after `vm.warp(YEAR)` at `aprBps=1000` (10%) `earned(alice) == 10e18`; `fundRewards` then `claim` pays the accrued amount capped at `rewardPoolRemaining`; `unstake` returns principal and settles rewards; a claim exceeding the reward pool pays only what is funded (never reverts on underflow). Assert `Staked`/`Unstaked`/`RewardClaimed`/`AprSet`/`RewardsFunded` events. Include `test_setAprProspective` (Blocker fix #2 — this test PASSES with the Synthetix accumulator and FAILS with the old naive `_settle`): stake `100e18`, warp HALF a year at 10% APR, `setApr(2000)` (20%), warp another half year, assert `earned(alice) == 15e18` i.e. `(0.5*10% + 0.5*20%)*100e18 = 5e18 + 10e18` — the rate change is applied PROSPECTIVELY (the elapsed half-year is priced at the OLD 10%, NOT re-priced at 20%). The naive per-user-`lastUpdate` design yields `20e18` here (retroactive re-pricing) — that is the bug this fix removes.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge test --match-contract CryptStakingTest -vvv`
Expected: FAIL — contract not found.

- [ ] **Step 3: Implement `CryptStaking`**

Create `contracts/src/CryptStaking.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Roles} from "./lib/Roles.sol";

/// @title CryptStaking — stake $CRYPT, accrue linear-APR rewards; payouts bounded by funded reserve.
/// @dev Rewards use the Synthetix-style `rewardPerToken` accumulator so APR changes are GENUINELY
///      prospective (spec §6.7 "prospective only"): elapsed time is priced at the rate in force AT
///      THAT TIME, never re-priced when `setApr` changes the rate. `setApr` checkpoints the accumulator
///      FIRST, so already-elapsed time is locked at the old rate before the new rate takes effect.
contract CryptStaking is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant REWARDS_ADMIN_ROLE = Roles.REWARDS_ADMIN_ROLE;
    uint256 public constant YEAR = 365 days;
    uint256 public constant PRECISION = 1e18; // fixed-point scale for the accumulator

    struct StakeInfo {
        uint256 amount;
        uint256 rewardAccrued; // settled, unclaimed rewards (checkpointed)
        uint256 userRewardPerTokenPaid; // accumulator value at the user's last checkpoint
    }

    IERC20 public immutable crypt;
    uint16 public aprBps;
    uint256 public totalStaked;
    uint256 public rewardPoolRemaining;

    // ---- Synthetix accumulator (global) ----
    uint256 public rewardPerTokenStored; // scaled by PRECISION
    uint64 public lastUpdate; // last time the accumulator advanced

    mapping(address => StakeInfo) public stakes;

    error ZeroAmount();
    error InsufficientStake();
    error ZeroAddress();

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, uint256 amount);
    event AprSet(uint16 bps);
    event RewardsFunded(uint256 amount);

    constructor(address admin, IERC20 crypt_, uint16 aprBps_) {
        if (admin == address(0) || address(crypt_) == address(0)) revert ZeroAddress();
        require(aprBps_ <= 50_000, "apr>500%");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        crypt = crypt_;
        aprBps = aprBps_;
        lastUpdate = uint64(block.timestamp);
    }

    /// @notice Global accumulator incl. the yet-unbanked elapsed time at the CURRENT rate.
    /// @dev rewardPerToken grows by (aprBps * elapsed / (YEAR * 10000)) * PRECISION each second,
    ///      independent of totalStaked (linear-APR: each staked token earns aprBps/yr regardless of pool size).
    function rewardPerToken() public view returns (uint256) {
        uint256 elapsed = block.timestamp - lastUpdate;
        if (elapsed == 0) return rewardPerTokenStored;
        return rewardPerTokenStored + (aprBps * elapsed * PRECISION) / (YEAR * 10_000);
    }

    /// @dev Checkpoints the global accumulator, then (if `user != address(0)`) banks the user's accrual
    ///      at the accumulator value in force so far. Called FIRST on every mutating path (incl. setApr).
    function _updateReward(address user) internal {
        rewardPerTokenStored = rewardPerToken();
        lastUpdate = uint64(block.timestamp);
        if (user != address(0)) {
            StakeInfo storage s = stakes[user];
            s.rewardAccrued += (s.amount * (rewardPerTokenStored - s.userRewardPerTokenPaid)) / PRECISION;
            s.userRewardPerTokenPaid = rewardPerTokenStored;
        }
    }

    modifier updateReward(address user) {
        _updateReward(user);
        _;
    }

    function stake(uint256 amount) external nonReentrant updateReward(msg.sender) {
        if (amount == 0) revert ZeroAmount();
        stakes[msg.sender].amount += amount;
        totalStaked += amount;
        emit Staked(msg.sender, amount);
        crypt.safeTransferFrom(msg.sender, address(this), amount); // interaction last
    }

    function unstake(uint256 amount) external nonReentrant updateReward(msg.sender) {
        StakeInfo storage s = stakes[msg.sender];
        if (amount == 0) revert ZeroAmount();
        if (amount > s.amount) revert InsufficientStake();
        s.amount -= amount;
        totalStaked -= amount;
        emit Unstaked(msg.sender, amount);
        crypt.safeTransfer(msg.sender, amount);
    }

    function claim() external nonReentrant updateReward(msg.sender) {
        StakeInfo storage s = stakes[msg.sender];
        uint256 payout = s.rewardAccrued;
        if (payout > rewardPoolRemaining) payout = rewardPoolRemaining; // bounded by funded reserve
        if (payout == 0) return;
        s.rewardAccrued -= payout;
        rewardPoolRemaining -= payout;
        emit RewardClaimed(msg.sender, payout);
        crypt.safeTransfer(msg.sender, payout);
    }

    function earned(address user) public view returns (uint256) {
        StakeInfo storage s = stakes[user];
        return s.rewardAccrued + (s.amount * (rewardPerToken() - s.userRewardPerTokenPaid)) / PRECISION;
    }

    /// @dev PROSPECTIVE: checkpoint the accumulator at the OLD rate BEFORE switching, so already-elapsed
    ///      time is locked at the old rate and only future time uses the new rate (spec §6.7).
    function setApr(uint16 bps) external onlyRole(REWARDS_ADMIN_ROLE) updateReward(address(0)) {
        require(bps <= 50_000, "apr>500%");
        aprBps = bps;
        emit AprSet(bps);
    }

    function fundRewards(uint256 amount) external onlyRole(REWARDS_ADMIN_ROLE) {
        rewardPoolRemaining += amount;
        emit RewardsFunded(amount);
        crypt.safeTransferFrom(msg.sender, address(this), amount);
    }
}
```
NOTE on the accumulator model (Blocker fix #2): `setApr` carries `updateReward(address(0))`, which calls `_updateReward(address(0))` — this advances `rewardPerTokenStored` to `block.timestamp` at the OLD `aprBps` and sets `lastUpdate = now` BEFORE `aprBps` is overwritten. Consequently the half-year already elapsed is banked at the old rate and only the subsequent half-year uses the new rate, so `test_setAprProspective` yields `15e18` (not `20e18`). This is GENUINE prospectivity for EVERY staker (no per-user `_settle`/`lastUpdate` needed), matching spec §6.7 "prospective only". Update `DEPLOY_RUNBOOK.md` to state that APR is prospective via the on-chain accumulator (remove the old caveat that it was only prospective for stakers who had recently mutated). VERIFY there is no precision-loss surprise: with `PRECISION = 1e18` and 18-decimal $CRYPT the rounding favors the protocol (integer division truncates rewards down), which is consistent with the solvency invariant.

- [ ] **Step 4: Run unit tests to verify they pass**

Run: `cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge test --match-contract CryptStakingTest -vvv`
Expected: PASS.

- [ ] **Step 5: Add fuzz tests**

`testFuzz_stakeUnstakeRoundtrip(uint96 amount)`: stake then immediately unstake the same amount; assert principal fully returned and `totalStaked == 0`. `testFuzz_rewardAccrual(uint96 amount, uint32 elapsed)`: stake, `vm.warp(block.timestamp + elapsed)`, assert `earned` equals `amount*aprBps*elapsed/(YEAR*10000)` within a `PRECISION`-rounding tolerance (`assertApproxEqAbs(earned, expected, amount / PRECISION + 1)` — the accumulator truncates at 1e18 scale, favoring the protocol; a lone staker sees at most ~`amount/1e18` wei of dust). Add `testFuzz_setAprProspective(uint16 apr1, uint16 apr2, uint32 t1, uint32 t2)` (bounded): stake, warp `t1` at `apr1`, `setApr(apr2)`, warp `t2`; assert `earned == amount*apr1*t1/(YEAR*10000) + amount*apr2*t2/(YEAR*10000)` within the same tolerance — proving the rate change NEVER re-prices the first window.

- [ ] **Step 6: Write the invariant suite (principal recoverable; rewards ≤ reserve; sum == poolTotal)**

Create `contracts/test/CryptStaking.invariant.t.sol` with a handler: actors stake/unstake/claim; `setApr` (bounded, exercised by the REWARDS_ADMIN via the handler to stress the accumulator under rate changes); `fundRewards` adds to a tracked `totalFunded`; warps time between actions. Assert:
- `invariant_TotalStakedEqualsSum`: `staking.totalStaked() == sum(stakes[a].amount)` over actors.
- `invariant_PrincipalCovered`: `token.balanceOf(staking) >= staking.totalStaked()` (principal always withdrawable).
- `invariant_ClaimedLeReserve`: cumulative CLAIMED rewards `<= totalFunded` (`rewardPoolRemaining` never underflows).
- `invariant_OwedRewardsBackedByFunding` (Blocker fix #2): total OUTSTANDING owed rewards actually PAYABLE never exceed the remaining funded reserve — i.e. `min(sum_a(staking.earned(a)), <owed>) <= staking.rewardPoolRemaining() + <alreadyPaid>` restated as: the reserve is never over-committed for what `claim` will actually pay out. Concretely track `totalClaimed` and assert `totalClaimed + staking.rewardPoolRemaining() == totalFunded` (conservation) AND `staking.rewardPoolRemaining() <= token.balanceOf(staking) - staking.totalStaked()` (the reserve is fully token-backed and never eats principal). Because `claim` caps payout at `rewardPoolRemaining`, actual payouts can NEVER exceed the funded reserve regardless of how large `earned` grows.

- [ ] **Step 7: Run the full staking suite + generate the gas snapshot**

Run: `cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge test --match-path 'test/CryptStaking*' -vvv && forge snapshot`
Expected: tests PASS; `contracts/.gas-snapshot` written.

- [ ] **Step 8: Format and commit**

```bash
cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge fmt && forge fmt --check
git add contracts/src/CryptStaking.sol contracts/test/CryptStaking.t.sol contracts/test/CryptStaking.invariant.t.sol contracts/.gas-snapshot
git commit -m "feat(contracts): CryptStaking APR accrual (reentrancy-safe, solvency-bounded)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Deploy/Configure/Seed scripts, local anvil validation, CI coverage + slither, and the USER runbook

**Files:**
- Create: `contracts/script/Deploy.s.sol`, `contracts/script/Configure.s.sol`, `contracts/script/SeedGenesis.s.sol`
- Create/Test: `contracts/test/Deploy.t.sol`
- Create: `contracts/audit/triage.md`, `contracts/docs/DEPLOY_RUNBOOK.md`
- Modify: `.github/workflows/foundry.yml`
- Modify: `docs/superpowers/specs/2026-07-01-cryptrepublic-network-state-design.md` (reframe §9 Wave 4 acceptance)

**Interfaces:**
- Consumes: all six contracts + roles from Tasks 2–8.
- Produces: a validated deploy pipeline + the documented USER runbook; no new on-chain interface.

- [ ] **Step 1: Write the failing deploy-wiring test**

Create `contracts/test/Deploy.t.sol` that deploys all six contracts in the spec order and asserts the wiring an operator would expect (this test drives the script logic even before the scripts exist — put the shared deploy logic in the script and call it from the test):
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {DeployLib} from "../script/Deploy.s.sol";
import {CryptToken} from "../src/CryptToken.sol";
import {CryptRepublicPassport} from "../src/CryptRepublicPassport.sol";
import {CryptGovernance} from "../src/CryptGovernance.sol";
import {CryptTreasury} from "../src/CryptTreasury.sol";
import {DividendDistributor} from "../src/DividendDistributor.sol";
import {CryptStaking} from "../src/CryptStaking.sol";

contract DeployTest is Test {
    function test_DeployAndConfigureWiring() public {
        // Run deploy + configure AS admin so it holds DEFAULT_ADMIN_ROLE + the genesis supply.
        address admin = address(this); // this test contract is the admin/deployer
        DeployLib.Deployed memory d = DeployLib.deployAll(admin);
        DeployLib.configure(d, admin);

        // Order + non-zero addresses
        assertTrue(address(d.token) != address(0));
        assertTrue(address(d.passport) != address(0));
        // Genesis supply moved admin -> treasury by configure (deploy-order/atomic-funding fix)
        assertEq(d.token.balanceOf(address(d.treasury)), 100_000_000e18);
        assertEq(d.token.balanceOf(admin), 0);
        // Distributor + Staking hold MINTER_ROLE on the token
        assertTrue(d.token.hasRole(d.token.MINTER_ROLE(), address(d.distributor)));
        assertTrue(d.token.hasRole(d.token.MINTER_ROLE(), address(d.staking)));
        // Governance holds GOVERNANCE_ROLE on the treasury
        assertTrue(d.treasury.hasRole(d.treasury.GOVERNANCE_ROLE(), address(d.governance)));
        // Treasury holds FUNDER_ROLE on the distributor
        assertTrue(d.distributor.hasRole(d.distributor.FUNDER_ROLE(), address(d.treasury)));
        // Governance allowlists the treasury as an execution target
        assertTrue(d.governance.targetAllowed(address(d.treasury)));
        // Major fix #6/#10: governance carries a non-zero execution delay + a min-citizens proposal floor
        assertGt(d.governance.executionDelay(), 0);
        assertGe(d.governance.minCitizensForProposal(), 1);
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge test --match-contract DeployTest -vvv`
Expected: FAIL — `Deploy.s.sol` / `DeployLib` not found.

- [ ] **Step 3: Implement `Deploy.s.sol` (with a reusable `DeployLib`)**

Create `contracts/script/Deploy.s.sol` exposing a `DeployLib` (pure deploy/configure logic, callable from tests) plus a `Deploy` `Script` that reads params from env and calls it inside `vm.startBroadcast()`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {CryptToken} from "../src/CryptToken.sol";
import {CryptRepublicPassport} from "../src/CryptRepublicPassport.sol";
import {CryptGovernance} from "../src/CryptGovernance.sol";
import {CryptTreasury} from "../src/CryptTreasury.sol";
import {DividendDistributor} from "../src/DividendDistributor.sol";
import {CryptStaking} from "../src/CryptStaking.sol";
import {IPassport} from "../src/interfaces/IPassport.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

library DeployLib {
    struct Deployed {
        CryptToken token;
        CryptRepublicPassport passport;
        CryptGovernance governance;
        CryptTreasury treasury;
        DividendDistributor distributor;
        CryptStaking staking;
    }

    function deployAll(address admin) internal returns (Deployed memory d) {
        // Token and Treasury are mutually referential (Token mints initial supply to a holder; Treasury
        // holds the `crypt` immutable). Break the cycle: mint the initial supply to `admin`, then deploy
        // the Treasury with the token, then `configure` moves the supply admin -> treasury.
        d.token = new CryptToken(admin, admin, 100_000_000e18, 1_000_000_000e18);
        d.treasury = new CryptTreasury(admin, IERC20(address(d.token)));
        d.passport = new CryptRepublicPassport(admin, "https://api.cryptrepublic.example/passport/");
        // args: admin, passport, votingPeriod, quorumBps, executionDelay (fix #6), minCitizensForProposal (fix #10)
        d.governance =
            new CryptGovernance(admin, IPassport(address(d.passport)), 3 days, 2000, 2 days, 3);
        d.distributor =
            new DividendDistributor(admin, IPassport(address(d.passport)), IERC20(address(d.token)));
        d.staking = new CryptStaking(admin, IERC20(address(d.token)), 1180); // ~11.8% APR (mockup)
    }

    function configure(Deployed memory d, address admin) internal {
        // Caller must hold DEFAULT_ADMIN_ROLE on each contract (the `admin` used at deploy) AND the
        // initial $CRYPT supply (minted to `admin` in deployAll).
        d.token.transfer(address(d.treasury), d.token.balanceOf(admin)); // move genesis supply to treasury
        d.token.grantRole(d.token.MINTER_ROLE(), address(d.distributor));
        d.token.grantRole(d.token.MINTER_ROLE(), address(d.staking));
        d.token.grantRole(d.token.PAUSER_ROLE(), admin);
        d.treasury.grantRole(d.treasury.GOVERNANCE_ROLE(), address(d.governance));
        d.distributor.grantRole(d.distributor.FUNDER_ROLE(), address(d.treasury));
        d.distributor.grantRole(d.distributor.FUNDER_ROLE(), admin);
        d.staking.grantRole(d.staking.REWARDS_ADMIN_ROLE(), admin);
        d.passport.grantRole(d.passport.PASSPORT_ADMIN_ROLE(), admin);
        d.passport.grantRole(d.passport.GENESIS_ATTESTOR_ROLE(), admin);
        d.passport.setRequiredWitnesses(7); // spec: "7 Witnesses"
        d.governance.setTargetAllowed(address(d.treasury), true);
        // Major fix #6 + #10: governance execution timelock + min-citizens quorum floor are set at
        // construction (see CryptGovernance constructor: executionDelay, minCitizensForProposal); no extra
        // wiring needed here beyond allowlisting the treasury target. On a live net, admin roles then move
        // to the Safe + TimelockController per DEPLOY_RUNBOOK.md.
    }
}

contract Deploy is Script {
    function run() external returns (DeployLib.Deployed memory d) {
        address admin = vm.envOr("ADMIN", msg.sender);
        vm.startBroadcast();
        d = DeployLib.deployAll(admin);
        // Configure only if the broadcaster IS the admin (holds the roles); otherwise Configure.s.sol runs later.
        if (admin == msg.sender) DeployLib.configure(d, admin);
        vm.stopBroadcast();
        _log(d);
    }

    function _log(DeployLib.Deployed memory d) internal view {
        console2.log("CryptToken", address(d.token));
        console2.log("Passport", address(d.passport));
        console2.log("Governance", address(d.governance));
        console2.log("Treasury", address(d.treasury));
        console2.log("Distributor", address(d.distributor));
        console2.log("Staking", address(d.staking));
    }
}
```
Add `import {console2} from "forge-std/console2.sol";`. NOTE the deploy ORDER caveat: the spec lists `CryptToken → Passport → …`, and `CryptToken` + `CryptTreasury` are now mutually referential (the Token mints the initial supply to a holder; the Treasury takes the token as a constructor `immutable` so `fundDividends` can approve+open a dividend epoch atomically). This plan breaks the cycle by minting the genesis supply to `admin`, deploying the Treasury with the token, then `configure` transfers the supply admin → treasury (functionally the spec's intent: token held by treasury after genesis). DOCUMENT this ordering + supply-transfer in `DEPLOY_RUNBOOK.md`. Keep the wiring test + runbook consistent with this choice (the `DeployTest` asserts `token.balanceOf(treasury) == 100_000_000e18` after `configure`).

- [ ] **Step 4: Run the deploy-wiring test to verify it passes**

Run: `cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge test --match-contract DeployTest -vvv`
Expected: PASS.

- [ ] **Step 5: Implement `Configure.s.sol` and `SeedGenesis.s.sol`**

Create `contracts/script/Configure.s.sol` (reads deployed addresses from env vars — `CRYPT_TOKEN`, `PASSPORT`, etc. — and calls `DeployLib.configure` inside `vm.startBroadcast()`, for the case where deploy + configure are separate txns / the admin is a Safe). Create `contracts/script/SeedGenesis.s.sol` (reads the passport address + a list of seed citizen addresses from env, `genesisMint`s each inside a broadcast, then documents that `GENESIS_ATTESTOR_ROLE` should be revoked afterward). Both must compile and are exercised by the local anvil dry-run (Step 6), not necessarily by a unit test.

- [ ] **Step 6: Local anvil dry-run validation**

Start anvil in the background and run the deploy script against it with anvil's default dev key (NEVER a real key):
```bash
cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && anvil > /tmp/anvil.log 2>&1 &
sleep 2
forge script script/Deploy.s.sol:Deploy \
  --rpc-url http://127.0.0.1:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --broadcast -vvv
```
Expected: all six contracts deploy + configure; the six logged addresses appear; `broadcast/` JSON is written (git-ignored). Kill anvil afterward (`pkill anvil`). This proves the deploy pipeline end-to-end LOCALLY with no real funds. (`0xac09…` is anvil's well-known unfunded-on-mainnet default account #0 — safe for local only.)

- [ ] **Step 7: Run the FULL suite + coverage gate**

Run:
```bash
cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge fmt --check && forge build && forge test -vvv && forge coverage --report summary
```
Expected: all tests pass; coverage summary shows ≥95% line / ≥90% branch for every `src/*.sol`. If any `src/` file is under the gate, ADD targeted unit tests for the uncovered lines/branches (do NOT lower the gate) and re-run. Record the final coverage numbers in `contracts/audit/triage.md`.

- [ ] **Step 8: Run slither + solhint and triage**

Run (install if available — document as CI-optional if the environment cannot):
```bash
cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && slither . 2>&1 | tee /tmp/slither.txt || echo "slither unavailable — see triage.md"
npx solhint 'src/**/*.sol' 2>&1 | tee /tmp/solhint.txt || echo "solhint unavailable — see triage.md"
```
Create `contracts/audit/triage.md` listing every slither/solhint finding with a one-line disposition (fixed / false-positive-because-X / accepted-risk-because-Y), the final `forge coverage` numbers, and a statement that the suite is green on this commit. Fix any genuine issues (e.g. missing zero-address checks, unindexed events) and re-run the relevant tests.

- [ ] **Step 9: Write the USER runbook (`DEPLOY_RUNBOOK.md`)**

Create `contracts/docs/DEPLOY_RUNBOOK.md` documenting the EXACT user-run Base Sepolia + mainnet steps (from spec §8.3), making the deploy BOUNDARY explicit: the assistant validated everything locally; the USER runs the real deploy with their own hardware wallet / Safe. Include:
  - The reframed acceptance note: "Wave 4 assistant-scope = green suite + coverage gate + slither/solhint triaged + local anvil dry-run. 'Deployed & verified on Base Sepolia' + 'fork tests green against live addresses' are USER steps below."
  - Base Sepolia deploy commands (user runs; needs faucet ETH + RPC + Basescan key):
    ```bash
    export BASE_SEPOLIA_RPC=... ; export ETHERSCAN_API_KEY=...
    forge script script/Deploy.s.sol:Deploy --rpc-url $BASE_SEPOLIA_RPC --broadcast --verify --account <keystore-or-ledger>
    forge script script/Configure.s.sol --rpc-url $BASE_SEPOLIA_RPC --broadcast --account <keystore>
    forge script script/SeedGenesis.s.sol --rpc-url $BASE_SEPOLIA_RPC --broadcast --account <keystore>
    ```
  - Role transfer to Safe + `TimelockController`; revoke `GENESIS_ATTESTOR_ROLE` after seeding; publish `broadcast/<chainId>/` addresses into `config/tokens.ts` (Wave 5/6).
  - How to run fork tests once live addresses exist: `forge test --fork-url $BASE_SEPOLIA_RPC --match-path 'test/**/*fork*'` (scaffold optional; not required-green this wave).
  - The full mainnet runbook (spec §8.3 steps 1–8) verbatim-in-spirit + the AUDIT GATE + `// LEGAL:` reminders.
  - The deploy-order note (Token minted to `admin`, then Treasury deployed with the token, then `configure` moves the genesis supply admin → treasury; Token/Treasury are mutually referential) from Step 3.
  - The governance TIMELOCK model (Major fix #6): treasury drain is gated by Governance's built-in `executionDelay` (proposal is `Queued` until `end + executionDelay`, then `Succeeded`/executable) PLUS the `minCitizensForProposal` floor (Minor fix #10). Document the chosen in-Governance delay vs. the Governor+`TimelockController` alternative, and that live-net privileged CONFIG still routes through the Safe + `TimelockController`.
  - The dividend FUNDING model (Minor fixes #5/#7): `Treasury.fundDividends(distributor, amount)` approves + calls `DividendDistributor.openEpoch(amount)` atomically; `openEpoch` PULLS the funds so every epoch is fully backed. Event is `DividendsFunded(distributor, amount, epochId)` (amount+epoch match spec §6.5).
  - The `CryptStaking.setApr` PROSPECTIVITY note (Blocker fix #2): APR changes are genuinely prospective for ALL stakers via the on-chain Synthetix `rewardPerToken` accumulator (`setApr` checkpoints it first). Remove any older caveat implying prospectivity only held for recently-mutated stakers.

- [ ] **Step 10: Extend CI (`.github/workflows/foundry.yml`)**

Modify `.github/workflows/foundry.yml` to add, after `forge test -vvv`:
```yaml
      - name: Coverage gate
        run: forge coverage --report summary
      - name: Static analysis (slither)
        run: |
          pip install slither-analyzer || true
          slither . || echo "::warning::slither reported findings — see contracts/audit/triage.md"
        continue-on-error: true
      - name: Solhint
        run: npx --yes solhint 'src/**/*.sol' || echo "::warning::solhint findings — see contracts/audit/triage.md"
        continue-on-error: true
```
Keep `forge fmt --check` → `forge build` → `forge test -vvv` first. slither/solhint are `continue-on-error` (CI-optional) with the LOCAL triage authoritative (per locked decision). Do NOT touch `.github/workflows/web.yml`.

- [ ] **Step 11: Reframe spec §9 Wave 4 acceptance**

Modify the Wave 4 row in `docs/superpowers/specs/…-network-state-design.md` §9 so its acceptance reads (append, do not delete the audit intent): "Coverage gate met; all invariants pass; slither/solhint clean or triaged; **local anvil deploy dry-run green (assistant scope)**. Base Sepolia deploy + Basescan verification + fork tests against live addresses are a documented USER step (see `contracts/docs/DEPLOY_RUNBOOK.md`) requiring faucet ETH + RPC/explorer keys — NOT executed by the assistant." Add a one-line note under the table pointing to the runbook and the deploy BOUNDARY (§8.3).

- [ ] **Step 12: Format and commit**

```bash
cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge fmt && forge fmt --check
git add contracts/script contracts/test/Deploy.t.sol contracts/audit contracts/docs .github/workflows/foundry.yml docs/superpowers/specs/2026-07-01-cryptrepublic-network-state-design.md
git commit -m "chore(contracts): deploy/configure/seed scripts, coverage+slither CI, USER runbook

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Close-out — full-suite green, coverage gate, acceptance checklist

**Files:**
- Modify (only if fixes needed): any `src/`/`test/` file to close coverage/triage gaps.
- Create: `contracts/docs/WAVE4_ACCEPTANCE.md`

**Interfaces:**
- Consumes: everything from Tasks 1–9. Produces: the signed-off acceptance record.

- [ ] **Step 1: Run the entire gate end-to-end**

Run:
```bash
cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge fmt --check && forge build && forge test -vvv && forge coverage --report summary && forge snapshot --check
```
Expected: fmt clean; build clean; ALL tests pass (unit + fuzz + invariant across all six contracts + witness lib + deploy); coverage ≥95% line / ≥90% branch on every `src/*.sol`; gas snapshot matches. Fix any gap (add tests, never lower the gate) and re-run until fully green.

- [ ] **Step 2: Verify every locked invariant is present and passing**

Run: `cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge test --match-path 'test/*.invariant.t.sol' -vvv`
Expected: PASS. Confirm by name that ALL of these exist and pass: passport soulbound (`invariant_NoTransfersEver`), `balanceOf<=1` (`invariant_BalanceAtMostOne`), citizen-flag consistency `hasPassport[a]==(balanceOf(a)==1)` (`invariant_HasPassportMatchesBalance`, Blocker fix #1), `totalSupply==citizenCount` (`invariant_TotalSupplyEqualsCitizens`); token `sum(balances)==totalSupply` + `<=MAX_SUPPLY`; governance tally≤citizens + no-double-vote (+ no-execute-before-delay, Major fix #6); distributor no-double-claim + backed-solvency `remainingUnclaimed*perCitizen<=crypt.balanceOf(distributor)` (`invariant_SolvencyBacked`, Major fix #5); treasury outflows≤inflows + ETH conservation `balance==ethIn-ethOut` (`invariant_EthConservation`, Minor fix #8) + only-governance-spends; staking totalStaked==sum + principal-covered + rewards≤reserve (`invariant_ClaimedLeReserve` + `invariant_OwedRewardsBackedByFunding`, Blocker fix #2). If any is missing, add it (repeat the Task-N invariant pattern) before proceeding.

- [ ] **Step 3: Confirm the deploy BOUNDARY is honored**

Manually verify (grep + read): no test/script contains a real RPC URL, a real private key, a mainnet/Sepolia broadcast, or a funding of any contract with real value; the only broadcast is the LOCAL anvil dry-run with anvil's default key. Run: `git grep -nE '0x[a-fA-F0-9]{64}' contracts/script contracts/test | grep -v ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` — expect NO real-looking private keys (only the anvil default, which is public/local-only). Confirm `broadcast/` is git-ignored and not committed.

- [ ] **Step 4: Confirm app-side gate untouched and `// LEGAL:` markers present**

Run: `git status --porcelain | grep -vE '^\s*[AM]\s+(contracts/|\.github/workflows/foundry\.yml|docs/superpowers/)'` — expect NO app/TS files changed this wave. Run: `git grep -n "// LEGAL:" contracts/src` — expect markers in `CryptToken.sol`, `DividendDistributor.sol`, `CryptTreasury.sol` (token/dividend/treasury boundaries per spec §10). If the web CI is runnable, run `pnpm -C "/Users/justcurious/Desktop/CryptRepublic Web" test && pnpm -C "/Users/justcurious/Desktop/CryptRepublic Web" build` (or note it as unchanged-therefore-green).

- [ ] **Step 5: Write the acceptance record**

Create `contracts/docs/WAVE4_ACCEPTANCE.md` — a checklist mapping each Wave 4 acceptance criterion (reframed §9 + locked decisions) to evidence: contracts list + paths; `forge test` result (test count green); `forge coverage` final numbers per file; invariants present (list); slither/solhint disposition (link `audit/triage.md`); local anvil dry-run confirmation; deploy BOUNDARY statement (assistant did NOT deploy to any live net); app-side gate untouched; `// LEGAL:` markers present; pointer to `DEPLOY_RUNBOOK.md` for the USER's Base Sepolia + mainnet steps. State explicitly: "'Deployed & verified on Base Sepolia' and 'fork tests against live addresses' are USER-run follow-ups, not assistant-executed (spec §8.3 boundary)."

- [ ] **Step 6: Final format + commit**

```bash
cd "/Users/justcurious/Desktop/CryptRepublic Web/contracts" && forge fmt && forge fmt --check
git add contracts/docs/WAVE4_ACCEPTANCE.md
# plus any coverage/triage fix files touched in Step 1-2
git commit -m "docs(contracts): Wave 4 acceptance record + close-out (suite green, coverage gate met)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 7: Handoff summary**

Report to the user: all six contracts + witness lib built TDD-first; full unit/fuzz/invariant suite green; coverage gate met; slither/solhint triaged; deploy scripts validated on local anvil; the Base Sepolia + mainnet deploy is a documented USER step in `contracts/docs/DEPLOY_RUNBOOK.md`. Wave 5 (citizenship + mint UI) and Wave 6 (wallet screen) will wire these ABIs into the app via `config/tokens.ts` + `lib/wallet/*`.

---

## Self-Review Notes (for the plan author / first reviewer)

- **Spec coverage:** §6.2 Passport → Task 4; §6.3 CryptToken → Task 2; §6.4 Governance → Task 5; §6.5 Treasury → Task 6; §6.6 DividendDistributor → Task 7; §6.7 Staking → Task 8; §6.1 roles matrix → `Roles.sol` (Task 4) + `Configure` (Task 9) + Global Constraints table; witness EIP-712 lib → Task 3; §6.9 deploy scripts + local validation → Task 9; §8.1 test matrix (unit/fuzz/invariant per contract + coverage gate) → Tasks 2–8 + Task 10; §8.3 boundary + runbook → Task 9/10; §10 LEGAL markers → Tasks 2/6/7. OZ install + remap + Counter replacement → Task 1.
- **Reframed acceptance:** the spec §9 Wave 4 "deployed on Base Sepolia" is explicitly re-scoped to a USER step (Task 9 Step 11 edits the spec; Task 10 records it) per the locked deploy BOUNDARY.
- **Type consistency:** role constants are identical across `Roles.sol` and each contract's `public constant`; `IPassport` (`ownerOf`/`isCitizen`/`totalCitizens`/`balanceOf`) is consumed identically by Governance + Distributor; `WitnessAttestation.Attestation` struct + `WITNESS_TYPEHASH` shared between Task 3 lib and Task 4 passport; `DeployLib.Deployed` field names match the wiring test and `Configure`.
- **OZ v5 verification reminders** are embedded in every task that touches OZ (`_update`, `_hashTypedDataV4`, `_useNonce`, `ERC20Pausable` MRO, custom errors, `_requireOwned`) — the implementer MUST read the installed submodule source, as v5 diverges from v4.
- **Security-audit fixes applied (2026-07-01):** (1 BLOCKER) Passport `burn(uint256)` OVERRIDDEN to run the same policy as `renounce` (respects `burnEnabled`, clears `hasPassport`) + new invariant `hasPassport[a] == (balanceOf(a)==1)` + a burn-disabled revert test. (2 BLOCKER) `CryptStaking` rewritten to the Synthetix `rewardPerToken`/`userRewardPerTokenPaid` accumulator so `setApr` is GENUINELY prospective (checkpoints first); the 15e18 prospective test now passes; invariant that owed/claimed rewards never exceed the funded reserve. (3 MAJOR) `mintWithWitnesses` binds `attestations[i].nameHash == nameHash` (`NameHashMismatch`) + test. (4 MAJOR) `requiredWitnesses` defaults to 7 + `WitnessMintDisabled` guard when 0 + inert-when-unconfigured test. (5 MAJOR) `DividendDistributor.openEpoch` PULLS funds atomically (`safeTransferFrom`) so epochs are backed; invariant asserts `remainingUnclaimed*perCitizen <= crypt.balanceOf(distributor)`; under-funded test. (6 MAJOR) Governance execution timelock via `executionDelay` (`Queued`→`Succeeded`; `execute` reverts `TimelockNotElapsed` before `end+executionDelay`) + before-delay test. (7 MINOR) `Treasury.fundDividends(distributor, amount)` reconciled with spec §6.5 (`DividendsFunded(amount, epoch)`) and made atomic (approve+openEpoch). (8 MINOR) Treasury invariant handler now covers the ETH path (`fundEth`/`govDisburseEth`, `balance == ethIn-ethOut`). (9 MINOR) Passport `DOMAIN_SEPARATOR()` public view moved into the Step 4 implementation + Interfaces (witness helper depends on it). (10 MINOR) `minCitizensForProposal` floor so a tiny republic can't self-pass a drain, combined with the execution delay.
- **Known follow-ups flagged inline:** error-name reuse in Passport/Governance to tidy for clearer reverts (cosmetic). None block the acceptance gate.
