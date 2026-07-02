# CryptRepublic — LEGAL Flags Reference

Every legal/compliance flag the assistant has surfaced in code, quoted
verbatim and mapped to the spec-§10.1 risks and the Pre-Mainnet Gate item
whose sign-off clears it. **Not legal advice.** The assistant surfaces these
flags; it cannot clear them — only the user's qualified securities/fintech
counsel can (Gate item 6 in [MAINNET_HANDOFF.md](MAINNET_HANDOFF.md)).

**Maintenance / completeness check (run before every release):**

```bash
grep -rn "LEGAL:" contracts/src | wc -l   # MUST equal the 9 contract rows below
```

If the count differs, a marker was added or removed — update this table in the
same commit. As of 2026-07-02 the count is **9** contract markers, plus one
in-UI note (row 10, which lives in `components/`, outside the grep above).

## The spec-§10.1 risks (7)

| ID | Risk |
| --- | --- |
| R1 | **$CRYPT is very likely a regulated security** (dividend-bearing token → Howey-type indicia; registration/exemption, disclosures, transfer restrictions) |
| R2 | **KYC/AML & sanctions** (citizenship, wallet provisioning, treasury/dividend outflows; v1 has NO KYC provider — integration REQUIRED before public mainnet) |
| R3 | **Money transmission / MSB** (send/swap/bridge, payouts, dividends may implicate licensing; document the non-custodial out-of-scope basis) |
| R4 | **Dividends & tax** (reporting/withholding questions before funding) |
| R5 | **Securities-law disclosures & marketing** ("holdings"/"dividends"/"sovereign wealth" copy may constitute an offer/solicitation) |
| R6 | **Entity, terms, privacy** (legal entity, ToS, Privacy Policy, risk disclosures before public launch) |
| R7 | **"Network state" framing** (product metaphor only — no governmental status, legal tender, or guaranteed returns implied) |

## The flags

| # | Location | Verbatim flag | Risks | Cleared by |
| --- | --- | --- | --- | --- |
| 1 | `contracts/src/CryptToken.sol:10` | `/// LEGAL: A dividend-bearing $CRYPT is very likely a regulated security (spec §10.1).` | R1, R5 | Gate 6 (legal sign-off on token characterization) |
| 2 | `contracts/src/CryptToken.sol:11` | `/// LEGAL: Resolve token characterization + KYC/AML before ANY public mainnet distribution.` | R1, R2 | Gate 6 (incl. KYC/AML provider decision — §10.3 #2) |
| 3 | `contracts/src/CryptToken.sol:32` | `/// LEGAL: minting expands supply of a likely-security token; gate + audit before mainnet.` | R1 | Gate 6 + Gate 1 (external audit of the mint gate) |
| 4 | `contracts/src/CryptRepublicPassport.sol:74` | `/// LEGAL: passport gates dividends/governance; KYC/Sybil resistance is a pre-mainnet concern (§10.1).` | R2 | Gate 6 (KYC/AML scope — §10.3 #2) |
| 5 | `contracts/src/DividendDistributor.sol:12` | `/// LEGAL: per-citizen dividends make $CRYPT a likely security; resolve before funding (spec §10.1).` | R1, R4 | Gate 6 — **do not fund before sign-off** (§10.1 intro) |
| 6 | `contracts/src/DividendDistributor.sol:58` | `/// LEGAL: opening a funded dividend epoch is a distribution of a likely security (spec §10.1).` | R1, R4, R5 | Gate 6 — **do not fund/open epochs before sign-off** |
| 7 | `contracts/src/CryptTreasury.sol:16` | `/// LEGAL: treasury outflows/dividend funding may implicate MSB/securities/tax regimes (spec §10.1).` | R1, R3, R4 | Gate 6 (MSB/money-transmission posture memo) |
| 8 | `contracts/src/CryptTreasury.sol:46` | `/// LEGAL: disbursement of a likely-security token / real value — gate + audit before mainnet.` | R1, R3 | Gate 6 + Gate 1 (audit of the disburse path) |
| 9 | `contracts/src/CryptTreasury.sol:62` | `/// LEGAL: dividend funding treats $CRYPT as a distribution of a likely security (spec §10.1).` | R1, R4 | Gate 6 — **do not fund before sign-off** |
| 10 | `components/holdings/HoldingsApp.tsx:433–441` (in-UI, Wave 7; file-header marker at `:19–21`) | Visible note rendered by the claim panel: *"**Legal note.** Dividends paid from sovereign holdings are likely a regulated security. Claiming may carry tax and securities-law obligations in your jurisdiction — see the Republic's disclosures."* (`data-testid="legal-note"`) | R1, R4, R5 | Gate 6; the note itself must NOT be removed — asserted by `e2e/dashboard-screens.spec.ts:433` and `e2e/critical-path.spec.ts:375` |

Rows 5, 6, 9 carry the §10.1 funding prohibition: **do not fund the
distributor/treasury or open public mainnet until resolved with a qualified
securities/fintech attorney in every relevant jurisdiction** — mirrored as
step 7's precondition in [MAINNET_HANDOFF.md](MAINNET_HANDOFF.md).

Risks R6 (entity/ToS/privacy) and R7 (network-state framing) have no code
marker by nature — they attach to the launch itself and to marketing copy, and
are carried by Gate item 6 review plus a pre-launch marketing/ToS pass.

## Framing (spec §10.1)

These are flags for the user and their counsel, not legal conclusions. The
assistant surfaces them in code (`// LEGAL:` markers at the token, treasury,
dividend, and KYC boundaries) and in docs; it cannot clear them. The markers
must survive into any deployed code (MAINNET_HANDOFF step 7).

## Open questions that block mainnet (spec §10.3)

1. **Token legal status** (§10.3 #1): final characterization of $CRYPT and the
   resulting distribution/transfer-restriction design — blocks dividend
   funding and mainnet.
2. **KYC/AML provider & scope** (§10.3 #2): which provider, at which step
   (application vs. first payout), which jurisdictions — blocks public
   mainnet.
