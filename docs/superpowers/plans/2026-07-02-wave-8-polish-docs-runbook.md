# CryptRepublic Wave 8 — Polish + Tests + Docs + Mainnet Runbook — Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL — before executing any task below, invoke `superpowers:test-driven-development` and `superpowers:executing-plans`. Every task is TDD: write the failing test FIRST (RED), then the implementation (GREEN), then run the stated command and confirm green. For docs tasks the "test" is the stated verification checklist + link-check. Do NOT skip the RED step. Keep ALL prior tests green (378 unit + 11 integration + 11 e2e + 165 forge as of Wave 7 close-out). Commit each task separately with the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.

## Goal

Wave 8 (spec §9, Wave 8 row) closes out the app for the user's mainnet handoff:

1. **Responsive/mobile polish** — match `Mobile.html` intent + the §7-intro breakpoints (≤1024 drawer / ≤860 `.hideSm` / ≤760 grid collapse; marketing home ≤640) with **CSS only** (no JS viewport redirects, no separate mobile pages).
2. **A11y + performance pass** — modal focus restore, `aria-labelledby`, global `:focus-visible`, landmarks, `prefers-reduced-motion` in JS animations, an automated axe-core smoke (no manual a11y claims), plus a minimal MEASURABLE perf gate (per-route First Load JS budget from `pnpm build` — A2 item 9; the spec-§9 "perf audit passes thresholds" half is implemented, not silently dropped).
3. **Error/empty/loading hardening** — `app/error.tsx`, `app/not-found.tsx`, `app/dashboard/error.tsx`, AuthForm busy indicator.
4. **Security hardening** — HSTS header; rate limits on the two unlimited Wave-7 mutation routes.
5. **CI gates** — Foundry coverage threshold (with the documented `--ir-minimum` exceptions) + `forge snapshot --check`.
6. **Complete test suites** — a tagged `@critical` critical-path Playwright spec + mobile smoke for the missing screens, with an explicitly documented honest release-gate split (browser UI chain with stubbed reads + on-chain proofs in the anvil integration suites).
7. **Docs** — root `README.md`, `docs/ARCHITECTURE.md`, `docs/ENV_REFERENCE.md`, `.env.mainnet.example`, `docs/MAINNET_HANDOFF.md` (rollback/pause, key custody, incident response, burn-in w/ P0–P1 triage), `docs/LEGAL_FLAGS_REFERENCE.md` (all 9 `// LEGAL:` markers + the in-UI note, mapped to spec §10.1), the **Pre-Mainnet Gate** checklist with HONEST statuses.
8. **Release prep** — `version: 0.8.0`, `CHANGELOG.md` (Waves 1–8), the full gate run, and the DOCUMENTED (user-run, post-merge) tag command.

Everything ships on the existing branch flow; no deploys, no keys, no funds — the Mainnet Runbook and Pre-Mainnet Gate are **USER-executed**.

## Verified ground truth (file:line — re-verify before editing; two survey findings corrected)

**Responsive.**

- `components/shell/shell.module.css` — drawer at ≤1024 (:45–70), `.hideSm` at ≤860 (:72–76), and the global collapse at ≤760 (:78–88): `.main :global([style*="grid-template-columns"]) { grid-template-columns: 1fr !important; }` + `.main aside { position: static !important; }` + `.topbar { padding: 12px 16px !important; }`.
- Inline screen grids (all confirmed): `components/wallet/WalletChainApp.tsx:227` `"1fr 360px"`; `components/governance/GovernanceApp.tsx:105` `"300px minmax(0, 1fr)"` + `:255` `"repeat(3, 1fr)"`; `components/treasury/TreasuryApp.tsx:97` `"1.5fr 1fr"` + `:228` `"14px 1fr 70px 90px"` (ROW grid); `components/holdings/HoldingsApp.tsx:136` `"1.5fr 1fr"` + `:152` `"1.4fr 1fr"` + `:257` `"repeat(2, 1fr)"`; `components/population/PopulationApp.tsx:88` `"1fr 1fr"` + `:268` `"140px 1fr 150px"` (ROW grid); `components/embassies/EmbassiesApp.tsx:119` `"repeat(3, 1fr)"`; `components/home/CitizenHomeApp.tsx:81` `"minmax(0, 1fr) 320px"` + `:88` `"repeat(3, 1fr)"`.
- **SURVEY CORRECTION #1:** `WalletChainApp` (route `app/dashboard/wallet/page.tsx`) **IS under the shell `.main`** (the dashboard layout wraps every dashboard route in `DashboardShell`; `components/shell/DashboardShell.tsx:23` renders `<main className={styles.main}>`). The screen NOT under the shell is the minimal exerciser `app/wallet/page.tsx` (`WalletApp`) and the marketing home `app/page.tsx`. The ≤760 collapse therefore already reaches WalletChainApp:227 — the A1 verify pass decides whether that behavior is correct, not whether it happens.
- `components/shell/Topbar.tsx:43` — hardcoded inline `padding: "20px 32px"` that shell.module.css:85–87 must fight with `!important`.
- Marketing home responsive state: `styles/tokens.css` has `@media (max-width:1000px)` (:225 — burger + `.mobile-menu`), `@media (max-width:1020px)` (:932 — `hero-grid`→1col etc.), `@media (max-width:640px)` (:963 — `cards3`/`quotes`/`hold-grid`→1col, `hero-stats` 2col, `.foot` 2col, `.wrap` 18px). `header.site` is already sticky (tokens.css:155–156). Mobile.html additionally prescribes: hero `h1{font-size:clamp(34px,9.6vw,44px)}`, passport `width:min(330px,88vw)` (tokens.css:1177 currently `min(330px, 78vw)`), stacked full-width hero CTAs, `.aum b{clamp(48px,13vw,64px)}`, `.sec-head h2{clamp(24px,6.6vw,30px)}`, sheet-style nav links. **CASCADE TRAP (verified):** the RETHEME section later in the same file re-declares `.hero h1 { font-size: clamp(36px, 5.4vw, 72px) }` (:1015–1017) and `.sec-head h2 { font-size: clamp(26px, 4vw, 46px) }` (:1018–1020) at EQUAL specificity and LATER source order — media queries do not raise cascade priority, so a hero-h1/sec-head-h2 clamp added to the :963 block is dead CSS. A SECOND `@media (max-width:640px)` block exists at :1503 (currently `.passport-book` only), AFTER the retheme. The mobile font clamps for those two selectors must land in the :1503 block (or a new ≤640 block appended after the retheme, :1023); `.aum b` and the other :963 additions are safe there (not re-declared later — verify per selector before choosing the block).
- e2e mobile coverage today: only `e2e/dashboard-screens.spec.ts:342–345` (390×844 burger/drawer check).

**A11y / perf / states.**

- `components/ui/Modal.tsx:26` focuses INTO the dialog; nothing restores focus to the trigger on close. `:48` uses `aria-label={title}` while the `h2` title sits at `:68` (switch to `aria-labelledby`).
- Only ONE `:focus-visible` style exists in the app: `.passport-book:focus-visible` (`styles/tokens.css:1187`). No global rule.
- **SURVEY CORRECTION #2:** the dashboard does NOT lack a `<main>` landmark (`DashboardShell.tsx:23`) and neither does auth (`app/auth/page.tsx:84`). The actual gaps: the marketing home `app/page.tsx` and `app/wallet/page.tsx` render sections with no `<main>`.
- `components/ui/LiveNumber.tsx:23–62` — rAF count-up with NO `prefers-reduced-motion` guard (JS animation; the tokens.css:143–151 `* { animation: none !important; }` CSS kill-switch cannot reach it).
- `app/dashboard/mint/components/SealingAnimation.tsx` — CSS keyframes inside an inline-SVG `<style>`; these ARE suppressed by the global tokens.css:143 reduced-motion rule (CSS cascades into inline SVG) — VERIFY, then add only a belt-and-braces in-component guard, not a rewrite.
- `components/wallet/SendModal.tsx:213` — the `<label>` WRAPS its control (valid implicit association). The htmlFor item is an AUDIT: add explicit `htmlFor`/`id` only where a label does NOT wrap its control.
- NO `app/error.tsx`, NO `app/not-found.tsx`, NO `app/dashboard/error.tsx` (confirmed absent).
- `app/auth/AuthForm.tsx` — `busy` state exists (:33) and disables the submit (:296) but the button label/appearance never changes: no visible busy indicator.
- `components/ui/Ledger.tsx:19` default `empty = "No entries yet."`; HoldingsApp ALREADY passes in-voice copy at `:521` ("The register is empty.") and `:561` ("No dividends claimed yet.") — the survey's (L) item is an AUDIT of any remaining generic defaults, not a known defect.

**Hardening / CI / tests / release.**

- `middleware.ts:60–63` sets CSP + `x-frame-options` + `referrer-policy` + `x-content-type-options`; NO `Strict-Transport-Security`.
- `app/api/governance/proposals/[id]/comments/route.ts` (POST) and `app/api/embassies/proposals/route.ts` (POST) import NO rate limiter (confirmed; only `register`/`login`/`siwe/verify` use `lib/auth/ratelimit.ts`). No e2e spec POSTs to either endpoint (grep-verified), so per-user limits cannot break the e2e run.
- `lib/auth/ratelimit.ts` — in-memory `rateLimit(key, limit, windowMs)` + `__resetRateLimit()`; `lib/http/responses.ts:15` has `tooManyRequests(retryAfterSec)` (429).
- `/api/auth/register` limit: **10 per 15 min per IP** (`app/api/auth/register/route.ts:17–22`). Current registrations in a full `pnpm e2e` run: auth.spec 1 + mint.spec 2 + wallet-screen.spec 2 + dashboard-screens.spec 3 = **8**.
- `.github/workflows/foundry.yml` — coverage step is `forge coverage --ir-minimum --report summary` with NO threshold; NO `forge snapshot --check` (snapshot exists: `contracts/.gas-snapshot`, 164 entries incl. 18 fuzz/invariant lines). `contracts/foundry.toml` has NO pinned fuzz seed (fuzz gas is nondeterministic → snapshot --check needs a seed).
- Documented coverage exceptions (`contracts/audit/triage.md`): CryptToken.sol **86.67% (13/15)** and CryptGovernance.sol **98.82% (84/85)** are `--ir-minimum` instrumentation artifacts; all other `src/*.sol` are at 100% lines.
- `.github/workflows/web.yml` + `e2e.yml` complete (SQLite; Postgres-in-CI is a documented deferral).
- `playwright.config.ts` — prod build webServer (`pnpm build && pnpm start`), `reuseExistingServer: !CI`.
- LEGAL markers (9, verified): `contracts/src/CryptToken.sol:10,11,32`; `contracts/src/CryptRepublicPassport.sol:74`; `contracts/src/DividendDistributor.sol:12,58`; `contracts/src/CryptTreasury.sol:16,46,62`. In-UI note: `components/holdings/HoldingsApp.tsx:19–21` (marker) + `:430–436` (visible note, test-asserted in `HoldingsApp.test.tsx:236–238`) + `app/dashboard/holdings/page.tsx:7`.
- `package.json` has NO `version` field; no `README.md`; no `CHANGELOG.md`; no git tags. `.env.mainnet.example` does NOT exist though spec §8.3 step 2 says "Copy `.env.mainnet.example` → `.env.mainnet`" (`contracts/docs/DEPLOY_RUNBOOK.md:160` says only "`.env.mainnet`").
- Env inventory (from `.env.example` + `config/chains.config.ts:95–97`): PUBLIC — `NEXT_PUBLIC_CHAIN_ENV`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`; SERVER-ONLY — `DATABASE_URL`, `RPC_BASE_SEPOLIA`, `RPC_BASE`, `RPC_ETHEREUM`, `RPC_ARBITRUM`, `RPC_OPTIMISM`, `RPC_POLYGON`, `RPC_SOLANA`, `RPC_ANVIL` (defaults `http://127.0.0.1:8545`), `ETHERSCAN_API_KEY`. **`.gitignore` does NOT cover `.env*`** (verified :7–10): it ignores only `.env`, `.env.*.local`, `.env.testnet`, `.env.mainnet` — `.env.local` and `.env.production` (both loaded by Next.js) are currently COMMITTABLE. D1 tightens this to a real `.env*` glob with `!.env.example` + `!.env.mainnet.example` negations; never document "`.env*` is git-ignored" before that edit lands.

---

## Global Constraints (NON-NEGOTIABLE — copy into working memory)

1. **ZERO regressions.** All 378 unit + 11 integration + 11 e2e + 165 forge tests stay green after EVERY task. Responsive/a11y refactors are HIGH-RISK for existing Playwright assertions (`e2e/home.spec.ts` asserts 8 `<section>`s, `#passportBook`, the "48 392" count-up, and ZERO console errors; `e2e/dashboard-screens.spec.ts` asserts the burger at 390×844, topbar text, and many testids; `e2e/wallet-screen.spec.ts` asserts send-confirm testids). Every task ends by re-running the suites it can affect.
2. **Assistant/user boundary EVERYWHERE in docs.** The Mainnet Runbook + Pre-Mainnet Gate are USER-executed; the assistant never deploys, signs, holds keys, or moves funds. Gate items 1 (external audit), 2 (burn-in), 5 (bug bounty), 6 (legal sign-off) CANNOT be completed by the assistant — present them as an honest actionable USER checklist with status **OPEN**, never claimed done. Items 3 (suite green) and 4 (slither/solhint triaged) can be EVIDENCED (link the close-out run + `contracts/audit/triage.md`).
3. **Honesty.** No fabricated claims in docs (no "audited", no invented dates/metrics/uptime); LEGAL flags quoted VERBATIM; e2e stubs stay deterministic; `TESTNET`/`SIMULATED`/`SEEDED` tags stay intact. The critical-path e2e is explicitly documented as the UI-side chain with stubbed reads — NEVER presented as a full on-chain browser test (the on-chain seal/vote/claim proofs are `test/integration/{mint,wallet,governance-dividends}-e2e.test.ts` on anvil).
4. **Security posture must not weaken.** CSP/nonce untouched (HSTS is ADDITIVE); rate limits reuse `lib/auth/ratelimit.ts` with per-user keys and sane limits; NO e2e spec POSTs to the two newly limited endpoints (verified) — keep it that way; `pnpm guard:secrets` stays green.
5. **Register rate-limit budget.** TOTAL registrations across one full `pnpm e2e` run stay UNDER 10. Current: 8. This plan adds exactly ONE (Task C1's critical path). The axe dashboard scan rides INSIDE the C1 context; the C2 mobile smoke of home + auth registers NOBODY; C2's mint/wallet mobile checks also ride inside C1; A1's per-screen 390×844 no-overflow checks ride inside `dashboard-screens.spec.ts`'s three EXISTING registered contexts (zero new registrations). Final total: **9**. Every new spec carries a header comment documenting this budget.
6. **CSS-first responsive.** No JS viewport redirects, no separate mobile pages, no `Mobile.html`-style `location.replace`. Respect `prefers-reduced-motion`. Design tokens unchanged (radius 0, navy/blue/gold/paper palette, uppercase headings, mono data labels).
7. **CI edits keep workflows self-contained + green.** The coverage gate encodes the documented exceptions from `contracts/audit/triage.md`: every `src/*.sol` ≥95% lines EXCEPT the two artifacts, which are pinned to not REGRESS — CryptToken.sol ≥ 86.67% (13/15) and CryptGovernance.sol ≥ 98.82% (84/85). The spec-§8.1 **≥90% branch** half of the gate is resolved EXPLICITLY, never silently dropped: pin per-file no-regress branch floors from the current `--ir-minimum` run OR waive the 90% branch threshold in the script header + workflow comment citing `contracts/audit/triage.md:22–39` (`--ir-minimum` inflates branch denominators — CryptGovernance 71.43%, CryptStaking 60%, Passport 89.47% under instrumentation); the decision is recorded in coverage-gate.sh, foundry.yml, and the final checklist (B2). `forge snapshot --check` requires a pinned fuzz seed first (verify determinism locally, twice, before wiring CI) AND a version-pinned CI toolchain — `foundry.yml:13`'s `foundry-rs/foundry-toolchain@v1` has no `version:` input today, so CI installs whatever forge "stable" is current while the snapshot is regenerated with the LOCAL forge; fuzz seed→input mapping is not guaranteed stable across forge versions (B2 pins it).
8. **Per-task commits** with the trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. TDD: RED test first where testable; docs tasks use the stated verification checklist + link-check as their gate. All new `.md`/`.ts`/`.css` files must pass `pnpm format:check` (Prettier formats markdown too).
9. **Verify-then-fix.** The ≤760 `!important` collapse may ALREADY do the right thing for most screens (they live under `.main`) and the WRONG thing for row-level grids (`TreasuryApp.tsx:228`, `PopulationApp.tsx:268` are table-row layouts that must NOT stack). Task A1 starts with an observation pass at 1024/760/390 px and chooses ONE deliberate mechanism; no blind rewrites.

---

## File Structure (new/edited)

```
app/
  error.tsx                          # NEW (A3) — global error boundary
  not-found.tsx                      # NEW (A3)
  dashboard/error.tsx                # NEW (A3) — dashboard segment boundary
  page.tsx                           # EDIT (A2) — <main> landmark
  wallet/page.tsx                    # EDIT (A2) — <main> landmark
  auth/AuthForm.tsx                  # EDIT (A3) — visible busy indicator
components/
  shell/Topbar.tsx                   # EDIT (A1 padding → module; A2 CHAIN ONLINE contrast fix)
  shell/shell.module.css             # EDIT (A1) — deliberate collapse mechanism
  ui/Modal.tsx (+ Modal.test.tsx)    # EDIT (A2) — focus restore + aria-labelledby
  ui/LiveNumber.tsx (+ .test.tsx)    # EDIT (A2) — reduced-motion guard
  treasury/TreasuryApp.tsx           # EDIT (A1) — row-grid opt-out tag
  population/PopulationApp.tsx       # EDIT (A1) — row-grid opt-out tag
  embassies/EmbassiesApp.tsx         # EDIT (A1) — 2-col step ≤1024
  (other *App.tsx only as the A1 verify pass demands)
styles/tokens.css                    # EDIT (A1 marketing ≤640 gaps; A2 global :focus-visible)
middleware.ts                        # EDIT (B1) — HSTS (additive)
app/api/governance/proposals/[id]/comments/route.ts  # EDIT (B1) — per-user rate limit
app/api/embassies/proposals/route.ts                 # EDIT (B1) — per-user rate limit
.github/workflows/foundry.yml        # EDIT (B2) — coverage gate + snapshot --check
contracts/foundry.toml               # EDIT (B2) — pinned fuzz seed
contracts/scripts/coverage-gate.sh   # NEW (B2)
contracts/.gas-snapshot              # REGENERATE (B2, deterministic under the seed)
e2e/
  critical-path.spec.ts              # NEW (C1) — @critical tag + axe stations + mobile checks
  a11y.spec.ts                       # NEW (A2) — axe smoke, public pages
  mobile-smoke.spec.ts               # NEW (C2) — home + auth @ 390×844
  dashboard-screens.spec.ts          # EDIT (A1) — 390×844 no-overflow checks on every visited screen + guarded row-grid check (population step)
package.json                         # EDIT (A2 axe devDep; C1 e2e:critical script; D3 version)
README.md                            # NEW (D1)
docs/ARCHITECTURE.md                 # NEW (D1)
docs/ENV_REFERENCE.md                # NEW (D1)
.env.mainnet.example                 # NEW (D1) — placeholders ONLY
.gitignore                           # EDIT (D1) — real .env* glob + !.env.example / !.env.mainnet.example negations
contracts/docs/DEPLOY_RUNBOOK.md     # EDIT (D1) — step-2 (~:160) + step-6 (~:170) reference fixes
docs/MAINNET_HANDOFF.md              # NEW (D2)
docs/LEGAL_FLAGS_REFERENCE.md        # NEW (D2)
CHANGELOG.md                         # NEW (D3)
```

---

# GROUP A — UX POLISH

---

## Task A1 — Responsive: verify-then-fix the grid-collapse mechanism; per-screen fixes; Topbar padding; marketing home ≤640; e2e assertions

**Files:** EDIT `components/shell/shell.module.css`, `components/shell/Topbar.tsx`, `components/treasury/TreasuryApp.tsx`, `components/population/PopulationApp.tsx`, `components/embassies/EmbassiesApp.tsx`, `styles/tokens.css`, `e2e/dashboard-screens.spec.ts` (+ other `*App.tsx` ONLY where the verify pass shows breakage).

**READ FIRST:** `components/shell/shell.module.css` (WHOLE file — esp. :45–88), `components/shell/Topbar.tsx` (:38–50), the eight inline-grid sites listed in "Verified ground truth", `Mobile.html` (:26 `.wrap` 560px/18px, :49–58 sticky header + `.sheet`, :70–76 hero clamps + CTAs, :80–87 `.pflip` `min(330px,88vw)` + `.ptabs`, :167/:192/:233 section clamps), `styles/tokens.css` `@media` blocks (:225, :932–961, :963–997) + `.passport-book` sizing (:1170–1210), `e2e/home.spec.ts` (assertions that MUST stay green), `e2e/dashboard-screens.spec.ts` (:340–346 mobile pattern), spec §7 intro (responsive rules).

**Step 0 — OBSERVE (do this before any edit; record findings in the commit body):**

Run the prod build (`pnpm build && pnpm start`) and inspect at 1280 / 1024 / 761 / 760 / 390 px widths (Playwright screenshots or a browser):

- `/dashboard`, `/dashboard/governance`, `/dashboard/treasury`, `/dashboard/holdings`, `/dashboard/population`, `/dashboard/embassies`, `/dashboard/wallet` — confirm the ≤760 rule collapses the screen-level two-column grids (expected GOOD) and ALSO stacks the row grids `TreasuryApp.tsx:228` ("14px 1fr 70px 90px" allocation rows) and `PopulationApp.tsx:268` ("140px 1fr 150px" top-cities rows) into vertical piles (expected BAD — each ledger row becomes 3–4 stacked cells).
- `/dashboard/embassies` at 761–1024: `repeat(3, 1fr)` cards get narrow; decide whether a 2-col step at ≤1024 is needed (recommended) or 3-col holds (record either way).
- `/` (marketing home) at 390: compare against `Mobile.html` — hero h1 size, CTA stacking, passport width, hero-stats, section heads, AUM figure, footer, nav sheet.
- Check horizontal overflow everywhere: `document.documentElement.scrollWidth <= window.innerWidth`.

**Chosen mechanism (deliberate, ONE mechanism — adjust only if Step 0 contradicts it):**

1. **KEEP the global ≤760 collapse rule** in `shell.module.css` (it is load-bearing for every dashboard screen and asserted-adjacent in e2e), but refine the selector to exempt row grids: `.main :global([style*="grid-template-columns"]:not([data-grid="row"]))`. Tag the two row grids (`TreasuryApp.tsx:228`, `PopulationApp.tsx:268`, plus any more found in Step 0 — e.g. ledger row layouts) with `data-grid="row"`. Result: screen grids collapse, table rows keep their columns.
2. **Embassy cards 3→2→1:** add `data-grid="cards"` on `EmbassiesApp.tsx:119` and, inside a `@media (max-width:1024px)` block in shell.module.css, EXACTLY this rule: `.main :global([data-grid="cards"]) { grid-template-columns: repeat(2, 1fr) !important; }` (the ≤760 global rule then takes it to 1). BOTH parts are load-bearing: the `.main` local-class prefix is REQUIRED (Next.js CSS-modules pure-selector enforcement — a bare attribute selector fails `pnpm build` with "Selector is not pure"; every existing `:global` rule in shell.module.css is prefixed the same way), and `!important` is REQUIRED to beat the INLINE `style` grid on EmbassiesApp.tsx:119 (inline styles win over any non-`!important` stylesheet rule — same reason the existing ≤760 rule at :79–81 uses it). Skip if Step 0 shows 3-col is fine ≥761 — record the decision.
3. **Topbar:** delete the inline `padding: "20px 32px"` from `Topbar.tsx:43`; add `padding: 20px 32px;` to the `.topbar` base rule in shell.module.css; the ≤760 override (:85–87) can then drop `!important`.
4. **WalletChainApp (IS under `.main` — correction #1):** verify the 1fr 360px rail collapses correctly at ≤760 via the global rule and that 761–1024 is not cramped. Only touch `WalletChainApp.tsx:227` if Step 0 shows actual breakage (e.g. change to `minmax(0,1fr) 360px` for overflow).
5. **Marketing home ≤640 (Mobile.html-equivalent, CSS-first — PLACEMENT MATTERS, see the cascade trap in ground truth):** the `.hero h1 { font-size: clamp(34px, 9.6vw, 44px); }` and `.sec-head h2 { font-size: clamp(24px, 6.6vw, 30px); }` clamps MUST go into the SECOND `@media (max-width:640px)` block at tokens.css:1503 (after the RETHEME section) or a new ≤640 block appended after the retheme (:1023) — NOT the :963 block, where the retheme's later equal-specificity re-declarations (`.hero h1` :1015–1017, `.sec-head h2` :1018–1020) win at every viewport and make them dead CSS. The remaining additions are safe in the :963 block (verify each selector is not re-declared after :963 before placing it): `.hero-ctas` stacked full-width (`grid-template-columns: 1fr` + `.btn` block); `.passport-stage`/passport width `min(330px, 88vw)` (align tokens.css:1177's `78vw`); `.aum b { font-size: clamp(48px, 13vw, 64px); }` (match the actual class names in tokens.css — verify each selector exists before styling it); nav sheet: verify the existing `.mobile-menu` (≤1000px, tokens.css:225) provides the burger + full-width stacked links (Mobile.html `.sheet` equivalence: block links, border separators) — patch its styles, do NOT add JS. `.foot` 2-col + `.wrap` 18px already exist (:963 block). **NO JS redirect, no new page.** Do not rename classes `home.spec.ts` depends on; the `#passportBook` id and the 8 `<section>`s must survive.
6. **e2e extension (placement is load-bearing):** in `e2e/dashboard-screens.spec.ts`:
   - **Existing 390×844 home block (:342–345):** add ONLY the no-horizontal-overflow assertion (`page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)`). Do NOT put the row-grid check here — the home block runs on `/dashboard` in the FIRST test, where NO `[data-grid="row"]` element renders (top-cities rows are `PopulationApp.tsx:268`, visited only in the SECOND test at :419–424, at 1280×800): a locator would match zero elements and the check would be vacuous or fail on a missing element.
   - **Row-grid integrity check → the population step of the SECOND test (:419–424; optionally also the treasury step for `TreasuryApp.tsx:228`):** wrap it in its own `setViewportSize({ width: 390, height: 844 })` → assert → restore `1280×800`. Guard against vacuity FIRST: `const rows = page.locator('[data-grid="row"]'); expect(await rows.count()).toBeGreaterThan(0);` — THEN assert each row's `getComputedStyle(...).gridTemplateColumns` keeps >1 column at the mobile viewport.
   - **Spec-§8.1 "mobile-viewport smoke of all 8 screens" closure:** at EVERY dashboard screen the spec already visits (governance + treasury in test 1; holdings, population, embassies in test 2), add a brief `setViewportSize(390×844)` → no-horizontal-overflow assertion → restore. Zero new registrations (rides the existing contexts); mint + wallet + passport mobile checks ride inside C1 (stations 7/9); home + auth land in C2.

**TDD steps:**

1. [ ] RED — extend `e2e/dashboard-screens.spec.ts` per mechanism item 6: the no-overflow assertion in the existing home block, the per-screen 390×844 no-overflow checks, and the GUARDED row-grid-integrity check in the population step of the second test (its `count > 0` guard proves it isn't vacuous; the column assertion fails until `data-grid="row"` exempts the rows). Marketing: add a temporary check via the C2-style pattern or verify manually in Step 0 (the durable marketing mobile assertions land in C2).
2. [ ] GREEN — apply mechanism items 1–5.
3. [ ] Run `pnpm e2e e2e/dashboard-screens.spec.ts e2e/home.spec.ts e2e/wallet-screen.spec.ts` — green (Constraint #1: home.spec's 8 sections / #passportBook / "48 392" / zero-console-errors intact). Run `pnpm test` (unit) — green.
4. [ ] Commit (record Step-0 findings + decisions in the body).

---

## Task A2 — A11y: modal focus restore + aria-labelledby; global :focus-visible; landmarks; reduced-motion; htmlFor audit; axe-core smoke

**Files:** EDIT `components/ui/Modal.tsx` + `components/ui/Modal.test.tsx`, `components/ui/LiveNumber.tsx` (+ NEW `components/ui/LiveNumber.test.tsx` if absent), `styles/tokens.css`, `app/page.tsx`, `app/wallet/page.tsx`, `app/dashboard/mint/components/SealingAnimation.tsx` (comment/guard only), `components/shell/Topbar.tsx` (item 8 — CHAIN ONLINE contrast), `package.json` (devDep). NEW `e2e/a11y.spec.ts`.

**READ FIRST:** `components/ui/Modal.tsx` (whole — :20–28 focus-in effect, :44–49 dialog attrs, :68 h2), `components/ui/Modal.test.tsx` (existing assertions), `components/ui/LiveNumber.tsx` (:23–62 rAF loop), `styles/tokens.css:143–151` (the `* { animation: none !important; }` reduced-motion kill-switch) + `:1187` (`.passport-book:focus-visible`), `app/page.tsx` + `app/wallet/page.tsx` (landmark gaps — correction #2: dashboard + auth already have `<main>`), `components/wallet/SendModal.tsx:213` (label WRAPS control — valid), `e2e/home.spec.ts` (zero-console-errors pattern to reuse).

**Exact changes:**

1. **Modal focus restore + labelling** (`Modal.tsx`):
   - **In a SEPARATE mount-only `useEffect(() => { … }, [])`** — NOT the existing `[onClose]`-keyed effect at :20–28 — capture `document.activeElement` (as `HTMLElement | null`) in a ref and focus the dialog; in that effect's cleanup (unmount only), restore focus to the captured element, and only if focus is still inside the dialog (or on `body`) — never yank focus the user has deliberately moved elsewhere. RATIONALE (verified trap): the only production caller passes an inline closure (`EmbassiesApp.tsx:131 onClose={() => setShowModal(false)}`) and EmbassiesApp re-renders every 12s via `useChainInfo`'s poll (`lib/hooks/useChainInfo.ts:23,72`) — a new `onClose` identity each tick. Capture/restore keyed on `[onClose]` would run cleanup + re-run on EVERY tick, stealing focus from a user typing in the propose-embassy form every 12 seconds.
   - Give the `h2` an `id` (derive from `useId()`), replace `aria-label={title}` with `aria-labelledby={titleId}`.
2. **Global focus ring** (`styles/tokens.css`, near the base element styles): `:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }` (radius 0 by default — token-conformant). Verify `.passport-book:focus-visible` (:1187) still wins its own treatment (it's more specific).
3. **Landmarks:** wrap the marketing home's section stack in `<main>` (`app/page.tsx`) and the wallet exerciser's content in `<main>` (`app/wallet/page.tsx`). Do NOT touch `DashboardShell` (already `<main>`, :23) or auth (`app/auth/page.tsx:84`). CAUTION: `e2e/home.spec.ts` asserts `page.locator("section")` count = 8 — a `<main>` wrapper doesn't change that; verify.
4. **LiveNumber reduced-motion:** at the top of the effect, `if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setN(value); return; }` (skip observer + rAF entirely).
5. **SealingAnimation:** VERIFY the tokens.css:143 kill-switch reaches the inline-SVG animations (it should — CSS cascades into inline SVG). Add a belt-and-braces guard INSIDE the component's `<style>` block: `@media (prefers-reduced-motion: reduce) { .cr-ring, .cr-ring-r, .cr-pulse { animation: none; } }` + a comment. No structural rewrite.
6. **htmlFor audit:** grep all `<label` usages in `components/` + `app/`; where a label does NOT wrap its control, add `htmlFor` + `id`. (`SendModal.tsx:213` wraps — leave it.) Record the audited list in the commit body.
7. **axe-core smoke:** `pnpm add -D @axe-core/playwright` (pin exact version). NEW `e2e/a11y.spec.ts`: scans `/` and `/auth` (NO registration — Constraint #5) with `new AxeBuilder({ page }).analyze()`. **Documented threshold:** ZERO `critical` and ZERO `serious` violations; `moderate`/`minor` are logged (`console.log`) not failed. Any exclusion (`.exclude(selector)`) requires an in-file comment justifying it. The DASHBOARD axe stations ride inside Task C1's critical-path context (no extra registration) — note that forward reference in this spec's header comment. Heading-hierarchy + contrast come from axe rules — no manual claims.
8. **Known contrast violation — PRE-DECIDED fix (Topbar CHAIN ONLINE):** `Topbar.tsx:115` renders "CHAIN ONLINE" at 12px in `var(--gold-d)` (#9d8246) on the white header background (:45) — computed contrast ≈3.7:1 < 4.5:1, a guaranteed axe `color-contrast` SERIOUS hit on EVERY dashboard screen C1 scans. Resolution (decided HERE so item 7's "fix serious findings" and Constraint #6's "tokens unchanged" never collide at gate time): swap that ONE usage to an existing compliant token — `var(--ink)` or `var(--blue)`, whichever measures ≥4.5:1 on #fff (verify with a contrast checker before committing) — and record it in the commit body as a deliberate a11y fix. The token DEFINITIONS in `styles/tokens.css` are untouched, so Constraint #6 (which governs the palette, not every usage) is preserved. `dashboard-screens.spec.ts`'s topbar assertions check TEXT, not color — re-run them to confirm they survive. Do NOT add an axe exclusion for this element and do NOT weaken the threshold.
9. **Perf pass (minimal, MEASURABLE — the spec-§9 "perf audit passes thresholds" half):** run `pnpm build` and record the per-route First Load JS table in the commit body; commit the baseline + budget (every route ≤ its measured baseline, no-regress) into `docs/ARCHITECTURE.md`'s testing/perf section (D1 links it) so D3's gate has a real threshold to verify against. The OPTIONAL perf items are DEFINED here: modal code-splitting (`next/dynamic`) and list memoization — do them ONLY if a route exceeds the budget AND the change is trivially safe; otherwise record an explicit deferral note (with the measured numbers) in the commit body. No Lighthouse or perf-score claims without actually running the tool.

**TDD steps:**

1. [ ] RED — extend `Modal.test.tsx`: (a) focus moves into the dialog on open (existing), (b) NEW: focus RETURNS to the previously focused element on unmount (render a trigger button, focus it, mount modal, unmount, assert `document.activeElement` is the trigger), (c) NEW: dialog is labelled by the visible `h2` (`getByRole("dialog", { name: title })` resolving via `aria-labelledby`), (d) NEW — the 12s-poll regression guard: mount the modal, move focus to an input INSIDE it, re-render with a NEW `onClose` function identity (simulating EmbassiesApp's poll tick), and assert focus is NOT yanked (still on that input). NEW `LiveNumber.test.tsx`: with `matchMedia` mocked to `matches: true`, the rendered text is the FINAL value immediately (no 0 frame persisted). All fail first.
2. [ ] GREEN — implement changes 1–6 and 8 (the pre-decided Topbar contrast fix).
3. [ ] Write `e2e/a11y.spec.ts` (change 7) and run `pnpm e2e e2e/a11y.spec.ts` — green under the documented threshold; fix any critical/serious findings it surfaces (in-scope for this task; the known Topbar hit is already fixed by change 8 — any NEW conflict between a finding and Constraint #6 must be resolved the same way: usage-level swap to a compliant existing token, recorded, never a silent threshold weakening or unjustified exclusion).
4. [ ] Perf baseline (change 9): `pnpm build`, record the First Load JS table + the optional-items done/deferred decision in the commit body; stage the budget table for D1's ARCHITECTURE section.
5. [ ] Run `pnpm test` (all unit — Modal is reused by cast-vote/claim/propose flows; their tests must stay green) + `pnpm e2e e2e/wallet-screen.spec.ts e2e/dashboard-screens.spec.ts e2e/home.spec.ts` — green.
6. [ ] Commit.

---

## Task A3 — States: app/error.tsx + app/not-found.tsx + app/dashboard/error.tsx; AuthForm busy indicator; holdings empty-copy audit

**Files:** NEW `app/error.tsx`, `app/not-found.tsx`, `app/dashboard/error.tsx` (+ NEW colocated tests where jsdom-testable), EDIT `app/auth/AuthForm.tsx` (+ its test file), AUDIT `components/holdings/HoldingsApp.tsx` empty copy.

**READ FIRST:** Next.js App Router error-boundary contract (`error.tsx` must be `"use client"` with `{ error, reset }` props; `not-found.tsx` is a Server Component), `app/auth/AuthForm.tsx` (:33 busy, :64/:119 guards, :293–299 submit button), `app/auth/auth.module.css` (existing `.err`/console styles to reuse), `components/ui/Ledger.tsx:19` + `components/holdings/HoldingsApp.tsx:500–561` (empty props ALREADY in-voice — audit, don't assume), the design voice (uppercase headings, mono kickers, in-universe copy like "RECORD NOT FOUND").

**Exact changes:**

1. **`app/error.tsx`** (`"use client"`): in-voice copy (e.g. kicker `SYSTEM FAULT`, heading "THE REPUBLIC ENCOUNTERED AN ERROR", body honest and generic — NEVER `error.message` raw to avoid leaking internals), a `RETRY` button calling `reset()`, and a link home. Design tokens only.
2. **`app/not-found.tsx`**: in-voice 404 (e.g. kicker `RECORD NOT FOUND`, "THIS TERRITORY IS UNCHARTED", link back to `/` + `/dashboard`).
3. **`app/dashboard/error.tsx`** (`"use client"`): dashboard-segment boundary rendering INSIDE the shell chrome slot with per-segment `RETRY` via `reset()`; same voice.
4. **AuthForm busy indicator:** when `busy`, the submit button shows a visible working state — label swap (`AUTHENTICATE →` → `AUTHENTICATING…` / `CREATE RECORD & PROCEED TO MINT →` → `TRANSMITTING…`) + `aria-busy="true"`; keep `disabled={busy}`. CAUTION: `e2e/auth.spec.ts` clicks `getByRole("button", { name: /AUTHENTICATE/i })` and `/MINT/i` — the IDLE labels must keep matching those regexes (they do; only the busy-state label changes).
5. **Holdings empty-copy audit:** verify `:521`/`:561` in-voice strings render (they exist); fix any OTHER Ledger/empty slot still showing the generic `"No entries yet."` default across the dashboard screens (grep `empty=` usage per screen; record findings).

**TDD steps:**

1. [ ] RED — colocated tests: `app/error.test.tsx` (renders heading + calls `reset` on RETRY click), `app/not-found.test.tsx` (renders + links), `app/dashboard/error.test.tsx` (same contract); AuthForm test asserting the busy label + `aria-busy` while a submission promise is pending. All fail first.
2. [ ] GREEN — implement 1–5.
3. [ ] Run `pnpm test` + `pnpm e2e e2e/auth.spec.ts` — green. Manually confirm `/definitely-not-a-route` renders the 404 in the prod build.
4. [ ] Commit.

---

# GROUP B — HARDENING + CI

---

## Task B1 — HSTS + per-user rate limits on the two Wave-7 mutation routes

**Files:** EDIT `middleware.ts` (+ `middleware.test.ts` if present — verify), `app/api/governance/proposals/[id]/comments/route.ts` + its `route.test.ts`, `app/api/embassies/proposals/route.ts` + its `route.test.ts`.

**READ FIRST:** `middleware.ts` (:59–64 — where headers are set; CSP/nonce logic MUST NOT change), `lib/auth/ratelimit.ts` (the `rateLimit(key, limit, windowMs)` + `__resetRateLimit()` contract + the DEV/SINGLE-INSTANCE posture comment), `app/api/auth/register/route.ts:16–22` (the exact usage pattern to mirror: check → `tooManyRequests(rl.retryAfterSec)`), `lib/http/responses.ts:15` (`tooManyRequests`), both target routes IN FULL (their POST handlers: `requireSession` → origin check → Zod → on-chain passport verification — insert the limiter AFTER `requireSession` so the key is per-user), the routes' existing tests (setup/mocking pattern), and grep e2e for any POST usage of these endpoints (none today — keep it none).

**Exact changes:**

1. **HSTS (additive):** in `middleware.ts` after `:63`, set `Strict-Transport-Security: max-age=31536000; includeSubDomains` ONLY when `process.env.NODE_ENV === "production"` (localhost dev must not cache HSTS). No `preload` (submitting to the preload list is a user decision — note it in D2). CSP/nonce/other headers byte-identical.
2. **Comments POST** (`app/api/governance/proposals/[id]/comments/route.ts`): after the session resolves, `rateLimit(\`comment:${session.userId}\`, 10, 5 * 60_000)` → `tooManyRequests(rl.retryAfterSec)` on failure. (Field name for the user id: match what `requireSession` actually returns — READ `lib/auth/guard.ts`.)
3. **Embassy proposals POST** (`app/api/embassies/proposals/route.ts`): `rateLimit(\`embassy-propose:${session.userId}\`, 5, 15 * 60_000)` → 429. Per-user keys, NOT IP (Constraint #4).

**TDD steps:**

1. [ ] RED — **FIRST, before the limiter lands:** add `__resetRateLimit()` to a file-level `beforeEach` in BOTH existing suites — `app/api/embassies/proposals/route.test.ts` AND `app/api/governance/proposals/[id]/comments/route.test.ts`. This is a REGRESSION GUARD, not just setup for the new tests: the embassy suite already fires 6 authenticated POSTs as the SAME user in one file run (route.test.ts:93–133 — five rejection cases then the happy path), so with a 5/15min limit inserted after `requireSession` (i.e. before Zod), the pre-existing happy-path test draws a 429 without the reset and the currently-green suite goes red. NOTE: the only existing `__resetRateLimit()` caller in the repo is `lib/auth/ratelimit.test.ts:6` — mirror THAT; the register-route tests (`test/auth-routes.test.ts`) contain NO such reset (they merely stay under the 10-register limit). THEN the new route tests: (a) 11th comment POST within the window (same user) → 429 with `Retry-After`; 10 sequential comments succeed (normal use unaffected); (b) 6th embassy-proposal POST → 429; 5 succeed; (c) a DIFFERENT user is NOT limited by the first user's hits. Middleware: a test (or extend the existing middleware test if present) asserting HSTS present in production mode and ABSENT in dev, and that CSP/XFO/nosniff/referrer-policy are unchanged. All fail first.
2. [ ] GREEN — implement.
3. [ ] Run `pnpm test` (all unit incl. the two route suites) + `pnpm e2e` (FULL — confirms no e2e path trips the new limits and CSP still passes `wallet-csp.spec.ts`) — green. `pnpm guard:secrets` green.
4. [ ] Commit.

---

## Task B2 — CI gates: Foundry coverage threshold (with documented exceptions) + `forge snapshot --check`

**Files:** NEW `contracts/scripts/coverage-gate.sh`, EDIT `contracts/foundry.toml`, `.github/workflows/foundry.yml`, REGENERATE `contracts/.gas-snapshot`.

**READ FIRST:** `.github/workflows/foundry.yml` (whole — the coverage step's `--ir-minimum` comment; slither/solhint steps stay `continue-on-error`), `contracts/audit/triage.md` (the coverage table + BOTH artifact justifications — the gate must encode them, not erase them), `contracts/foundry.toml` (no `[fuzz]` section today), `contracts/.gas-snapshot` (164 entries; 18 fuzz/invariant lines whose gas is seed-dependent).

**Exact changes:**

1. **Pin the fuzz seed** (`contracts/foundry.toml`): add `[fuzz]` `seed = "0x2026070220260702202607022026070220260702202607022026070220260702"` (any fixed bytes32; document WHY: gas-snapshot determinism). Verify `forge test` still 165/165 green under the pinned seed (a seed change re-rolls fuzz inputs — if any fuzz test fails under the new seed, that is a REAL finding: fix the test/contract, never the seed-shopping).
2. **Regenerate the snapshot:** `forge snapshot` (overwrites `.gas-snapshot`), then run `forge snapshot --check` TWICE in a row — both must pass (determinism proof). If invariant entries still fluctuate, exclude them explicitly (`forge snapshot --check --no-match-test "invariant_"` — wait, invariants aren't gas-snapshotted the same way; VERIFY behavior locally and record the chosen invocation + reason in the workflow comment).
3. **`contracts/scripts/coverage-gate.sh`:** runs `forge coverage --ir-minimum --report summary`, parses the `src/` table rows, enforces: every `src/*.sol` file ≥ 95.00% lines, EXCEPT `CryptToken.sol` ≥ 86.67% and `CryptGovernance.sol` ≥ 98.82% (pinned no-regress floors per `contracts/audit/triage.md` — cite the triage doc in the script header; the artifacts are `--ir-minimum` instrumentation, real coverage ~100%). **Branch gate — the spec-§8.1 "≥90% branch" half is decided EXPLICITLY here, never silently dropped:** under `--ir-minimum` the branch denominators are inflated (documented analysis at `contracts/audit/triage.md:22–39` — CryptGovernance 71.43%, CryptStaking 60%, Passport 89.47%), so a flat 90% floor is unattainable without gaming the tool. Preferred: pin per-file NO-REGRESS branch floors from the current run (same mechanism as the two line exceptions). At minimum: WAIVE the 90% branch threshold with an explicit statement in the script header AND the workflow comment citing the triage branch-denominator analysis. Either way, the decision is recorded in the script, `foundry.yml`, and the final acceptance checklist. Exit non-zero listing every failing file. POSIX-sh + awk only (self-contained, CI-safe).
4. **`foundry.yml`:** replace the bare coverage step with `bash scripts/coverage-gate.sh` (working-directory `contracts`); add a `forge snapshot --check` step after `forge test`. **Pin the toolchain:** `:13` currently uses `foundry-rs/foundry-toolchain@v1` with NO `version:` input — CI installs whatever forge "stable" is current, while `.gas-snapshot` is regenerated with the LOCAL forge; fuzz seed→input mapping is NOT guaranteed stable across forge versions, so an unpinned toolchain can redden this new required gate on unrelated PRs or any future toolchain bump. Set the action's `version:` input to the exact release matching the local `forge --version` used to regenerate the snapshot, and record that pinned version NEXT TO the pinned seed in the workflow comment (bump both together, re-generating the snapshot). Optionally add `forge snapshot --check --tolerance <small N%>` to absorb residual noise — the version pin is the primary fix, tolerance is belt-and-braces. slither/solhint steps unchanged.

**TDD steps:**

1. [ ] RED — prove the gate can fail: run `coverage-gate.sh` with a temporarily raised threshold (e.g. `CryptToken.sol` floor 90%) → exits non-zero naming the file; restore the real floors → passes. (This is the script's falsifiability check; record it in the commit body.)
2. [ ] GREEN — items 1–4; `cd contracts && forge test && forge snapshot --check && bash scripts/coverage-gate.sh` all green locally, twice.
3. [ ] Verify workflow YAML with `act`-free static reading (steps self-contained, no new secrets, working-directory correct) — AND confirm the `foundry-toolchain` `version:` pin matches the local `forge --version` that regenerated `.gas-snapshot` (static reading + two local runs canNOT detect cross-version drift; the pin is what closes that hole).
4. [ ] Commit (includes the regenerated `.gas-snapshot` + pinned seed with justification).

---

# GROUP C — TESTS

---

## Task C1 — Tagged critical-path spec (`@critical`) + documented release-gate split

**Files:** NEW `e2e/critical-path.spec.ts`; EDIT `package.json` (script `e2e:critical`).

**READ FIRST:** spec §8.1 (the critical path: register → unlock → apply → mint → send → vote → claim; "tagged critical path green before any release"), `e2e/wallet-screen.spec.ts` (:107 `register`, :119 `createVault` — the mnemonic/addr-evm testids; the `stubReads` JSON-RPC canning; send-modal testids :184–199), `e2e/mint.spec.ts` (attest/oath/witness step testids — :63 `witness-tile-0`), `e2e/dashboard-screens.spec.ts` (the API_FIXTURES pattern + the register-budget header comment to replicate), `test/integration/{mint,wallet,governance-dividends}-e2e.test.ts` HEADERS (what each anvil suite actually proves — cite them precisely), Task A2's axe setup.

**The honest split (write this VERBATIM-equivalent into the spec's header comment AND into D1's README/ARCHITECTURE):**

> The RELEASE GATE is two commands, together: `pnpm e2e:critical` (this browser spec — the UI-side chain of the §8.1 critical path with deterministic stubbed reads on the default testnet env) AND `pnpm test:integration` (the three anvil suites where the REAL on-chain proofs live: passport seal/mint in `mint-e2e`, funded send + staking in `wallet-e2e`, governance castVote + dividend claim/no-double-claim in `governance-dividends-e2e`). This browser spec does NOT mint, send, vote, or claim on a real chain and never claims to — a fresh default env has unregistered contracts, and fabricating a full-on-chain browser pass would be dishonest. The two halves together cover the spec-§8.1 chain — every §8.1 station, INCLUDING the "see passport on Your Passport" view (station 7 in this spec; the count increment is anvil-proven), appears in at least one gated half.

**Spec content (ONE `test()` per station-group, ONE browser context, ONE registration — budget: 8 existing + this 1 = 9):**

Tag: title prefix `@critical` (grep-able). Stations, reusing existing helpers/stubs (copy the `stubReads` + `register` + `createVault` patterns — do not import across spec files, Playwright specs are standalone):

1. **Register** (the one registration) → lands on `/dashboard/mint`.
2. **Create + unlock the embedded vault** (mnemonic testid visible → confirm → `addr-evm` visible).
3. **Apply / Attest** (mint step 1 form → submitted state), **Oath** (step 2), **Witness gate UI** (step 3: `witness-tile-0` visible; SEAL affordance disabled below quorum — the REAL seal is anvil-proven in `mint-e2e`).
4. **Wallet send-confirm**: open SEND on `/dashboard/wallet`, fill recipient + amount, `review-send` → `send-confirm` + `confirm-amount`/`confirm-chain` visible (no broadcast; funded send is anvil-proven in `wallet-e2e`).
5. **Governance vote gating**: `/dashboard/governance` — as a non-citizen the vote affordance is DISABLED with the mint nudge (the on-chain castVote is anvil-proven in `governance-dividends-e2e`).
6. **Holdings claim gating**: `/dashboard/holdings` — claim disabled / mint-first empty state + the visible LEGAL dividend note present.
7. **Passport view (the §8.1 "see passport on Your Passport" station — without it the release gate would pass with the passport screen deleted):** `/dashboard/passport` — assert the not-yet-citizen/applicant state at the same stubbed-UI level as the other stations (heading `/not yet a citizen/i` + the `Mint Your Passport` CTA, the affordances `e2e/mint.spec.ts:67–73` already proves exist; that mint.spec test is UNTAGGED and thus outside `pnpm e2e:critical` — this station brings passport into the gate). The citizen-count increment itself is anvil-proven in `mint-e2e`. Include a `setViewportSize(390×844)` → no-horizontal-overflow → restore check here (passport's slice of the §8.1 mobile smoke).
8. **A11y stations (from A2):** run `AxeBuilder` at the mint, wallet, governance, holdings stops — ZERO critical/serious (same documented threshold as `a11y.spec.ts`). PRECONDITION: A2 item 8's Topbar CHAIN ONLINE contrast fix — without it, every one of these stations fails on a confirmed SERIOUS `color-contrast` hit (gold-d on white in the shared Topbar).
9. **Mobile checks folded in (C2's registered half):** at the mint step and the wallet step, `setViewportSize(390×844)` → assert no horizontal overflow + the step's key affordance visible (stepper/form on mint; SEND button on wallet) → restore 1280×800.

`package.json`: `"e2e:critical": "playwright test --grep @critical"`.

**TDD steps:**

1. [ ] RED — write the spec; first run fails on the not-yet-written station selectors (Playwright's honest RED: run it, watch the first failing station, fix SELECTORS ONLY — never weaken an assertion to pass; if an affordance genuinely doesn't exist, that's an A-group bug to fix first).
2. [ ] GREEN — iterate to green: `pnpm e2e:critical`.
3. [ ] Run the FULL `pnpm e2e` — all specs green in one run (register budget 9 < 10 proven by the run itself). `pnpm test:integration` green (the other half of the gate).
4. [ ] Commit.

---

## Task C2 — Mobile smoke for the missing screens (home, auth) @ 390×844

**Files:** NEW `e2e/mobile-smoke.spec.ts`.

**READ FIRST:** `e2e/home.spec.ts` (what desktop asserts — don't duplicate, complement), `e2e/auth.spec.ts` (labels/roles for the form), Task A1's marketing ≤640 changes (the affordances to assert), `Mobile.html` (:49–58 header/sheet intent), the register-budget accounting (Constraint #5: this spec registers NOBODY; mint + wallet mobile checks already ride inside C1 station 9, passport inside C1 station 7).

**Spec content (viewport 390×844 via `test.use({ viewport: { width: 390, height: 844 } })`):**

1. **Home `/`:** no horizontal overflow (`scrollWidth <= innerWidth + 1`); the burger is visible and opens the nav sheet (links visible, full-width); hero h1 visible; the passport stage fits the viewport (`boundingBox().width <= 390`); footer renders 2-col (presence, not pixel math); zero console errors (reuse home.spec's collector pattern).
2. **Auth `/auth`:** no horizontal overflow; tabs (`SIGN IN`/`REGISTER`) visible + switchable; all form fields + the submit button visible and tappable within the viewport; the terminal/console log region visible. NO submission (0 registrations).

Header comment documents: total e2e registration budget = 9 (8 pre-existing + 1 in critical-path.spec.ts); this spec adds 0; any future spec must update the ledger and stay < 10.

**TDD steps:**

1. [ ] RED — write the spec; run `pnpm e2e e2e/mobile-smoke.spec.ts`; genuine failures (overflow, hidden affordances) route back to Task A1's CSS for a fix — assertions are not weakened.
2. [ ] GREEN — `pnpm e2e e2e/mobile-smoke.spec.ts` green.
3. [ ] Run the FULL `pnpm e2e` — green.
4. [ ] Commit.

---

# GROUP D — DOCS + RELEASE

---

## Task D1 — README.md + docs/ARCHITECTURE.md + docs/ENV_REFERENCE.md + .env.mainnet.example (+ DEPLOY_RUNBOOK step-2 reference fix)

**Files:** NEW `README.md`, `docs/ARCHITECTURE.md`, `docs/ENV_REFERENCE.md`, `.env.mainnet.example`; EDIT `contracts/docs/DEPLOY_RUNBOOK.md` (step 2 ~:160 AND step 6 ~:170); EDIT `.gitignore` — it has NO `.env*` glob today (:7–10 ignore only `.env`, `.env.*.local`, `.env.testnet`, `.env.mainnet`; `.env.local` and `.env.production` — both loaded by Next.js, the usual home of keyed RPC URLs — are COMMITTABLE). Replace those entries with a real `.env*` glob plus `!.env.example` and `!.env.mainnet.example` negations.

**READ FIRST:** `.env.example` (the full annotated inventory to mirror), `config/chains.config.ts` (the `NEXT_PUBLIC_CHAIN_ENV` switch + `serverRpcEnv` mapping + `RPC_ANVIL` default :95–97), `config/contracts.ts` + `scripts/emit-contract-addresses.mjs` (the address-registry flow), `app/api/rpc/[chain]/route.ts` + its allowlist (the RPC proxy model), `contracts/docs/DEPLOY_RUNBOOK.md` (:150–180 — do not duplicate it, LINK it), spec §2.4/§2.5/§8.3 step 2, `docs/superpowers/plans/` (wave list for the README's status table), `.gitignore`.

**Content contracts:**

1. **`README.md` (root, concise — one screen of orientation, not a novel):** what CryptRepublic is (non-custodial network-state app; explicit "the server never holds keys/signs"); quickstart (`pnpm install`, `.env.example` → `.env`, `pnpm db:migrate && pnpm db:seed`, `pnpm dev`); the test matrix table (unit / integration-anvil / e2e / forge — commands + current counts, dated); **the release gate** (verbatim split from C1: `pnpm e2e:critical` + `pnpm test:integration`); links to ARCHITECTURE, ENV_REFERENCE, MAINNET_HANDOFF, LEGAL_FLAGS_REFERENCE, DEPLOY_RUNBOOK; the wave status table (1–8 delivered, 9 admin capstone pending); the LEGAL banner ("$CRYPT is very likely a regulated security — see docs/LEGAL_FLAGS_REFERENCE.md; not cleared for mainnet").
2. **`docs/ARCHITECTURE.md`:** app structure (App Router server pages → client islands; `lib/*` client/serverReads split; the FROZEN `writeEmbedded` non-custodial write path — cite `lib/wallet/services/staking.ts`); **the single `NEXT_PUBLIC_CHAIN_ENV` switch** (local/testnet/mainnet — what flips where, `config/chains.config.ts`); **the address-registry flow** (deploy → `scripts/emit-contract-addresses.mjs` → `config/contracts.ts` throwing accessors + non-throwing `*Available` probes → graceful degradation on unregistered chains); **the RPC proxy model** (browser → `/api/rpc/[chain]` allowlisted JSON-RPC → keyed server RPC; CSP `connect-src 'self'`; why keys never reach the client); auth/session model (Argon2id, opaque httpOnly sessions, SIWE); DB honesty split (trustless=chain, off-chain-by-nature=Prisma; SQLite dev locked, **Postgres-in-CI documented DEFERRAL**); testing strategy incl. the C1 honest split; the perf baseline + budget table from A2 item 9 (per-route First Load JS, no-regress); security posture (CSP nonce, HSTS, rate limits incl. the in-memory single-instance caveat from `lib/auth/ratelimit.ts`).
3. **`docs/ENV_REFERENCE.md`:** a table of EVERY var — name, public/server-only, required-when (dev/testnet/mainnet/CI), default, consumer file. PUBLIC: `NEXT_PUBLIC_CHAIN_ENV`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`. SERVER-ONLY: `DATABASE_URL`, `RPC_BASE_SEPOLIA`, `RPC_BASE`, `RPC_ETHEREUM`, `RPC_ARBITRUM`, `RPC_OPTIMISM`, `RPC_POLYGON`, `RPC_SOLANA`, `RPC_ANVIL` (default `http://127.0.0.1:8545`), `ETHERSCAN_API_KEY`. State plainly: NO server-side signing key exists ANYWHERE by design; `.env*` is git-ignored — write this sentence ONLY AFTER this task's `.gitignore` tightening lands, and verify it with `git check-ignore .env.local .env.production` (both must report ignored) before committing the doc. A false "your env files are ignored" assurance is exactly the kind of security claim Constraint #3 bans.
4. **`.env.mainnet.example`:** mirrors `.env.example`'s annotation style with mainnet values — `NEXT_PUBLIC_CHAIN_ENV=mainnet`, `RPC_BASE=` (placeholder), `ETHERSCAN_API_KEY=`, production `NEXT_PUBLIC_APP_URL=https://…`, `DATABASE_URL=` (Postgres placeholder + a note that prod DB choice is the user's). **Placeholders ONLY — never a real key**, plus the header warning verbatim-equivalent to spec §8.3 step 2: "Never place a private key in a repo file — use a hardware wallet, `cast wallet`, or a keystore reference."
5. **DEPLOY_RUNBOOK.md step 2 (~:160):** reword to "Copy `.env.mainnet.example` (repo root) → `.env.mainnet`; …" so the referenced file now exists. **AND step 6 (~:170):** replace the stale `config/addresses.mainnet.ts` reference — that file does not exist and never has — with the REAL registry: "paste the verified mainnet addresses into `CONTRACTS[8453]` in `config/contracts.ts`" (`config/contracts.ts:31–32` — "Base mainnet (USER fills after deploy)"), matching the `scripts/emit-contract-addresses.mjs` → `config/contracts.ts` flow this task's ARCHITECTURE.md documents. (The spec's §8.3 `addresses.mainnet.ts` naming is NOT honored by creating a new file — the registry pattern shipped in Waves 4–7 is `CONTRACTS[chainId]`; documenting a step against a nonexistent file is the bug.)

**Verification (docs "test"):**

1. [ ] Link-check: for every relative path referenced in the four docs, `test -e` it (one-liner loop: `grep -hoE '\]\(([^)#]+)' README.md docs/*.md | tr -d '](' | sort -u | while read -r p; do [ -e "$p" ] || echo "BROKEN: $p"; done` — adapt for docs/-relative paths). Zero broken.
2. [ ] Honesty audit: no "audited"/"production-ready"/"battle-tested"; every count/date is real (pull counts from an actual test run); the assistant/user boundary stated wherever deploys/keys appear.
3. [ ] `pnpm format:check` green (Prettier covers the new .md); `git check-ignore .env.mainnet.example` and `git check-ignore .env.example` both return NOT-ignored (the example files must be committable); `git check-ignore .env.local .env.production .env .env.testnet .env.mainnet` all return IGNORED (the new `.env*` glob actually works — this is the precondition for ENV_REFERENCE's "`.env*` is git-ignored" sentence).
4. [ ] Commit.

---

## Task D2 — docs/MAINNET_HANDOFF.md + docs/LEGAL_FLAGS_REFERENCE.md + the Pre-Mainnet Gate with HONEST statuses

**Files:** NEW `docs/MAINNET_HANDOFF.md`, `docs/LEGAL_FLAGS_REFERENCE.md`.

**READ FIRST:** spec §8.2 (the 8 Gate items VERBATIM), §8.3 (the 8 user steps + the hard-boundary paragraph), §10.1 (the risk flags — enumerate what is ACTUALLY there: 7 bullets — $CRYPT-as-security, KYC/AML & sanctions, money transmission/MSB, dividends & tax, disclosures & marketing, entity/terms/privacy, network-state framing; if the task brief said "6", the doc follows the SPEC, not the brief), `contracts/docs/DEPLOY_RUNBOOK.md` (:150–180 mainnet steps — LINK + summarize, don't fork a second diverging copy), `contracts/audit/triage.md` (evidence for Gate item 4), the 9 verified `// LEGAL:` marker sites + `components/holdings/HoldingsApp.tsx:430–436` + `app/dashboard/holdings/page.tsx:7`.

**Content contracts:**

1. **`docs/MAINNET_HANDOFF.md`** — the consolidated USER runbook. Sections:
   - **Hard boundary** (spec §8.3 opening, verbatim-equivalent): every step below is user-executed; the assistant never holds/requests keys, deploys, funds, signs, or broadcasts.
   - **Prerequisites:** Gate fully satisfied; hardware-wallet/Safe multisig for admin/treasury/genesis-attestor; Base mainnet RPC + explorer key.
   - **The 8 steps with exact commands** — mirror §8.3/DEPLOY_RUNBOOK :157–176 (funds → `.env.mainnet.example`→`.env.mainnet` → `forge script script/Deploy.s.sol --rpc-url $BASE_MAINNET_RPC --broadcast --verify --ledger` + `Configure.s.sol` → Basescan verify → role transfer/renounce (Safe + TimelockController, genesis-attestor time-boxed) → app config (fill `CONTRACTS[8453]` in `config/contracts.ts` with the verified mainnet addresses — matching the emit-contract-addresses.mjs → contracts.ts flow D1's ARCHITECTURE documents; `config/addresses.mainnet.ts` does NOT exist, D1 fixes the runbook's stale :170 reference — then `NEXT_PUBLIC_CHAIN_ENV=mainnet`) → funding via multisig (LEGAL markers must survive) → smoke & monitor). LINK the DEPLOY_RUNBOOK for contract detail rather than duplicating role tables.
   - **Rollback / pause plan (Gate item 8):** what CAN be paused ($CRYPT is pausable — cite the contract), what CANNOT (passport/governance are immutable, non-upgradeable per DEPLOY_RUNBOOK "Upgradeability"), the app-level rollback (re-point `NEXT_PUBLIC_CHAIN_ENV`/addresses, static maintenance page), and the decision matrix (who may trigger pause = the Safe; timelock delays apply).
   - **Key-custody + incident-response runbook (Gate item 7):** role→Safe mapping, rotation procedure, compromise playbook (pause token where possible → revoke/rotate roles via Safe → public disclosure), contact tree placeholder for the USER to fill (named humans are not the assistant's to invent).
   - **Burn-in plan (Gate item 2):** ≥4 continuous weeks on Base Sepolia exercising the §8.1 critical path. The ON-TESTNET evidence each week is exactly two things, both USER-run against the user's live Base Sepolia deployment: (a) the 8-step manual smoke (apply → mint → small transfer → vote → claim, per DEPLOY_RUNBOOK step 8), and (b) the fork tests documented in `contracts/docs/DEPLOY_RUNBOOK.md` (~:140–147): `forge test --fork-url $BASE_SEPOLIA_RPC --match-path 'test/**/*fork*'`. The doc must state EXPLICITLY that `pnpm e2e:critical` and `pnpm test:integration` are LOCAL regression suites that provide ZERO on-testnet evidence and CANNOT be pointed at live testnet addresses: the browser spec runs with stubbed reads against unregistered contracts (C1's honest split), and `test:integration` is hardwired to `NEXT_PUBLIC_CHAIN_ENV=local` (`package.json:18`) and spawns a throwaway local anvil that deploys fresh contracts and rewrites `config/contracts.ts` (`test/integration/anvil-harness.ts` — "LOCAL ANVIL ONLY"). Run them weekly ONLY to guard against code regressions during the burn-in window — never cite them as burn-in evidence for Gate item 2 (Constraint #3); **P0/P1 triage definitions** (P0 = funds/keys/soulbound-integrity/vote-integrity at risk → stop-the-line, fix + restart burn-in clock; P1 = a critical-path function broken with workaround → fix within the burn-in, no clock restart; P2/P3 logged); monitoring: treasury balance + role-event alerting (Basescan/Tenderly-class watch on `Disbursed`/`RoleGranted`/`Paused` events — named as user-chosen tooling, not a fabricated integration).
   - **Pre-Mainnet Gate checklist (spec §8.2, all 8 items) with HONEST statuses**, e.g.: 1 external audit — **OPEN (USER)**; 2 ≥4-week burn-in — **OPEN (USER; plan above)**; 3 full suite green on deploy commit — **EVIDENCED at v0.8.0 close-out (D3 run; re-verify on the actual deploy commit)**; 4 slither/solhint — **TRIAGED (contracts/audit/triage.md — 0 high/medium)**; 5 bug bounty — **OPEN (USER)**; 6 legal sign-off — **OPEN (USER; see LEGAL_FLAGS_REFERENCE)**; 7 key-custody plan — **DRAFTED here, OPEN until the USER stands up the Safe + timelock**; 8 frozen config + rollback plan — **TEMPLATED (.env.mainnet.example + this rollback section), OPEN until the USER freezes real addresses**. NOTHING marked done that isn't.
2. **`docs/LEGAL_FLAGS_REFERENCE.md`** — a table of ALL 10 surfaced flags: the 9 contract markers (file:line + the VERBATIM `// LEGAL:` line) — `CryptToken.sol:10`, `:11`, `:32`, `CryptRepublicPassport.sol:74`, `DividendDistributor.sol:12`, `:58`, `CryptTreasury.sol:16`, `:46`, `:62` — plus the Wave-7 in-UI dividend note (`components/holdings/HoldingsApp.tsx:430–436`, test-asserted). Each row maps to: (a) the spec-§10.1 risk(s) it flags, (b) which Pre-Mainnet Gate item's sign-off clears it (mostly item 6 legal; KYC rows also item 6; funding rows note "do not fund before sign-off" per §10.1 intro). Close with the §10.1 framing notes (not legal advice; the assistant surfaces flags, cannot clear them) and the open questions that block mainnet (§10.3 #1, #2).

**Verification (docs "test"):**

1. [ ] Marker completeness check (mechanical): `grep -rn "LEGAL:" contracts/src/ | wc -l` == 9 AND every hit appears verbatim in LEGAL_FLAGS_REFERENCE.md (script the comparison; a future 10th marker must fail this check → add the grep one-liner into the doc header as the maintenance command).
2. [ ] Gate-status honesty audit: zero of items 1/2/5/6 claim completion; items 3/4 cite checkable evidence only.
3. [ ] Every command in MAINNET_HANDOFF is copy-paste-runnable BY THE USER (syntax-check the forge/cast lines against DEPLOY_RUNBOOK; no assistant-executed steps).
4. [ ] Link-check (same loop as D1) + `pnpm format:check` green.
5. [ ] Commit.

---

## Task D3 — version 0.8.0 + CHANGELOG.md + full-gate close-out + documented user tag command

**Files:** EDIT `package.json` (add `"version": "0.8.0"`), NEW `CHANGELOG.md`, EDIT `README.md` (link CHANGELOG; record the tag step).

**READ FIRST:** `git log --oneline` per wave (the commit trail from `feat/wave-1-scaffold` — waves are cleanly delimited by their close-out commits), the 7 prior plan docs in `docs/superpowers/plans/` (one-line deliverable summaries), Keep-a-Changelog format, Constraint #2 (tagging is a USER step post-merge — the assistant does NOT create or push tags on this feature branch).

**Exact changes:**

1. `package.json`: `"version": "0.8.0"` (after `"name"`).
2. **`CHANGELOG.md`** (Keep-a-Changelog style): `## [0.8.0] — 2026-07-02` (Wave 8, itemized per task group A–D) and one dated section per prior wave (1–7, from the git trail; honest one-paragraph summaries — features actually shipped, tests actually added, the local-anvil-only deploy boundary stated for Wave 4). No invented metrics.
3. **Documented tag command (README release section + CHANGELOG footer):**
   > After merging to `main`, the USER cuts the release tag: `git checkout main && git pull && git tag -a v0.8.0 -m "CryptRepublic v0.8.0 — Wave 8 close-out" && git push origin v0.8.0`. The assistant does not tag or push tags.
4. **Close-out — run the FULL gate** and record actual results in the commit body:
   `pnpm guard:secrets && pnpm format:check && pnpm typecheck && pnpm lint && pnpm test && pnpm test:integration && pnpm e2e && (cd contracts && forge test && forge snapshot --check && bash scripts/coverage-gate.sh) && pnpm build` — ALL green.
5. Verify the final acceptance checklist below; check every box in the commit/PR body — AND state the three OPEN spec-row items (testnet-dry-run of the runbook, burn-in started, release tag cut) as USER-scoped with their reasons, verbatim from the checklist's OPEN entry. The close-out/PR body claims "Wave 8 assistant-scope complete; spec-row items (a)–(c) OPEN (USER)" — NEVER an unqualified "Wave 8 done".

**TDD steps:** (docs/release task — the gate run IS the test)

1. [ ] Write CHANGELOG + version bump.
2. [ ] Run the full gate (item 4) — green, with real counts recorded (expect ≥378 unit / ≥11 integration / >11 e2e / 165 forge — new Wave 8 tests INCREASE the counts; none decrease).
3. [ ] `pnpm format:check` green; link-check green.
4. [ ] Commit.

---

## Final acceptance checklist (spec §9, Wave 8 row — verify before claiming Wave 8 ASSISTANT-SCOPE complete; three spec-row items stay OPEN (USER) below and are declared, never silently omitted)

- [ ] **Responsive/mobile matches design:** dashboard at ≤1024/≤860/≤760 uses ONE deliberate collapse mechanism (row grids exempted, embassy column step decided + recorded); Topbar padding no longer fights the module; marketing home at ≤640 is Mobile.html-equivalent via CSS only (sticky header + burger sheet, stacked hero CTAs, `min(330px,88vw)` passport, clamped type, 2-col footer); NO JS viewport redirect, NO separate mobile page (A1; Constraint #6).
- [ ] **A11y pass with automated evidence:** modal restores focus via a mount-only effect + `aria-labelledby` (incl. the new-onClose-identity re-render test — no focus theft on the 12s poll); global `:focus-visible`; `<main>` on marketing home + `/wallet` (dashboard/auth already had it); `prefers-reduced-motion` honored by LiveNumber (JS guard) and SealingAnimation (verified CSS kill-switch + in-component guard); htmlFor audit recorded; the pre-decided Topbar CHAIN ONLINE contrast fix landed (A2 item 8 — usage-level swap to a compliant existing token, palette definitions untouched, recorded in the commit body); axe smoke green at the documented threshold (0 critical/serious) on `/`, `/auth`, and the four critical-path dashboard stations (A2, C1).
- [ ] **Error/empty/loading hardening:** `app/error.tsx` + `app/not-found.tsx` + `app/dashboard/error.tsx` exist with in-voice copy + `reset()` retry; AuthForm shows a visible busy state; no screen surfaces the generic Ledger default where in-voice copy belongs (A3).
- [ ] **Performance (the spec-§9 "perf audit passes thresholds" half):** A2 item 9 ran — `pnpm build` per-route First Load JS recorded in the commit body and the no-regress baseline + budget table committed into `docs/ARCHITECTURE.md`; the OPTIONAL items DEFINED in A2 item 9 (modal code-splitting via `next/dynamic`, list memoization) carry a recorded done/deferred-with-numbers decision — done only if a route busted the budget and the change was trivially safe, never over-engineered; no Lighthouse/perf-score claims were made without running the tool (A2).
- [ ] **Hardening:** HSTS in production responses (CSP/nonce byte-identical, dev unaffected); per-user rate limits on comments POST (10/5min) + embassy-proposals POST (5/15min) with 429 tests and proof normal use is unaffected; `pnpm guard:secrets` green (B1; Constraint #4).
- [ ] **CI gates:** coverage-gate.sh enforces ≥95% lines on all `src/*.sol` with the two PINNED no-regress exceptions (CryptToken ≥86.67%, CryptGovernance ≥98.82%) citing `contracts/audit/triage.md`; the spec's ≥90% BRANCH half carries an EXPLICIT recorded decision (per-file no-regress branch floors OR a documented waiver citing triage.md:22–39's `--ir-minimum` branch-denominator analysis) in the script header + workflow comment — not a silent omission; `forge snapshot --check` deterministic under the pinned fuzz seed (proven twice locally) and wired into `foundry.yml` with the `foundry-toolchain` `version:` PINNED to the snapshot-generating local forge (recorded next to the seed); workflows self-contained (B2; Constraint #7).
- [ ] **Complete test suites + honest release gate:** `e2e/critical-path.spec.ts` (@critical, ONE registration) covers register → vault → attest → oath → witness-gate UI → send-confirm → vote gating → claim gating → passport view (not-yet-citizen state — station 7, so the gate cannot pass with the passport screen deleted) with axe + mobile stations; the release gate is DOCUMENTED as `pnpm e2e:critical` + `pnpm test:integration` (on-chain seal/vote/claim proofs live in the anvil suites — no fabricated full-on-chain browser test); the spec-§8.1 "mobile-viewport smoke of all 8 screens" is CLOSED: home + auth at 390×844 in C2, mint + wallet + passport inside C1 (stations 7/9), and every dashboard screen visited by `dashboard-screens.spec.ts` (governance, treasury, holdings, population, embassies) gets a 390×844 no-overflow check via A1 item 6 (A1, C1, C2; Constraint #3).
- [ ] **Register budget:** total registrations in one `pnpm e2e` run = 9 (< 10), documented in every new spec header (Constraint #5).
- [ ] **Docs:** README + ARCHITECTURE (app structure, `NEXT_PUBLIC_CHAIN_ENV` switch, address-registry flow, RPC proxy model) + ENV_REFERENCE (full inventory, public/server split) + `.env.mainnet.example` (placeholders only; DEPLOY_RUNBOOK step 2 now points at it; file NOT git-ignored); Postgres-in-CI deferral documented (D1).
- [ ] **Mainnet Runbook + Pre-Mainnet Gate finalized:** MAINNET_HANDOFF consolidates prerequisites, the 8 USER steps with exact commands, rollback/pause plan, key-custody + incident-response runbook, burn-in plan with P0/P1 triage + monitoring; the 8 Gate items carry HONEST statuses — 1/2/5/6 OPEN (USER), 3/4 evidenced, 7/8 drafted/templated-but-OPEN; the assistant/user boundary is explicit everywhere (D2; Constraint #2).
- [ ] **All LEGAL flags documented:** all 9 `// LEGAL:` contract markers + the in-UI dividend note quoted VERBATIM in LEGAL_FLAGS_REFERENCE.md, mapped to the spec-§10.1 risks and the Gate item that clears each; the mechanical completeness check (grep count == doc count) passes (D2; Constraint #3).
- [ ] **Release prep:** `version: 0.8.0`; CHANGELOG.md covers Waves 1–8 honestly; the tag command is DOCUMENTED for the USER to run after merging to main — no tag created/pushed from this branch (D3).
- [ ] **Spec-row item OPEN (USER) — "runbook reviewed & reproducible on a testnet dry-run":** NOT claimable by the assistant — no Base Sepolia deployment exists (DEPLOY_RUNBOOK: live addresses "do not yet" exist); the dry-run is the user's step against their own deployment. Declared OPEN in the D3 close-out/PR body, never checked as done (Constraint #2).
- [ ] **Spec-row item OPEN (USER) — "testnet burn-in started":** blocked on the same user deployment; Wave 8 delivers the burn-in PLAN (D2, with on-testnet evidence = manual smoke + DEPLOY_RUNBOOK fork tests), it does NOT start the burn-in. Declared OPEN in the D3 close-out/PR body (Constraint #2).
- [ ] **Spec-row item OPEN (USER) — "release tag cut":** deferred to the user post-merge by design (D3 item 3 documents the exact command); the assistant creates/pushes no tag. Declared OPEN in the D3 close-out/PR body (Constraint #2).
- [ ] **ZERO regressions:** full gate green — `pnpm guard:secrets && pnpm format:check && pnpm typecheck && pnpm lint && pnpm test && pnpm test:integration && pnpm e2e && (cd contracts && forge test && forge snapshot --check && bash scripts/coverage-gate.sh) && pnpm build`; unit ≥378, integration ≥11, e2e >11, forge = 165, all green (Constraint #1).
- [ ] **Design tokens unchanged** (radius 0, palette, uppercase headings); `TESTNET`/`SIMULATED`/`SEEDED` tags intact; e2e stubs deterministic (Constraints #3, #6).
- [ ] Per-task commits with the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer; nothing deployed, signed, funded, or tagged by the assistant at any point.

---

## Notes for the implementer (survey corrections + traps)

1. **WalletChainApp IS under the shell `.main`** (route `app/dashboard/wallet` inherits `DashboardShell`); the ≤760 collapse already applies to it. The un-shelled surfaces are the marketing home and `app/wallet` (minimal exerciser). Do not "add handling" it already has — verify at Step 0 (A1).
2. **The dashboard and auth already have `<main>` landmarks** (`DashboardShell.tsx:23`, `app/auth/page.tsx:84`); only `app/page.tsx` and `app/wallet/page.tsx` need one (A2).
3. **HoldingsApp already passes in-voice empty copy** (`:521`, `:561`); the A3 empty-copy item is an audit, not a known bug.
4. **SendModal's label wraps its control** (valid implicit association); the htmlFor item is an audit for non-wrapping labels only (A2).
5. **`e2e/home.spec.ts` pins "48 392"** — the marketing hero count-up is a Wave-1 pixel-port artifact OUT OF Wave 8's scope; responsive edits must not disturb it (changing that figure's data source is not a Wave 8 task).
6. **The fuzz-seed pin re-rolls fuzz inputs** — if any forge test fails under the new seed, treat it as a real finding to fix, never rotate seeds until green (B2).
7. **The in-memory rate limiter resets when the Next server restarts**; `pnpm e2e` boots ONE server per run, so the budget ledger counts per-run registrations. Local back-to-back runs inside 15 minutes can still trip the register limit — that is pre-existing behavior, unchanged by this plan.
8. **tokens.css cascade trap:** the RETHEME section (:1015–1023) re-declares `.hero h1` and `.sec-head h2` font sizes AFTER the first ≤640 media block (:963) — mobile clamps for those two selectors are dead CSS unless they land in the :1503 ≤640 block or after the retheme (A1 item 5).
9. **Modal effect trap:** the existing focus effect is keyed on `[onClose]`, and EmbassiesApp hands it a fresh inline closure every 12s poll tick — focus capture/restore MUST live in a separate mount-only effect or the open modal steals focus back every tick (A2 change 1, test (d)).
10. **`pnpm test:integration` and `pnpm e2e:critical` are LOCAL-ONLY** (hardwired `NEXT_PUBLIC_CHAIN_ENV=local` + throwaway anvil; stubbed browser reads). They can never serve as on-testnet or burn-in evidence — the only on-testnet commands in this repo are the DEPLOY_RUNBOOK fork tests + the manual smoke, both USER-run (D2; Constraint #3).

---

## Post-review addenda (reviewer MINOR findings — honor during the build)

The adversarial review applied all 15 blocker+major findings above. Nine distinct **minor** findings remain; honor them during implementation:

1. **A1/A2 re-run coverage:** A2 edits `app/wallet/page.tsx` (adds `<main>`) — its re-run list MUST include `e2e/wallet.spec.ts` + `e2e/wallet-csp.spec.ts` (the specs that actually load `/wallet`); A1's re-run list must include `e2e/mint.spec.ts`. Simplest: end both tasks with the full `pnpm e2e` (8 registrations pre-C1, within budget).
2. **A2 Modal TDD step 1(a) is NEW, not existing:** `Modal.test.tsx` currently has only 3 tests (children render / Close fires / Escape closes) — there is no focus-into-dialog test to "extend". Write it as a new RED case.
3. **Wide row grids vs 390px no-overflow:** `TokenList.tsx:34/59` rows are `1fr 120px 110px 120px` (~350px fixed + gaps) and cannot fit 390px without stacking. Decide explicitly per row grid: an `overflow-x` wrapper with a row `min-width`, OR deliberate stacking — and make C1 station 9's wallet no-overflow assertion match the chosen behavior.
4. **LiveNumber reduced-motion guard must be null-safe:** jsdom has no `matchMedia` and `vitest.setup.ts` adds no polyfill — use `window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches` and add a no-matchMedia test case proving the component still settles without throwing.
5. **Honest-split paragraph (C1, copied into README/ARCHITECTURE):** append that the two halves cover the §8.1 steps on LOCAL/STUBBED environments only; executing the chain on live Base Sepolia remains a USER step (deploy + fork tests + burn-in per DEPLOY_RUNBOOK/MAINNET_HANDOFF).
6. **D2 Gate item 3 must not forward-date evidence:** word it "PENDING — evidenced by the D3 close-out run" (cite the Wave-7 close-out `447ff2a` 378/11/11/165 as current evidence), and D3 gains a step to update the Gate item-3 status/commit link in `docs/MAINNET_HANDOFF.md` after the full gate actually passes.
7. **ENV_REFERENCE completeness:** build the var table from a `grep -rn 'process.env.'` sweep, not just `.env.example` — it currently misses `APP_URL` (server-side CSRF/SIWE origin fallback at `lib/auth/csrf.ts:13`). Document it or delete the dead fallback and note that in the commit.
8. **Marketing hero-CTA stacking (A1 item 5):** `.hero-ctas` is `display:flex; flex-wrap:wrap` (tokens.css:306–311) — `grid-template-columns: 1fr` is a no-op on it. Use `display:grid; grid-template-columns:1fr; gap:10px` in the ≤640 rule (matching Mobile.html:73) or `.hero-ctas .btn { width:100% }`. Note `.cta .hero-ctas` (tokens.css:880) shares the class — verify FinalCTA at 390px too.
9. **A2 aria-labelledby RED must be mechanism-specific:** `getByRole("dialog", { name: title })` already passes via the current `aria-label` — assert `toHaveAttribute("aria-labelledby", headingId)` + `not.toHaveAttribute("aria-label")` for a true RED; keep the accname query as a GREEN supplement.
