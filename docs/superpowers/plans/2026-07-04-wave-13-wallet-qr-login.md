# CryptRepublic Wave 13 — Wallet-QR Login (One Portal identity, slice 1): cross-device passwordless sign-in via a QR-relayed SIWE challenge — Implementation Plan

## Goal

Let a citizen sign in to CryptRepublic on one device (A, unauthenticated — e.g. a desktop) by scanning a QR with a second device (B) that holds their wallet (an unlocked embedded vault or an external wallet). Device A shows a QR encoding a short-TTL, single-use login **challenge**; device B decodes it, shows a confirmation with a **matchCode + domain** (anti-phishing), signs a SIWE message locally, and approves; device A polls and receives its session. This is the first slice of "One Portal identity" — passwordless, non-custodial, wallet-native login — reusing the Wave-11 SIWE core + QR scanner and the Wave-12 address→user resolver.

## Architecture (how the challenge/approve/status flow composes over existing seams)

Three endpoints + one challenge row + a self-contained versioned QR envelope, layered over the existing SIWE + session machinery:

- **Start (device A).** `POST /api/auth/qr/start` (origin-gated, unauthenticated, rate-limited) → `issueNonce()` (a real single-use `SiweNonce`) → create a `WalletLoginChallenge {nonce, matchCode, status:"pending", expiresAt: now+120s}` → return `{challengeId, nonce, matchCode, domain, uri, chainId}`. Device A renders a QR of the **public** envelope `{v:1, t:"cr-wallet-login", challengeId, nonce, matchCode, domain, uri, chainId}` (never a key) and shows the `matchCode`.
- **Approve (device B).** Scan/paste the QR → decode → show "Approve login **{matchCode}** for **{domain}**?" → on confirm, build a SIWE message binding `{domain, uri, chainId, nonce}` and **sign it locally** (`withEvmSigner` for embedded; the external wallet's own signer otherwise — the app never sees the key) → `POST /api/auth/qr/approve {challengeId, message, signature}`. The server runs `verifySiweSignature` (the SAME core the SIWE login uses — consumes the `SiweNonce`, binds domain/uri/chain), asserts `siwe.nonce === challenge.nonce`, resolves the recovered address to an **existing verified `LinkedWallet`** user (`resolveUserByWalletAddress` — QR login NEVER creates an account), rejects a suspended user, and atomically marks the challenge `approved` + binds `userId`.
- **Status / session (device A).** `GET /api/auth/qr/status?challengeId=…` (opaque: `pending|approved|expired`) polls. On `approved`, the server atomically **consumes** the challenge (single-use), re-checks suspended, `createSession(userId)`, and returns `{status:"approved", next:"/dashboard"}` with `withSessionCookie` **on device A's own response** — device B never receives A's cookie.

The whole loop reuses: `verifySiweSignature` + the `SiweNonce` single-use infra (Wave 11); `resolveUserByWalletAddress` (Wave 12); the `QrScanner` component (Wave 11 C3, jsQR, zero CSP change); `qrcode.toDataURL` (receive/air-gapped); `withEvmSigner` (embedded signer); `createSession` + `withSessionCookie` + `isAllowedOrigin` + `rateLimit`.

## Tech Stack (no new deps)

Next.js 15 App Router · `siwe` (present) · `qrcode` 1.5.4 (present) · `jsqr` (present, Wave 11) · viem · Prisma (dual schema) · Vitest + Playwright.

## Global Constraints (NON-NEGOTIABLE — copy into working memory)

1. **NON-CUSTODIAL.** The app never sees a private key/seed. Device B signs LOCALLY (`withEvmSigner` for embedded; the external wallet's own signer). The QR envelope carries ONLY public data (`challengeId, nonce, matchCode, domain, uri, chainId`) — never a key/seed/entropy. `test/no-secret-to-fetch.test.ts` is EXTENDED to scan the generated QR-login envelope string for the mnemonic/entropy/private-key of the fixed vault (found nowhere).
2. **SINGLE-USE + SHORT TTL.** `expiresAt = now + 120s`. The challenge is single-use: `approve` transitions `pending→approved` under an `updateMany({where:{status:"pending"}})` race guard; `status` (on approved) consumes it `approved→consumed` under the same guard and issues the session exactly once. The bound `SiweNonce` is single-use via `verifySiweSignature` (existing `usedAt` guard). The SIWE nonce MUST equal the challenge nonce (`siwe.nonce === challenge.nonce`) — this binds the signature to THIS challenge.
3. **ANTI-PHISHING.** The `matchCode` (a short human code) is shown on BOTH device A (with the QR) and device B (before signing), and device B shows the `domain` prominently ("Approve login … for cryptrepublic.com"). The UI copy instructs the user to only approve a login they started and whose code matches. Residual QR-login-phishing risk is DOCUMENTED (with the mitigations: matchCode + domain confirmation + 120s TTL + single-use + existing-verified-wallet-only + no account creation).
4. **OPAQUE + GUARDED.** `start` + `approve` are origin-gated (`isAllowedOrigin`); all three are rate-limited (per-IP). `status` responses are opaque (`pending|approved|expired`, never leaking whether a challengeId exists — an unknown/expired/consumed id all return `expired`). A suspended user is rejected at approve AND at session issuance (no suspension oracle — generic wording).
5. **EXISTING ACCOUNT ONLY.** `resolveUserByWalletAddress` requires a VERIFIED `LinkedWallet` → an existing `User`. QR login NEVER creates an account (prevents cold account-minting phishing). An unknown/unverified wallet → a clean rejection.
6. **DUAL PRISMA SCHEMA.** `WalletLoginChallenge` goes in BOTH `prisma/schema.prisma` AND `prisma/postgres/schema.prisma` (byte-identical datamodel; `prisma/schema-drift.test.ts` green) with BOTH a sqlite migration (`pnpm db:migrate`) AND a hand-authored postgres migration at the SAME `<ts>` dir — additive, prod-safe. New tables added after the postgres init snapshot live in the incremental migration; `test/deploy-scripts.test.ts` scans the UNION of all postgres migrations (Wave 12). Opportunistic cleanup of expired challenges (mirror `issueNonce`'s sweeper). `pnpm guard:secrets` stays green (column names `nonce/matchCode/status/userId/expiresAt/consumedAt` carry no secret substring).
7. **TDD RED-FIRST**; per-task commits with the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer; counts only grow (baseline 935 unit / 20 integration / 39 e2e / 165 forge).
8. **E2E BUDGET HARD `< 10`** (currently 9): any new e2e is login-bootstrapped (direct prisma + `POST /api/auth/login`, like `admin-panel.spec` / `wallet-modes.spec` / `referrals.spec`), ZERO `/api/auth/register`.
9. **NO new RPC methods; ZERO CSP change** (jsQR + qrcode already allowed; `connect-src 'self'` covers the poll fetches; `img-src data:` covers the QR image).
10. **Close-out:** docs (README wave row + a Wave-13 section, `docs/ARCHITECTURE.md` §14, CHANGELOG `0.13.0`, `package.json` `0.13.0`) + the FULL gate green.

## Verified ground truth (re-verify before editing)

- `lib/auth/siwe.ts` — `issueNonce(): Promise<string>` (creates a `SiweNonce` + sweeps expired/used); `verifySiweSignature(message, signature): Promise<{ address }>` (domain/uri/chain bound via `appHost()`/`appUri()`/`ALLOWED_CHAIN_IDS`; consumes the single-use `SiweNonce` matching `siwe.nonce`; throws `SiweError`). `SiweError` class. `appHost()`/`appUri()` are the domain/uri to put in the SIWE message + the QR envelope.
- `prisma/schema.prisma` / `prisma/postgres/schema.prisma` — `model SiweNonce { id, nonce @unique, address?, usedAt?, createdAt, expiresAt, @@index([expiresAt]) }` — the CLOSEST template for `WalletLoginChallenge` (a plain-column, no-FK relay row). **Wave 13 ADDS `WalletLoginChallenge`** after `SiweNonce` in BOTH.
- `lib/auth/session.ts` — `createSession(userId, opts?: { userAgent? }): Promise<{ token }>`; `SESSION_COOKIE`, `SESSION_TTL_MS`; `validateSessionToken` returns null for suspended/expired (the choke point after login).
- `lib/http/responses.ts` — `withSessionCookie(res, token): Response` (HttpOnly/Secure-in-prod/SameSite=Lax); `json`, `badRequest(msg?)`, `forbidden`, `genericAuthError`, `tooManyRequests`.
- `lib/auth/csrf.ts` — `isAllowedOrigin(req): boolean`. `lib/auth/ratelimit.ts` — `rateLimit(key, limit, windowMs): { ok, retryAfterSec }`, `__resetRateLimit()`.
- `lib/auth/guard.ts` — `requireSession(req)` (not needed for start/status; approve does NOT require a session — device B proves the wallet).
- `lib/referrals/lookup.ts` — `resolveUserByWalletAddress(address): Promise<string | null>` (a VERIFIED `LinkedWallet` → userId; unverified/unknown → null). **Reuse verbatim** (server-only).
- `components/wallet/QrScanner.tsx` — `QrScanner({ label, onResult, onCancel? })` (jsQR camera + "paste instead" fallback + track cleanup). Reuse for device B.
- `lib/wallet/embedded/session.ts` — `withEvmSigner(fn: (account) => Promise<T>)` (unlock-gated local signer; `account.signMessage`), `isUnlocked()`, `getAccounts()`.
- `lib/wallet/airgapped/codec.ts` — the versioned-envelope + `encodeUnsignedToQr` (EC-L pin + `QR_BYTE_LIMIT` byte guard) pattern to MIRROR for the tiny login envelope (a login envelope is far under the cap — a plain `qrcode.toDataURL` is fine, but pin `errorCorrectionLevel:"L"` for consistency).
- `app/auth/AuthForm.tsx` — the client SIWE flow (builds a `new SiweMessage({domain, address, statement, uri, version:"1", chainId, nonce, issuedAt}).prepareMessage()`, signs, POSTs). The QR-login device-B approve mirrors this but signs with the EMBEDDED wallet and posts to `/api/auth/qr/approve`. `app/auth/page.tsx` mounts `AuthForm` — add the "Sign in with a wallet QR" affordance here.
- `test/deploy-scripts.test.ts` — the union-scan guard (Wave 12) already tolerates a new incremental postgres migration. `test/no-secret-to-fetch.test.ts` — the fixed-vault fetch+QR secret guard to EXTEND.

## File Structure (new/edited)

```
prisma/
  schema.prisma                                    # EDIT (A1) — WalletLoginChallenge model
  postgres/schema.prisma                           # EDIT (A1) — byte-identical mirror
  migrations/<ts>_wave13_wallet_login/migration.sql          # NEW (A1) — sqlite CREATE TABLE
  postgres/migrations/<ts>_wave13_wallet_login/migration.sql # NEW (A1) — postgres mirror (SAME ts)
lib/auth/qrLogin/
  codec.ts                                         # NEW (A2) — encode/decode the public login envelope (+ QR data URL)
  codec.test.ts                                    # NEW (A2)
  challenge.ts                                     # NEW (A2) — createChallenge / loadChallenge / makeMatchCode / cleanup helpers
  challenge.test.ts                                # NEW (A2)
lib/validation/
  qrLogin.ts                                       # NEW (B2) — qrApproveSchema (.strict)
app/api/auth/qr/
  start/route.ts                                   # NEW (B1) — POST create a challenge
  start/route.test.ts                              # NEW (B1)
  approve/route.ts                                 # NEW (B2) — POST SIWE-approve (device B)
  approve/route.test.ts                            # NEW (B2)
  status/route.ts                                  # NEW (B3) — GET poll → session cookie on approve
  status/route.test.ts                             # NEW (B3)
components/auth/
  QrLoginPanel.tsx                                 # NEW (C1) — device A: QR + matchCode + poll → redirect
  QrLoginPanel.test.tsx                            # NEW (C1)
  QrLoginApprove.tsx                               # NEW (C2) — device B: scan → confirm → sign → approve
  QrLoginApprove.test.tsx                          # NEW (C2)
app/auth/AuthForm.tsx                              # EDIT (C1) — add the "Sign in with a wallet QR" tab
app/dashboard/wallet/approve-login/page.tsx        # NEW (C2) — device-B approve surface (session-guarded)
test/
  no-secret-to-fetch.test.ts                       # EDIT (D1) — the QR-login envelope carries no secret
e2e/
  qr-login.spec.ts                                 # NEW (D1) — login-bootstrapped; 0 new registrations
docs/ARCHITECTURE.md · README.md · CHANGELOG.md · package.json  # EDIT (D1)
```

---

## GROUP A — DATA MODEL + CODEC

## Task A1 — `WalletLoginChallenge` model (BOTH schemas + BOTH migrations)

**Files:** EDIT both schemas; NEW both migrations.

**READ FIRST:** the `SiweNonce` block in both schemas (the template), `prisma/schema-drift.test.ts`, the Wave-12 pair `prisma/migrations/20260703105139_wave12_referrals/migration.sql` + its postgres mirror (the additive dual-migration template), `test/deploy-scripts.test.ts` (union scan), `scripts/guard-no-secret-columns.sh`.

**Exact schema (IDENTICAL text in BOTH), after `model SiweNonce`:**
```prisma
/// A cross-device wallet-QR LOGIN challenge (Wave 13). Public relay row only —
/// never a key/seed. `nonce` == the SIWE nonce device B signs (single-use);
/// `matchCode` is shown on both devices (anti-phishing). Consumed once the
/// session is issued to device A.
model WalletLoginChallenge {
  id         String    @id @default(cuid())
  nonce      String    @unique
  matchCode  String
  status     String    @default("pending") // pending | approved | consumed
  userId     String? // bound on approve (the wallet's verified user); no FK (relay row)
  createdAt  DateTime  @default(now())
  expiresAt  DateTime
  consumedAt DateTime?

  @@index([expiresAt])
}
```
- RED: edit sqlite ONLY → `pnpm test schema-drift` fails ("only in sqlite"); mirror to postgres → GREEN.
- GREEN: `pnpm db:migrate` (name `wave13_wallet_login`) → review the sqlite `CREATE TABLE`; hand-author the postgres mirror (`"id" TEXT PRIMARY KEY`, `"expiresAt" TIMESTAMP(3)`, unique index on `nonce`, index on `expiresAt`) at the SAME `<ts>` dir. `pnpm guard:secrets` + `pnpm test schema-drift deploy-scripts` green; regenerate the client.
- **DB path trap (learned Wave 12):** run migrations with the DEFAULT `.env` `DATABASE_URL` (`file:./dev.db` → `prisma/dev.db`) — NEVER override to `file:./prisma/dev.db` (that resolves to `prisma/prisma/dev.db` and the test DB never gets the table).
- Commit `feat(db): Wave-13 A1 — WalletLoginChallenge model (dual schema + both migrations)`.

## Task A2 — Login-envelope codec + challenge helpers

**Files:** NEW `lib/auth/qrLogin/codec.ts` (+ test), `lib/auth/qrLogin/challenge.ts` (+ test).

**READ FIRST:** `lib/wallet/airgapped/codec.ts` (envelope + EC-L QR pattern), `lib/auth/siwe.ts` (`issueNonce`, the sweeper), `lib/db`, `lib/wallet/receive.ts` (`qrcode.toDataURL`).

**`codec.ts` (public only):**
```ts
import "server-only"; // (safe: only imported by the start route + a client copy of the TYPES)
export interface QrLoginEnvelope { v: 1; t: "cr-wallet-login"; challengeId: string; nonce: string; matchCode: string; domain: string; uri: string; chainId: number; }
export function encodeQrLogin(e: QrLoginEnvelope): string;         // compact JSON
export function decodeQrLogin(s: string): QrLoginEnvelope;        // throws on wrong v/t/shape
export async function encodeQrLoginToDataUrl(e: QrLoginEnvelope): Promise<string>; // qrcode.toDataURL(s,{margin:1,errorCorrectionLevel:"L"})
```
- NOTE: the CLIENT (device B decode) needs `decodeQrLogin`. Since it must run in the browser, put the pure `encode/decode` + the interface in a `"use client"`-safe module WITHOUT `server-only` (the QR generation `encodeQrLoginToDataUrl` uses `qrcode` which is client-safe too). DECISION: `codec.ts` has NO `server-only` marker (pure functions + `qrcode`); only `challenge.ts` (prisma) is server-only. State this.

**`challenge.ts` (server-only):**
```ts
import "server-only";
export const CHALLENGE_TTL_MS = 120_000;
export function makeMatchCode(): string;                 // 6 chars, crypto-random, unambiguous alphabet (no O/0/I/1)
export async function createChallenge(): Promise<{ challengeId: string; nonce: string; matchCode: string }>; // issueNonce() + prisma.walletLoginChallenge.create({expiresAt: now+TTL}); sweeps expired rows
export async function loadPendingChallenge(challengeId: string): Promise<{ id; nonce; matchCode; status; userId } | null>; // null if missing/expired
```
- RED: `challenge.test.ts` (node, prisma) — `createChallenge` inserts a pending, unexpired row whose nonce is also a `SiweNonce`; `makeMatchCode` is 6 chars from the safe alphabet; `loadPendingChallenge` returns null for an expired row; the sweeper deletes an expired challenge on the next `createChallenge`. `codec.test.ts` — encode↔decode round-trips; `decodeQrLogin` throws on wrong `v`/`t`/non-JSON; the data-URL pins `errorCorrectionLevel:"L"`.
- Commit `feat(auth): Wave-13 A2 — QR-login envelope codec + challenge helpers`.

---

## GROUP B — ENDPOINTS

## Task B1 — `POST /api/auth/qr/start`

**READ FIRST:** `lib/auth/csrf.ts`, `lib/auth/ratelimit.ts`, `lib/config/chain.ts` (`activeChain().primaryChainId`), `lib/auth/siwe.ts` (`appHost`/`appUri` — export them if not already), `lib/auth/qrLogin/challenge.ts`.

**Route:** `isAllowedOrigin → forbidden`; `rateLimit("qr-start:"+ip, 30, 5*60_000) → tooManyRequests`; `const {challengeId, nonce, matchCode} = await createChallenge()`; return `json({ challengeId, nonce, matchCode, domain: appHost(), uri: appUri(), chainId: activeChain().primaryChainId })`.
- RED: 403 foreign origin; 200 returns a challengeId/nonce/matchCode + the domain/uri/chainId; a `WalletLoginChallenge` row exists pending. Commit `feat(auth): Wave-13 B1 — POST /api/auth/qr/start`.

## Task B2 — `POST /api/auth/qr/approve` (device B)

**Files:** route (+ test), `lib/validation/qrLogin.ts`.

**READ FIRST:** `lib/auth/siwe.ts` (`verifySiweSignature`, `SiweError`, `SiweMessage` from `siwe` for reading `.nonce`), `lib/referrals/lookup.ts` (`resolveUserByWalletAddress`), `lib/db`, `app/api/wallet/link/route.ts` (the SIWE-verify-then-bind template).

**Schema:** `qrApproveSchema = z.object({ challengeId: z.string().min(1), message: z.string().min(1), signature: z.string().regex(/^0x[0-9a-fA-F]+$/) }).strict()`.

**Route:**
1. `isAllowedOrigin → forbidden`; `rateLimit("qr-approve:"+ip, 30, 5*60_000)`.
2. parse + `qrApproveSchema` → `badRequest`.
3. `challenge = loadPendingChallenge(challengeId)`; `!challenge` → `badRequest("This login request is no longer valid.")` (opaque).
4. `const { address } = await verifySiweSignature(message, signature)` (catch `SiweError` → `badRequest("Wallet signature verification failed.")`). This CONSUMES the SiweNonce.
5. `const siweNonce = new SiweMessage(message).nonce; if (siweNonce !== challenge.nonce) return badRequest("This signature is for a different login request.")` — binds the SIWE to THIS challenge.
6. `const userId = await resolveUserByWalletAddress(address); if (!userId) return badRequest("No CryptRepublic account is linked to that wallet.")` (no account creation).
7. suspended check: `const u = await prisma.user.findUnique({where:{id:userId}, select:{suspendedAt:true}}); if (u?.suspendedAt) return badRequest("This login request is no longer valid.")` (opaque — no suspension oracle).
8. atomic single-use approve: `const res = await prisma.walletLoginChallenge.updateMany({ where:{ id: challengeId, status:"pending", expiresAt:{ gt: new Date() } }, data:{ status:"approved", userId } }); if (res.count === 0) return badRequest("This login request is no longer valid.")` (race/expired).
9. `json({ ok: true, matchCode: challenge.matchCode })`.
- RED: 403 foreign origin; bad body 400; unknown/expired challenge 400; a bad signature 400 (SiweError); a signature whose SIWE nonce ≠ the challenge nonce 400; a wallet with NO verified LinkedWallet 400 (no account created); a suspended user 400; the happy path → 200 + the challenge is `approved` with `userId` bound; a second approve of the same challenge 400 (single-use). Commit `feat(auth): Wave-13 B2 — POST /api/auth/qr/approve (SIWE, existing-verified-wallet only)`.

## Task B3 — `GET /api/auth/qr/status` (device A poll → session)

**READ FIRST:** `lib/auth/session.ts` (`createSession`), `lib/http/responses.ts` (`withSessionCookie`, `json`), `lib/auth/ratelimit.ts`.

**Route:** `rateLimit("qr-status:"+ip, 120, 60_000)`; `const challengeId = new URL(req.url).searchParams.get("challengeId")`; load the challenge.
- missing/expired/consumed/unknown → `json({ status: "expired" })` (opaque).
- `status === "pending"` → `json({ status: "pending" })`.
- `status === "approved"` (userId set, unexpired):
  - atomic consume: `updateMany({ where:{ id, status:"approved" }, data:{ status:"consumed", consumedAt: new Date() } })`; `count === 0` → `json({ status:"expired" })` (already consumed).
  - re-check suspended (`suspendedAt` → `json({ status:"expired" })`).
  - `const { token } = await createSession(userId, { userAgent: req.headers.get("user-agent") ?? undefined })`; `return withSessionCookie(json({ status:"approved", next:"/dashboard" }), token)` — **the cookie rides device A's own response**.
- RED: unknown id → `expired`; a pending challenge → `pending`; an approved challenge → `approved` + a `Set-Cookie: cr_session` + the challenge becomes `consumed`; a second poll of the same challenge → `expired` + NO cookie (single-use); a suspended-user approved challenge → `expired` + no cookie. Commit `feat(auth): Wave-13 B3 — GET /api/auth/qr/status (opaque poll → single-use session cookie)`.

---

## GROUP C — UI

## Task C1 — Device A: `QrLoginPanel` + the `/auth` "wallet QR" tab

**Files:** NEW `components/auth/QrLoginPanel.tsx` (+ test); EDIT `app/auth/AuthForm.tsx`.

**READ FIRST:** `app/auth/AuthForm.tsx` (the tab/section structure + styling), `lib/auth/qrLogin/codec.ts` (`encodeQrLogin` — but device A gets the data-URL from the server OR builds it client-side from the start payload), `components/wallet/receive`-style QR `<img data-testid=...>` pattern.

**Behavior:** on mount (or on tab open), `POST /api/auth/qr/start` → render a QR `<img>` of the envelope (build the data URL client-side via `encodeQrLoginToDataUrl`, or return it from start — DECISION: build client-side from the start fields so the QR image stays a pure `data:` URL) + show the `matchCode` prominently + a "waiting for approval…" state. Poll `GET /api/auth/qr/status?challengeId` every ~2s; on `{status:"approved"}` → `window.location.href = next` (the cookie is already set). On `{status:"expired"}` → show "This code expired — regenerate" + a refresh button (new `start`). Stop polling on unmount. `data-testid`: `qr-login-panel`, `qr-login-image`, `qr-login-matchcode`, `qr-login-expired`, `qr-login-refresh`.
- RED: `QrLoginPanel.test.tsx` (mock fetch): renders the QR image + matchCode after start; polling `approved` triggers a redirect (mock `window.location`); `expired` shows the refresh affordance. Commit `feat(auth): Wave-13 C1 — device-A QR login panel + /auth tab`.

## Task C2 — Device B: `QrLoginApprove` (scan → confirm → sign → approve)

**Files:** NEW `components/auth/QrLoginApprove.tsx` (+ test); NEW `app/dashboard/wallet/approve-login/page.tsx` (session-guarded surface).

**READ FIRST:** `components/wallet/QrScanner.tsx` (Wave 11 C3), `lib/auth/qrLogin/codec.ts` (`decodeQrLogin`), `lib/wallet/embedded/session.ts` (`withEvmSigner`, `isUnlocked`, `getAccounts`), `app/auth/AuthForm.tsx` (the SIWE message construction to mirror), `siwe` `SiweMessage`.

**Behavior:** `QrScanner` (camera or paste) → `decodeQrLogin(text)` → show a confirm card: "Approve login **{matchCode}** for **{domain}**?" + the honest note ("Only approve a login you started; check the code matches your other screen."). On confirm: require the embedded wallet unlocked (else prompt unlock — reuse the unlock modal, or gate on `isUnlocked()`); build `new SiweMessage({ domain, address: getAccounts().evm, statement:"Approve a CryptRepublic wallet-QR login.", uri, version:"1", chainId, nonce, issuedAt: new Date().toISOString() }).prepareMessage()`; sign via `withEvmSigner(a => a.signMessage({ message }))`; `POST /api/auth/qr/approve { challengeId, message, signature }`; on 200 → "Approved ✓ — return to your other device"; on error → surface the server message. `data-testid`: `qr-approve`, `qr-approve-matchcode`, `qr-approve-domain`, `qr-approve-confirm`, `qr-approve-done`, `qr-approve-error`. (External-wallet approve is a documented follow-up — embedded is the primary path this wave.)
- RED: `QrLoginApprove.test.tsx` (mock QrScanner via paste, mock `withEvmSigner` + fetch): pasting a valid envelope shows the matchCode + domain; confirm → signs + POSTs `{challengeId, message, signature}` → the done state; a decode error / server 400 surfaces an alert; a garbage payload is refused. Commit `feat(auth): Wave-13 C2 — device-B QR approve (scan → local SIWE sign → approve)`.

---

## GROUP D — CLOSE-OUT

## Task D1 — Secret guard + e2e + docs + version 0.13.0 + FULL gate

**Files:** EDIT `test/no-secret-to-fetch.test.ts`; NEW `e2e/qr-login.spec.ts`; EDIT docs + `package.json`.

**Secret guard:** in the fixed-vault harness, build a `QrLoginEnvelope` for the vault's EVM address, `encodeQrLogin` it, and assert the string contains NONE of the mnemonic/entropy/private-key (public data only).

**E2E (login-bootstrapped, 0 new registrations):** seed a user + a verified `LinkedWallet` (direct prisma). Because a browser can't hold the anvil key to sign a real SIWE cheaply, drive the flow at the HTTP layer where signing is needed: (1) `POST /api/auth/qr/start` → a challenge; (2) render the `/auth` panel and assert the QR image + matchCode show and the panel polls; (3) approve via a Playwright `request.post('/api/auth/qr/approve', …)` with a SIWE message signed by a viem test account whose address is the seeded verified wallet (mirrors `admin-panel.spec`'s direct-request style); (4) assert the panel then redirects / the `status` poll returns `approved` with a `cr_session` cookie; (5) axe on `/auth` and the approve surface. Document the ledger: 0 new registrations (total stays 9).

**Docs:** ARCHITECTURE §14 (the challenge/approve/status flow; the SIWE-nonce binding; matchCode + domain anti-phishing + the residual-risk note; existing-verified-wallet-only, no account creation; single-use + TTL; the cookie only on device A; dual schema/migration; reuse of Wave-11 SIWE/QR + Wave-12 resolver; external-wallet approve deferred). README wave row + a Wave-13 section. CHANGELOG `0.13.0`. `package.json` `0.13.0`.

**FULL GATE:** `pnpm guard:secrets && pnpm format:check && pnpm typecheck && pnpm lint && pnpm test && pnpm test:integration && pnpm e2e && (cd contracts && forge test) && pnpm build` — all green; e2e registrations < 10; drift + deploy-scripts + snapshot + coverage pass; counts grew. Commit `docs+chore: Wave-13 D1 — QR-login secret guard + e2e + docs + package 0.13.0 + full gate`.

---

## Final acceptance checklist (verify before claiming Wave 13 complete)

- [ ] **Schema:** `WalletLoginChallenge` byte-identical in both schemas; drift + guard:secrets green; sqlite + hand-authored postgres migrations share the `<ts>` dir; additive/prod-safe; deploy-scripts union scan green (A1).
- [ ] **Codec + challenge:** the login envelope carries ONLY public data; encode↔decode round-trips + rejects bad shapes; `createChallenge` mints a single-use `SiweNonce` + a pending, TTL'd row + sweeps expired ones; `makeMatchCode` is unambiguous (A2, D1 secret guard).
- [ ] **Start:** origin-gated + rate-limited; returns `{challengeId, nonce, matchCode, domain, uri, chainId}`; creates a pending row (B1).
- [ ] **Approve:** origin-gated + rate-limited + strict Zod; `verifySiweSignature` (SIWE nonce == challenge nonce); `resolveUserByWalletAddress` (EXISTING verified wallet only — never creates an account); suspended rejected (opaque); atomic single-use `pending→approved`; a replay 400 (B2).
- [ ] **Status:** opaque `pending|approved|expired`; on approved → atomic `approved→consumed` + suspended re-check + `createSession` + `withSessionCookie` on device A's own response; a second poll → `expired` + no cookie (B3).
- [ ] **UI:** device A shows the QR (a `data:` image) + matchCode, polls, redirects on approval, offers refresh on expiry; device B scans/pastes, shows matchCode + domain, signs LOCALLY with the embedded wallet, approves, shows done/error; only-approve-a-login-you-started copy present (C1, C2).
- [ ] **Non-custodial + anti-phishing:** the app never sees a key; the QR has no secret (guard extended); matchCode on both devices + domain on B + 120s TTL + single-use + existing-verified-wallet-only; residual risk documented (Constraints #1/#3, D1).
- [ ] **e2e:** login-bootstrapped, 0 new registrations (total 9); the approve is a SIWE signed by the seeded wallet; axe clean (D1).
- [ ] **All suites green + counts grow**; docs (ARCHITECTURE §14, README, CHANGELOG 0.13.0, package.json 0.13.0); per-task commits with the Fable 5 trailer; no new RPC methods; no CSP change (D1).

## Notes for the implementer (traps — verified)

1. **Bind the SIWE to the challenge.** `verifySiweSignature` returns only `{address}`; read `new SiweMessage(message).nonce` in the approve route and require it `=== challenge.nonce`. Without this, a SIWE signed for a DIFFERENT challenge (or a stray login) could approve this one.
2. **The cookie rides device A only.** `withSessionCookie` is applied on the `status` (device A poll) response — NEVER on the `approve` (device B) response. Device B must never receive device A's session.
3. **Single-use is TWO guards.** The `SiweNonce` (consumed by `verifySiweSignature`) AND the challenge (`pending→approved→consumed` via `updateMany` count guards). Both must hold; a replay of approve OR of the winning status poll must fail closed.
4. **Opaque status.** Unknown / expired / consumed challengeIds ALL return `{status:"expired"}` — never distinguish "no such challenge" from "expired" (no existence oracle). Suspended-at-issuance also collapses to `expired`.
5. **No account creation.** `resolveUserByWalletAddress` (verified `LinkedWallet` only) — do NOT fall back to `verifySiwe`'s create-a-user path. A cold wallet cannot mint an account via a QR someone tricked the user into scanning.
6. **Codec is client-safe.** `lib/auth/qrLogin/codec.ts` has NO `server-only` (device B decodes in the browser; `qrcode` is client-safe). Only `challenge.ts` (prisma) is `server-only`.
7. **DB path trap (Wave 12).** Run `prisma migrate dev` with the default `.env` `DATABASE_URL` — do not override to `file:./prisma/dev.db`.
8. **Anti-phishing is UX + documented, not absolute.** The matchCode/domain/TTL/single-use/existing-wallet mitigations reduce QR-login phishing but cannot fully prevent a user approving an attacker's device-A QR. Document this honestly; a future hardening is to require device B to already be authenticated ("approve a new device for MY account").
9. **E2E signing.** The browser can't cheaply hold the anvil key; sign the approve SIWE with a viem test account via a Playwright `request.post` (the seeded wallet's key), mirroring `admin-panel.spec`'s direct-request bootstrap — keeps the spec deterministic and registration-free.
10. **`appHost`/`appUri` exports.** If `lib/auth/siwe.ts` does not already export `appHost`/`appUri`, export them (they build the SIWE `domain`/`uri`) so the start route + the SIWE message use identical values (a mismatch fails `verifySiweSignature`).
