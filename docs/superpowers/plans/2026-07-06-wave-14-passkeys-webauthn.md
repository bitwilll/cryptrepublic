# CryptRepublic Wave 14 — Passkeys (WebAuthn): enroll + passwordless sign-in + require-passkey step-up (One Portal identity, slice 2) — Implementation Plan

## Goal

Let a citizen add **passkeys** (Touch ID / Face ID / security keys) to their account, sign in with one — passwordless — and optionally require a passkey to complete every password sign-in ("require passkey" step-up). Chosen over TOTP because it PRESERVES the no-secret-columns invariant: the server stores only the credential **public key** + counter + public metadata. `guard:secrets` stays green with zero exceptions (verified: every new column name passes the guard regex `(privateKey|seedPhrase|mnemonic|plaintextPassword|passwordPlain|secretKey)`).

## Architecture

Two models + six routes + two UI surfaces, on `@simplewebauthn` v13:

- **Enroll (logged in).** `POST /api/auth/webauthn/register/options` (requireSession) → create a `WebAuthnChallenge {type:"registration", userId, expiresAt:+5m}` → `generateRegistrationOptions` (residentKey `"required"` for discoverable/usernameless login, `excludeCredentials` = the user's existing, attestation `"none"`). `POST /api/auth/webauthn/register/verify` → decode the challenge from the response's `clientDataJSON`, consume it single-use (updateMany `usedAt:null` guard, must match type+userId+unexpired), `verifyRegistrationResponse({expectedChallenge, expectedOrigin, expectedRPID})` → store `WebAuthnCredential {credentialId @unique, publicKey (base64url — PUBLIC), counter (BigInt), transports, deviceType, backedUp, label}`.
- **Passkey login (unauthenticated).** `POST /api/auth/webauthn/login/options` → challenge `{type:"authentication", userId:null}` → `generateAuthenticationOptions` (empty `allowCredentials` — discoverable). `POST /api/auth/webauthn/login/verify` → decode+consume the challenge, look up the credential by `response.id`, `verifyAuthenticationResponse` → reject suspended (generic) → update `counter`+`lastUsedAt` → `createSession` + `withSessionCookie(json({ok:true,next:"/dashboard"}))` — the same success tail as password login.
- **Require-passkey step-up (NO pending-token table).** `User.passkey2faEnabled` (default false; enable requires ≥1 credential; deleting the LAST credential auto-disables it in the same transaction — no lockout). The login route, between `resetFailedLogins` (l.65) and `createSession` (l.66): if `passkey2faEnabled` && credential count > 0 → return `json({ok:true, twoFactor:true})` **without a session**. AuthForm branches on `data.twoFactor` BEFORE `router.push(data.next…)` and prompts the standard passkey ceremony (login/options+verify), which issues the session. Rationale (documented): a UV-gated passkey is inherently multi-factor (possession + biometric/PIN); the toggle's meaning is "password alone is never sufficient". No new token, nothing to leak or expire.
- **Manage.** `GET /api/auth/webauthn/credentials` (public metadata only — id/label/deviceType/backedUp/createdAt/lastUsedAt; BigInt-safe serialization), `POST /api/auth/webauthn/credentials/delete`, `POST /api/auth/webauthn/2fa` — all requireSession + origin + rate limit + strict Zod.
- **UI.** `/auth`: a "Sign in with a passkey" entry mirroring the Wave-13 Wallet-QR entry (`styles.wallet` button block, `{signin && …}`, AuthForm.tsx:258-288) — one tap runs the ceremony via `@simplewebauthn/browser.startAuthentication`. Manage surface: `app/dashboard/wallet/security/page.tsx` (server shell cloned from `approve-login/page.tsx` — inherits the dashboard guard, highlights the Wallet nav via `isActive` prefix) + `components/auth/PasskeysSurface.tsx` ("use client" island: list/enroll/delete + the require-passkey toggle) + a second `btn-ghost` link on the wallet page.

## Verified ground truth (from the survey — re-verify before editing)

- `app/api/auth/login/route.ts:66-69` success tail: `createSession(user.id, {userAgent})` + `withSessionCookie(json({ok:true, next:"/dashboard"}), token)`. The 2FA branch inserts at l.65/66. All failure paths return `genericAuthError()` (enumeration-resistant) — the twoFactor response must NOT leak whether an email exists (it only fires AFTER a correct password, so it doesn't).
- `AuthForm.tsx:95-113`: any 200 → `router.push(data.next ?? …)`; branch on `data.twoFactor` first. Entry-button pattern at 258-288 (`showQr` state l.35; glyph WCAG note at 235-238 — use `var(--ink)` text on light glyph backgrounds).
- `lib/auth/tokens.ts`: `generateSessionToken()` 32-byte hex, `hashToken` sha256 — NOT needed this wave (no pending token).
- Guards: schema-guard regex `(privateKey|seedPhrase|mnemonic|plaintextPassword|passwordPlain|secretKey)` (comments included — never write those literal tokens in schema comments); audit `SECRET_NAME_RE` forbids `tokenHash`/`challenge`-bearing fields in allowlists — do NOT add any WebAuthn field to audit allowlists (no admin surface this wave); `test/no-admin-signing.test.ts` scans only admin dirs — WebAuthn routes live in `app/api/auth/webauthn/` (outside).
- Drift guard: token-identical field definitions + sorted @@-attrs across both schemas. Deploy union scan: the new postgres migration must contain `CREATE TABLE "WebAuthnCredential"` + `CREATE TABLE "WebAuthnChallenge"` + `ALTER TABLE "User" ADD COLUMN "passkey2faEnabled" BOOLEAN NOT NULL DEFAULT false`.
- Playwright: no `projects` array → default chromium; CDP virtual authenticator available: `page.context().newCDPSession(page)` → `WebAuthn.enable` → `WebAuthn.addVirtualAuthenticator({options:{protocol:'ctap2', transport:'internal', hasResidentKey:true, hasUserVerification:true, isUserVerified:true, automaticPresenceSimulation:true}})`. Login-bootstrap: direct prisma (absolute `file:` URL) + `POST /api/auth/login {email, passphrase}` + Origin header; ZERO new registrations (budget stays 9 < 10).
- CSP: NO middleware change (WebAuthn is a browser API; ceremony traffic is `/api/*` under `connect-src 'self'`).
- `package.json`: pnpm@10.33.0, node ≥20 (v22 local); add `@simplewebauthn/server@^13` + `@simplewebauthn/browser@^13` (no postinstall scripts — the pnpm onlyBuiltDependencies allowlist is unaffected).
- vitest: `vi.mock("@simplewebauthn/server", …)` works (no alias interference); route tests = node pragma + real sqlite prisma + bare `Request` with origin header.

## Schema (IDENTICAL in both prisma trees; comments must avoid the guard's literal tokens)

```prisma
/// A WebAuthn passkey credential (Wave 14). PUBLIC data only — the credential's
/// public key, signature counter, and metadata. The private half never leaves
/// the user's authenticator; the server can never sign as the user.
model WebAuthnCredential {
  id           String    @id @default(cuid())
  credentialId String    @unique // base64url credential ID from the authenticator
  userId       String
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  publicKey    String // base64url COSE public key (public by definition)
  counter      BigInt    @default(0) // uint32 signature counter (clone detection)
  transports   String? // comma-joined AuthenticatorTransport hints
  deviceType   String // singleDevice | multiDevice
  backedUp     Boolean   @default(false)
  label        String? // user-chosen display name
  createdAt    DateTime  @default(now())
  lastUsedAt   DateTime?

  @@index([userId])
}

/// A single-use WebAuthn ceremony challenge (Wave 14). Mirrors SiweNonce:
/// short-TTL, consumed exactly once; `userId` is set for registration
/// ceremonies (bound to the enrolling session) and null for login ceremonies.
model WebAuthnChallenge {
  id        String    @id @default(cuid())
  challenge String    @unique // base64url challenge issued to the browser
  type      String // registration | authentication
  userId    String?
  usedAt    DateTime?
  createdAt DateTime  @default(now())
  expiresAt DateTime

  @@index([expiresAt])
}
```
Plus `User.passkey2faEnabled Boolean @default(false)` (with the User relation `webauthnCredentials WebAuthnCredential[]`).

## Tasks

- **A1 — deps + schema + dual migrations.** `pnpm add @simplewebauthn/server @simplewebauthn/browser`; both schemas; `pnpm db:migrate` (name `wave14_webauthn_passkeys`, DEFAULT .env DATABASE_URL — the Wave-12 path trap); hand-author the postgres mirror at the SAME `<ts>` dir (TIMESTAMP(3), `_pkey` constraints, the additive header comment). Green: guard:secrets, schema-drift, deploy-scripts. Commit.
- **A2 — `lib/auth/webauthn/core.ts` (+ test).** `rpID()` (APP_URL hostname minus a leading `www.`), `rpName = "CryptRepublic"`, `expectedOrigins()` ([appUri(), its www twin origin]); `createWebAuthnChallenge(type, userId?)` (+5 min TTL, sweeps expired/used — mirrors issueNonce); `consumeChallenge(challenge, type, userId?)` (updateMany single-use guard → boolean); `challengeFromClientData(responseJSON)` (decode `clientDataJSON.challenge` base64url); base64url helpers for the publicKey bytes. Server-only. TDD.
- **B1 — register options+verify routes (+ tests).** requireSession + origin + rateLimit(`webauthn-reg:${userId}`, 20/15m) + strict Zod (`lib/validation/webauthn.ts`). Verify: consume the challenge (bound to type+userId), `verifyRegistrationResponse` (mocked in unit tests), create the credential (P2002 → "already registered"), return the public metadata. Tests: guards; challenge single-use; a mismatched user's challenge fails; stored row has the base64url publicKey + counter.
- **B2 — login options+verify routes (+ tests).** Unauthenticated; origin + rateLimit(`webauthn-login:${ip}`, 30/15m). Verify: consume (type authentication), credential lookup by `response.id` (unknown → generic 401 — no enumeration), `verifyAuthenticationResponse` (mocked), suspended → generic 401, counter+lastUsedAt update, `createSession` + cookie `{ok, next:"/dashboard"}`. Tests: guards; single-use; unknown credential; suspended; counter persisted; cookie set.
- **B3 — manage routes + the login-route step-up branch (+ tests).** credentials GET (BigInt-safe), delete POST (own-credential only; last-credential delete auto-disables `passkey2faEnabled` in the SAME transaction), 2fa POST (enable requires ≥1 credential). Login route: the `twoFactor:true` no-session branch + tests (flag on+credential → 200 twoFactor, NO cookie; flag on+zero credentials → normal session — never lock out; flag off → unchanged).
- **C1 — AuthForm passkey entry + step-up completion (+ tests).** A `passkeyLogin()` helper (options → `startAuthentication({optionsJSON})` → verify → `router.push(next)`); the "Sign in with a passkey" entry button; the `data.twoFactor` branch rendering a "Finish with your passkey" panel (console-log lines per house style). jsdom tests mock `@simplewebauthn/browser` + fetch.
- **C2 — PasskeysSurface + `/dashboard/wallet/security` page + the wallet-page link (+ tests).** List/enroll(label)/delete + the require-passkey toggle (disabled until a passkey exists; honest copy: "your passkey approves each password sign-in; deleting your last passkey turns this off"). Client island under `components/auth/` (Wave-13 boundary rule). jsdom tests.
- **D1 — e2e + docs + 0.14.0 + FULL gate.** `e2e/passkeys.spec.ts` (CDP virtual authenticator; login-bootstrapped, ZERO new registrations): enroll on the security page → list shows it → sign out → passkey sign-in from /auth lands on /dashboard (cr_session) → enable require-passkey → password login returns twoFactor and the UI prompts (+ axe on both surfaces). Docs: ARCHITECTURE §15, README wave row + section, CHANGELOG 0.14.0, package.json 0.14.0. FULL gate: guard:secrets · format · typecheck · lint · unit · integration · e2e (<10 regs) · forge · build.

## Traps

1. **BigInt counter** — serialize as `Number(counter)`/string in JSON responses; prisma BigInt in both dialects.
2. **simplewebauthn v13 shapes** — `registrationInfo.credential.{id, publicKey, counter, transports}` (v13 renamed from `authenticator`); `startRegistration/startAuthentication` take `{optionsJSON}`. Verify against the installed types at A2, not from memory.
3. **rpID vs www** — rpID = registrable host (strip `www.`); expectedOrigin must be the ARRAY of both apex + www origins.
4. **Never** add WebAuthn fields to audit allowlists (`SECRET_NAME_RE` forbids challenge/tokenHash-bearing names) — no admin surface this wave.
5. **Schema comments** must not contain the guard's literal tokens (write "private half", not the single-word forms).
6. **Enumeration resistance** — login/verify failures (unknown credential, failed verify, suspended) all return the same generic 401.
7. **No lockout** — enable-2fa requires a credential; deleting the last credential auto-disables the flag transactionally.
8. **The e2e webServer is a PROD build** — the virtual authenticator works there; register the CDP session per page.
