# CryptRepublic Wave 11 — Wallet Modes: EMBEDDED (create + IMPORT) · HARDWARE/EXTERNAL (wagmi) · WATCH-ONLY + AIR-GAPPED QR SIGNING — Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL — before executing any task below, invoke `superpowers:test-driven-development` and `superpowers:executing-plans`. Every task is TDD: write the failing test FIRST (RED), then the implementation (GREEN), then run the stated command and confirm green. Do NOT skip the RED step. Keep ALL prior tests green (≈692 unit + 15 integration + 29 e2e @ 9 registrations + 165 forge as of Wave 10 close-out). Commit each task separately with the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.

## Goal

Wave 11 (spec §5 Wallet Subsystem + the LIVE app's `/wallet` + `/dashboard/wallet`) makes the wallet screen a **mode chooser** with THREE non-custodial modes, and closes the entire air-gapped signing loop inside the product so it is end-to-end testable without external hardware:

1. **EMBEDDED** — create a new BIP-39 vault (exists) **OR import an existing 24/12-word mnemonic** (new). Import validates the phrase BEFORE any derivation, encrypts with a fresh vault passphrase exactly like create (Argon2id / AES-256-GCM), and treats importing over an existing "primary" vault as an explicit, confirmed OVERWRITE (never a silent clobber).
2. **HARDWARE / EXTERNAL** — connect an existing hardware/external wallet via the already-wired wagmi connectors (`injected()` + `walletConnect()`). Shows the connected address + live balances (reuse portfolio reads), sends via the wallet's own signer (`walletClient.sendTransaction`), and enforces a correct-chain check with graceful "no connector / rejected" states. **Direct Ledger WebHID is a documented DEFERRAL** (WalletConnect / injected covers Ledger Live + browser-extension Ledger today).
3. **WATCH-ONLY + AIR-GAPPED** (the core) — track a public EVM address (read-only portfolio / history / stats), and SIGN transactions air-gapped via QR + camera. The watch-only device builds an **unsigned** tx, renders it as a QR; an OFFLINE signer scans + signs it; the watch-only device's **camera** scans the **signed raw tx** back and broadcasts it via the existing `eth_sendRawTransaction` proxy. **Keys NEVER touch the watch-only device.** The offline signer is the CryptRepublic **embedded wallet in a new "scan a request to sign" mode** (an unlocked vault on an air-gapped device), which decodes the unsigned-tx QR, shows the human-readable tx — **decoding ERC-20 transfer calldata (`decodeFunctionData`) so the TRUE recipient + amount are shown, never the raw token-contract `to`/`0` value** — signs with the embedded key (`account.signTransaction`, **never** broadcasting), and renders the signed raw tx as a QR — closing the loop entirely within the product.

Non-custodial is the app's core ethos and is treated as an absolute invariant throughout (see Global Constraints). The unsigned-tx QR contains ONLY tx parameters (never a key); the signed QR contains a public raw tx (safe to broadcast).

## Architecture (how the three modes compose over the existing seams)

- **One persisted wallet mode.** A new `lib/wallet/mode.ts` (client-only) persists the chosen mode (`embedded` | `hardware` | `watchonly`) + the watch-only EVM address in a dedicated IndexedDB store, SEPARATE from the vault store (the vault DB is `cryptrepublic`/`vaults`; mode metadata lives in the SAME DB, new store `meta`, so a single `openDB` upgrade covers both). `WalletApp` (`/wallet`) and `WalletChainApp` (`/dashboard/wallet`) gain a mode-select entry state that reads/writes this. Embedded remains the default; existing create/unlock/reveal flows are unchanged inside the `embedded` branch.
- **Import reuses the create seam byte-for-byte.** `importWallet(passphrase, mnemonic, label?)` in `session.ts` mirrors `createWallet` EXACTLY except the phrase is supplied and validated first (`validateMnemonic` → `mnemonicToEntropy` → `mnemonicToSeed` → `deriveAllAccounts` → `encryptEntropy` → `saveVault` → set `unlockedSeed`; zeroize entropy). Overwrite is guarded by the caller checking `hasVault()` and passing an explicit confirmation.
- **External SEND fills the one missing seam.** All existing external writes use `simulate → walletClient.writeContract` (mint/gov/dividends `*External`). There is no external plain-SEND; `sendEvmExternal(walletClient, req)` adds it using `walletClient.sendTransaction` (native) / `writeContract(erc20.transfer)` or an encoded `sendTransaction` (ERC-20). It reuses `buildCall(req)` shape from `send.ts`.
- **Air-gapped signing is a NEW module cluster that reuses the EXACT send seam.** `lib/wallet/airgapped/*` builds the SAME unsigned EIP-1559 tx object `send.ts` builds (nonce via `getTransactionCount(pending)`, `estimateFeesPerGas`, `estimateGas`), serializes it for the QR with viem `serializeTransaction` (viem 2.54.1), and broadcasts the scanned signed raw tx via `client.sendRawTransaction` — the SAME broadcast call `sendEvm` uses. The offline signer signs with `account.signTransaction` (the SAME call `sendEvm` uses) but NEVER broadcasts.
- **QR scanner is a bundled, self-contained pure-JS component.** No CDN, no external script. `getUserMedia` runs only on an explicit "Scan" tap; a `<canvas>` → `ImageData` → jsQR loop decodes frames; a manual-paste fallback degrades the flow without a camera; MediaStream tracks are stopped on unmount/close.
- **Custody boundary stays auditable by keeping paths in separate modules — transitively.** Watch-only build+broadcast (`lib/wallet/airgapped/broadcast.ts` + `build.ts`) holds NO key. Because `send.ts` transitively imports the embedded signer (`embedded/session` + `embedded/derive`), the shared tx-encoding (`buildCall` + `EvmSendRequest`) is factored into a NEW signer-free `lib/wallet/services/call.ts` (viem-only); `build.ts` imports from `call.ts` (never `send.ts`), and `send.ts` re-exports `call.ts` for backward compat — so the watch-only module graph pulls in ZERO signer code. The offline signer (`lib/wallet/airgapped/sign.ts`) signs but NEVER imports the broadcast path. All new wallet code imports `"client-only"`.

## Tech Stack (unchanged except one new bundled dep)

- Next.js 15 App Router + TypeScript · viem 2.54.1 · wagmi v2 (2.19.5) · `@scure/bip39` · `@scure/bip32` · IndexedDB via `idb` · `qrcode` 1.5.4 (QR generation, present) · **NEW: `jsqr` (pure-JS QR decode, no WASM/worker — CSP-trivial)** · Vitest (unit + integration) · Playwright (e2e) · Foundry (contracts, untouched this wave).

## Global Constraints (NON-NEGOTIABLE — copy into working memory)

1. **NON-CUSTODIAL is absolute.** Watch-only holds NO private key — only a public address; it can never sign, only build unsigned + broadcast a scanned signed tx. Hardware/external keys stay on the device (wagmi / WalletConnect). Air-gapped keys stay on the offline signer (the embedded vault). The unsigned-tx QR carries ONLY `{chainId, tx params}` — never a key; the signed QR carries a PUBLIC raw tx (safe to broadcast). `test/no-secret-to-fetch.test.ts` MUST stay green and be EXTENDED (D3) to cover the watch-only build+broadcast and the offline-sign path: no seed / mnemonic / private-key hex in any fetch body OR any generated QR payload.
2. **The offline signer NEVER broadcasts; the watch-only device NEVER holds a key.** Keep the two halves in separate modules so the boundary is a grep — AND the grep must be TRANSITIVE-safe. `lib/wallet/airgapped/sign.ts` (signs, no `sendRawTransaction`, no fetch of tx broadcast) vs `lib/wallet/airgapped/{build,broadcast}.ts` (build + broadcast, no signer / no seed import). **The watch-only build path must NOT import `send.ts`, because `send.ts` transitively imports the embedded signer** (`send.ts` imports `requireSeed`/`withEvmSigner` from `@/lib/wallet/embedded/session` + `solanaKeypair` from `@/lib/wallet/embedded/derive`) — so a literal grep of `build.ts` alone would pass while the module graph still pulls the whole signer into the watch-only bundle. Therefore `buildCall` + `EvmSendRequest` live in a NEW signer-free module `lib/wallet/services/call.ts` (viem-only) and `build.ts` imports ONLY from `call.ts`; `send.ts` re-exports them for backward compat. A new static guard test (`boundary.test.ts`) asserts: `build.ts`/`broadcast.ts` import no `session`/`derive`/seed symbol AND do NOT import `send.ts` (nor any module that imports `embedded/session`); `sign.ts` imports no broadcast/fetch path.
3. **All new wallet code is client-only.** Every new file under `lib/wallet/**` and `components/wallet/**` imports `"client-only"` (lib) / `"use client"` (component). `test/no-server-wallet-import.test.ts` stays green (no server `route`/`layout`/`page`/`actions`/`middleware` file imports `lib/wallet`).
4. **IMPORT safety.** `validateMnemonic` runs BEFORE any derivation; a wrong/invalid phrase → a clear error and NO vault written. The import passphrase encrypts the vault exactly like create (Argon2id / AES-256-GCM, `encryptEntropy`). Importing when a "primary" vault already exists is an explicit, CONFIRMED overwrite (the UI double-confirms and the caller passes `overwrite: true`) — never a silent clobber. Entropy is `.fill(0)`-zeroized after encryption.
5. **CAMERA UX.** `getUserMedia` is called only on an explicit user action (tap "Scan"). Permission-denied + no-camera are handled with an inline error AND a manual-paste fallback (paste the signed-tx hex) so the flow degrades without a camera. The MediaStream tracks are `.stop()`-ed on unmount and on close (no dangling camera). aria/labels on the scanner + fallback; `axe` stays 0 critical/serious.
6. **WATCH-ONLY honesty.** The wallet is labelled WATCH-ONLY (read-only) throughout with a prominent badge. SEND builds an unsigned request and shows the QR-sign flow — there is NO false "signed"/"sent" state until a signed raw tx is actually scanned + broadcast + receipt-confirmed. Address validation uses `getAddress` (checksum) at setup; a bad address is rejected with a clear error.
7. **AIR-GAPPED PAYLOAD is a SELF-CONTAINED versioned CryptRepublic format — NOT BC-UR/Keystone interop.** Unsigned envelope `{v:1, t:"cr-eth-tx-unsigned", chainId, tx:{to, value, data, nonce, gas, maxFeePerGas, maxPriorityFeePerGas}}` (bigints as decimal strings). Signed payload = the `0x…` serialized raw tx hex, optionally enveloped `{v:1, t:"cr-eth-tx-signed", raw}`. Single-QR for typical native / ERC-20 sends. **QR capacity must match the actual EC level used.** `encodeUnsignedToQr` pins `errorCorrectionLevel: "L"` in its `toDataURL` options so the byte-mode cap is the version-40 EC-L capacity `QR_BYTE_LIMIT = 2953` (empirically verified against the repo's `qrcode` 1.5.4: EC-L 2953, EC-M 2331, EC-Q 1663, EC-H 1273). The guard is checked BEFORE `toDataURL` using EXACT UTF-8 bytes (`new TextEncoder().encode(s).length`): if it EXCEEDS `QR_BYTE_LIMIT`, throw a clear guard ("transaction too large for one QR — needs multi-part (BC-UR), a documented follow-up") rather than silently truncating OR falling into `qrcode`'s own low-level "amount of data is too big" throw. (NOTE: `receive.ts` calls `toDataURL` with NO `errorCorrectionLevel` → defaults to EC-M cap 2331; the air-gapped path must NOT copy that default — it explicitly pins `"L"` so the 2953 constant is honest.) BC-UR interop with Keystone / Passport = explicit future work, noted in the plan + docs.
8. **NO REGRESSIONS + the HARD e2e registration budget.** ALL current suites stay green (counts grow, never shrink): ≈692 unit, 15 integration, 29 e2e, 165 forge, plus snapshot + coverage gates. The mode-selector refactor of `WalletApp` / `WalletChainApp` MUST NOT break `e2e/wallet.spec.ts`, `e2e/wallet-screen.spec.ts`, `e2e/wallet-csp.spec.ts` — update them deliberately (they must reach the existing create/unlock states THROUGH the new mode chooser). The new e2e keeps the registration budget HARD `< 10` (currently 9): it is login-bootstrapped like `e2e/admin-panel.spec` (direct-prisma seed + `POST /api/auth/login`), and adds ZERO `/api/auth/register` calls.
9. **CSP / self-contained.** No CDN, no external script; the scanner lib is bundled (`jsqr`, no WASM / no worker → ZERO CSP change needed). QR render stays `data:` URL (`qrcode.toDataURL`) or inline SVG. `connect-src` is unchanged. `img-src 'self' data:` already covers QR `<img>`. `worker-src 'self' blob:` + `wasm-unsafe-eval` remain (unused by jsQR; the `@zxing/browser` alternative would fit them if ever chosen). No `Permissions-Policy` header exists, so camera is NOT policy-blocked (`getUserMedia` just prompts). `e2e/wallet-csp.spec.ts` stays green and is extended to the new views.
10. **No new RPC methods.** `eth_sendRawTransaction` + all the read methods the build/broadcast path needs (`eth_getBalance`, `eth_call`, `eth_getTransactionCount`, `eth_estimateGas`, `eth_feeHistory`, `eth_maxPriorityFeePerGas`, `eth_getBlockByNumber`) are already allowlisted (`lib/rpc/allowlist.ts`). `eth_sendTransaction` / `personal_sign` / `eth_sign` / `eth_accounts` remain REJECTED. Do NOT add methods.
11. **Watch-only + air-gapped MVP is EVM ONLY** (native + ERC-20 sends). Solana / BTC watch-only + air-gapped signing is a documented follow-up (record in docs + a `// TODO(follow-up):` in `mode.ts`).
12. **Process.** Per-task commits with the trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. TDD RED-first. Local anvil only; the air-gapped integration proof signs with a THROWAWAY anvil key (anvil key #0) in `test/integration` only — the app never signs and never touches a real network. Docs updates (ARCHITECTURE §12 wallet-modes, spec §5.x, README) land in D3. `pnpm format:check` green on every new file (Prettier covers `.md`).

## Verified ground truth (re-verify before editing — signatures as of Wave 10 close-out)

### Embedded vault (`lib/wallet/embedded/`)
- `mnemonic.ts` — `generateMnemonic(strength=256)`, `validateMnemonic(phrase): boolean`, `mnemonicToEntropy(phrase): Uint8Array`, `entropyToMnemonic(entropy): string`, `mnemonicToSeed(phrase, passphrase?): Promise<Uint8Array>`. All via `@scure/bip39` English wordlist.
- `session.ts` — `createWallet(passphrase, label="Primary"): Promise<CreateResult>` (`{mnemonic, accounts}`); `unlock`, `lock`, `isUnlocked`, `getAccounts`, `loadPublicAccounts`, `revealMnemonic`, `withEvmSigner(fn)`, `requireSeed`, `startAutoLock`. `deriveAllAccounts(seed)` → `{evm, solana, bitcoin}`. Module-scoped `unlockedSeed` / `cachedAccounts`. **NO `importWallet` — A1 adds it.** `createWallet` body (the exact mirror for import): `const entropy = mnemonicToEntropy(mnemonic); const seed = await mnemonicToSeed(mnemonic); const accounts = deriveAllAccounts(seed); const blob = await encryptEntropy(entropy, passphrase, accounts, label); await saveVault(blob); entropy.fill(0); unlockedSeed = seed; cachedAccounts = accounts;`.
- `vault.ts` — `class WalletUnlockError`, `interface VaultBlob` (`{ v, ciphertext, iv, kdf, kdfParams, addresses, label, … }`), `encryptEntropy(entropy, passphrase, addresses, label): Promise<VaultBlob>`, `decryptEntropy(blob, passphrase): Promise<Uint8Array>` (throws `WalletUnlockError` on bad pass). Argon2id (hash-wasm) with PBKDF2 fallback.
- `storage.ts` — IndexedDB `DB_NAME="cryptrepublic"`, `DB_VERSION=1`, `STORE="vaults"`, `DEFAULT_ID="primary"`. `saveVault(blob, id?)`, `loadVault(id?)`, `hasVault(id?): Promise<boolean>`, `deleteVault(id?)`. Single `openDB` with an `upgrade` that creates the `vaults` store if absent. **`mode.ts` (A2) bumps `DB_VERSION` to 2 and adds a `meta` store in the SAME upgrade.**
- `derive.ts` — `EVM_PATH="m/44'/60'/0'/0/0"`, `deriveEvm(seed)`, `deriveSolana`, `deriveBitcoin(seed, network)`, `evmSigner(seed): Account`, `evmPrivateKeyHex(seed): 0x…`, `solanaKeypair`. HD via `@scure/bip32`. **KNOWN VECTOR:** the all-zero 24-word phrase `"abandon abandon … abandon art"` derives a KNOWN EVM address — reuse it in A1 import tests exactly as `test/no-secret-to-fetch.test.ts` does (`deriveEvm(await mnemonicToSeed(M)).address`).

### Send / sign / broadcast (`lib/wallet/services/`)
- `send.ts` — `interface EvmSendRequest { chainId, to:0x…, amount:bigint, token?:0x… }`; `interface SendPreview { to, amount, token, chainId, feeEstimate }`; `buildCall(req): { to, value, data? }` (native `{to, value}`; ERC-20 `{to: token, value: 0n, data: encodeFunctionData(erc20.transfer,[to,amount])}`); `previewEvmSend(req, from): Promise<SendPreview>`; `sendEvm(req): Promise<0x…>` = `withEvmSigner(account => { const [nonce, fees] = await Promise.all([client.getTransactionCount({address, blockTag:"pending"}), client.estimateFeesPerGas()]); const gas = await client.estimateGas({...}); const serializedTransaction = await account.signTransaction({chainId, nonce, to, value, data, gas, maxFeePerGas, maxPriorityFeePerGas, type:"eip1559"}); return client.sendRawTransaction({serializedTransaction}); })`; `sendSolana`, `BTC_SEND_ENABLED=false`, `sendBitcoin(): never`. **NO `sendEvmExternal` — B1 adds it.** `publicClientFor(chainId)` from `./evmClients`. **TRANSITIVE-IMPORT TRAP (verified — send.ts:5-6):** `send.ts` imports `requireSeed`, `withEvmSigner` from `@/lib/wallet/embedded/session` AND `solanaKeypair` from `@/lib/wallet/embedded/derive` — so ANY module importing `send.ts` pulls the entire embedded signer into its bundle. The watch-only build path therefore MUST NOT import `send.ts`; C2 moves `buildCall` + `EvmSendRequest` into a signer-free `./call.ts` and re-exports them from `send.ts`.
- `send.ts` — `buildCall` puts the SEMANTICS in different places for ERC-20 vs native: **native** → `{to: recipient, value: amount}`; **ERC-20** → `{to: TOKEN CONTRACT, value: 0n, data: encodeFunctionData(erc20.transfer, [recipient, amount])}`. So for an ERC-20 send the unsigned envelope's `tx.to` is the token contract and `tx.value` is `0n`; the REAL recipient + amount live inside `tx.data`. Any honest human-readable review of an unsigned envelope MUST `decodeFunctionData({abi: erc20Abi, data: tx.data})` to recover `[recipient, amount]` — displaying the raw `tx.to`/`tx.value` would show the token contract as "recipient" and amount `0` (C5 decode requirement).
- `sendView.ts` — `interface SendConfirmVM`, `sendableTokens(chainId)`, `toSendConfirmVM(preview): SendConfirmVM` (the human-facing confirm VM; the watch-only + offline-sign UIs reuse this for the human-readable summary).
- `portfolio.ts` / `history.ts` / `chainStats.ts` — `loadPortfolio(chainId, addr): Promise<Portfolio>`, `evmHistory(chainId, addr): Promise<TxRow[]>`, `readChainStats(chainId): Promise<ChainStats>`. **These take a plain address arg** → watch-only reuses them keyed by the watched address with ZERO change.

### External (`lib/wallet/external/`)
- `wagmi.ts` — `makeWagmiConfig(): Config` = `createConfig({ chains: profile.evm.viemChain, connectors: [injected(), ...(projectId ? [walletConnect({projectId})] : [])], transports: /api/rpc/<chainId> })`. NO Coinbase (CSP), NO Ledger connector.
- `siwe.ts` — SIWE verify/build (external auth; unchanged this wave).
- External SIGN pattern (FROZEN): `simulate → walletClient.writeContract(request)` — `lib/passport/mint.ts` `submitMintExternal` (:184), `lib/governance/write.ts` `*External`, `lib/dividends/write.ts` `*External`. `walletClient.account` may be null → throw "External wallet has no account.".

### Providers + pages
- `components/providers/{AppProviders,WagmiProvider,QueryProvider}.tsx` — mounted only where wallet UI needs wagmi. `app/wallet/page.tsx` → `<AppProviders><main><WalletApp/></main></AppProviders>`. `app/dashboard/wallet/page.tsx` → `<AppProviders><WalletChainApp/></AppProviders>` (inherits the dashboard session guard).
- `components/wallet/WalletApp.tsx` — `/wallet` exerciser. States `loading|create|locked|unlocked`; `MIN_PASSPHRASE=12`; create form (`getByLabel(/Choose a vault passphrase/i)`) → mnemonic shown once (`data-testid="mnemonic"`, `backedUp` checkbox → `confirmBackedUp`) → unlocked; reveal (`data-testid="revealed-mnemonic"`); addresses + receive QR (`data-testid="receive-qr"`); `HONEST_WARNING`.
- `components/wallet/WalletChainApp.tsx` — `/dashboard/wallet` island. States `loading|create|locked|unlocked`; `create` view links to `/wallet` ("Create wallet"); loads portfolio/stats/stake/passport/history keyed on `evmAddress`; `onAction` SEND/RECEIVE/SWAP/BRIDGE/STAKE; `modal` state; `requireUnlock` gate; `SendModal`, `ReceiveModal`, `SwapBridgeModal`, `UnlockWalletModal`.

### RPC allowlist (`lib/rpc/allowlist.ts`, `"server-only"`)
- `ALLOWED_EVM_METHODS` includes `eth_call`, `eth_getBalance`, `eth_maxPriorityFeePerGas`, `eth_feeHistory`, `eth_estimateGas`, `eth_getTransactionCount`, `eth_getTransactionReceipt`, `eth_getTransactionByHash`, `eth_sendRawTransaction`, `eth_getBlockByNumber`, … . `eth_sendTransaction` / `personal_sign` / `eth_sign` / `eth_accounts` ABSENT (rejected). `isAllowedEvmMethod(method)`. **No edits this wave.**

### CSP (`middleware.ts`)
- Prod `script-src 'self' 'nonce-…' 'wasm-unsafe-eval'`; `img-src 'self' data:`; `worker-src 'self' blob:`; `connect-src 'self' + walletconnect .com/.org (https+wss)`; `style-src 'self' 'unsafe-inline'`; `object-src 'none'`; `frame-ancestors 'none'`. NO `media-src` directive and NO `Permissions-Policy` → `getUserMedia` is allowed (prompts). jsQR needs NO CSP change.

### Guards + tests + budget
- `test/no-secret-to-fetch.test.ts` (`@vitest-environment node`, `fake-indexeddb/auto`) — fetch-spy over create→unlock→sendEvm→reveal with the fixed all-zero vault; asserts no `M` / entropy hex / priv-key hex in any captured body; asserts `eth_sendRawTransaction` WAS sent (raw tx allowed). **D3 extends it** to the watch-only build+broadcast + offline-sign paths (also scan QR payload strings).
- `test/no-server-wallet-import.test.ts` (static grep) — no server file imports `lib/wallet`; `WALLET_IMPORT_RE`. Stays green.
- `scripts/guard-no-secret-columns.sh` (`pnpm guard:secrets`) — DB-column secret guard (unaffected; run in D3 gate).
- Registration ledger (HARD `< 10`, currently 9): auth 1 + mint 2 + wallet-screen 2 + dashboard-screens 3 + critical-path 1. `e2e/admin-panel.spec` is the login-bootstrap template (direct `new PrismaClient` with absolute `file:` URL + precomputed Argon2id hash + `POST /api/auth/login`; NO `/api/auth/register`). D2 mirrors it → 0 new registrations.
- Integration harness `test/integration/anvil-harness.ts` — `foundryAvailable()` skip guard; `startAnvilWithContracts(seedCitizens)` → `AnvilDeployment` with `admin: { address, privateKey }` (anvil key #0, LOCAL/THROWAWAY), `fundCryptAndRewards` treasury-genesis draw; `afterAll` does `git checkout -- config/contracts.ts`. `test/integration/wallet-e2e.test.ts` is the direct-anvil template (`// @vitest-environment node`, env set BEFORE app imports, in-process `/api/rpc/31337` dispatch, rpcMethods capture asserting `eth_sendTransaction`/`personal_sign`/`eth_sign`/`eth_accounts` NEVER used).

## File Structure (new/edited)

```
lib/wallet/
  embedded/
    session.ts                       # EDIT (A1) — add importWallet(passphrase, mnemonic, label?)
    session.import.test.ts           # NEW (A1) — import vectors + invalid + overwrite guard
  mode.ts                            # NEW (A2) — WalletMode type + persist mode + watch-only addr (IndexedDB "meta")
  mode.test.ts                       # NEW (A2)
  services/
    call.ts                          # NEW (C2) — signer-free buildCall + EvmSendRequest (viem-only); NO embedded/session import
    call.test.ts                     # NEW (C2) — buildCall native/ERC-20 shape
    send.ts                          # EDIT (B1, C2) — add sendEvmExternal(walletClient, req); re-export buildCall/EvmSendRequest from ./call
    send.external.test.ts            # NEW (B1)
  airgapped/
    codec.ts                         # NEW (C2) — envelope encode/decode + versioned types + capacity guard + ERC-20 decode
    build.ts                         # NEW (C2) — buildUnsignedTx(req, from) (NO seed/signer import)
    broadcast.ts                     # NEW (C2) — broadcastSignedRaw(chainId, raw) (NO seed/signer import)
    sign.ts                          # NEW (C5) — signUnsignedEnvelope(env) via embedded signer (NO broadcast/fetch)
    codec.test.ts                    # NEW (C2) — round-trip + too-large guard
    build.test.ts                    # NEW (C2)
    broadcast.test.ts                # NEW (C2)
    sign.test.ts                     # NEW (C5)
    boundary.test.ts                 # NEW (C2/C5) — static custody-boundary grep (Constraint #2)
components/wallet/
  WalletModeSelect.tsx               # NEW (A2) — mode chooser entry card
  WalletModeSelect.test.tsx          # NEW (A2)
  ImportWalletForm.tsx               # NEW (A2) — paste mnemonic + passphrase + overwrite confirm
  ImportWalletForm.test.tsx          # NEW (A2)
  ExternalWalletPanel.tsx            # NEW (B2) — connect + address + balances + external send
  ExternalWalletPanel.test.tsx      # NEW (B2)
  WatchOnlySetup.tsx                 # NEW (C1) — validate + persist a watched address
  WatchOnlySetup.test.tsx           # NEW (C1)
  WatchOnlyBadge.tsx                 # NEW (C1) — the read-only badge (shared)
  QrScanner.tsx                      # NEW (C3) — getUserMedia + jsQR loop + manual-paste fallback
  QrScanner.test.tsx                # NEW (C3)
  AirgappedSendModal.tsx             # NEW (C4) — build unsigned -> QR -> scan signed -> broadcast -> receipt
  AirgappedSendModal.test.tsx       # NEW (C4)
  OfflineSignModal.tsx               # NEW (C5) — scan unsigned -> decode -> sign -> QR (embedded, no broadcast)
  OfflineSignModal.test.tsx         # NEW (C5)
  WalletApp.tsx                      # EDIT (A2, B2, C1, C5) — mode chooser wraps the exerciser + import/offline-sign
  WalletChainApp.tsx                 # EDIT (A2, B2, C1, C4) — mode chooser wraps the screen + external/watch-only
test/
  no-secret-to-fetch.test.ts         # EDIT (D3) — extend to watch-only build+broadcast + offline-sign (+ QR scan)
  integration/
    airgapped-e2e.test.ts            # NEW (D1) — watch-only build -> anvil-key sign -> broadcast; import vector
e2e/
  wallet-modes.spec.ts               # NEW (D2) — login-bootstrapped; mode selector + import + watch-only + camera fallback
  wallet.spec.ts                     # EDIT (A2) — reach create THROUGH the mode chooser
  wallet-screen.spec.ts              # EDIT (A2) — reach the screen states THROUGH the mode chooser
  wallet-csp.spec.ts                 # EDIT (A2/C3) — assert 0 CSP violations on the new views (incl. scanner)
docs/
  ARCHITECTURE.md                    # EDIT (D3) — §12 Wallet modes (embedded/external/watch-only + air-gapped)
  superpowers/specs/2026-07-01-cryptrepublic-network-state-design.md  # EDIT (D3) — §5.x wallet-modes subsection
  README.md                          # EDIT (D3) — wave table + wallet-modes note
  CHANGELOG.md                       # EDIT (D3) — v0.11.0
package.json                         # EDIT (C3) — add "jsqr" dependency
```

---

## GROUP A — IMPORT + MODE SCAFFOLD

## Task A1 — `importWallet` in `session.ts` (import an existing BIP-39 mnemonic)

**Files:**
- EDIT `lib/wallet/embedded/session.ts`
- NEW `lib/wallet/embedded/session.import.test.ts`

**READ FIRST:** `lib/wallet/embedded/session.ts` (WHOLE — `createWallet` :42–53 is the exact template; the module-scoped `unlockedSeed`/`cachedAccounts` contract; `deriveAllAccounts` :34), `lib/wallet/embedded/mnemonic.ts` (`validateMnemonic`, `mnemonicToEntropy`, `mnemonicToSeed`, `entropyToMnemonic`), `lib/wallet/embedded/vault.ts` (`encryptEntropy` signature + `WalletUnlockError`), `lib/wallet/embedded/storage.ts` (`saveVault`, `hasVault`, `deleteVault`, `DEFAULT_ID`), `lib/wallet/embedded/derive.ts` (`deriveEvm` — the KNOWN-VECTOR address source), `test/no-secret-to-fetch.test.ts` (:31–54 — the fixed all-zero vault vector `M` + `seedFixedVault` pattern to mirror), `lib/wallet/embedded/session.test.ts` (existing test shape).

**Exact interface (append to `session.ts`, mirroring `createWallet` EXACTLY):**
```ts
export interface ImportResult {
  accounts: WalletAccounts; // NO mnemonic returned — the user already has it
}

/**
 * Import an existing BIP-39 vault. Validates the phrase BEFORE any derivation
 * (invalid -> throw, no vault written), then mirrors createWallet: entropy ->
 * seed -> deriveAllAccounts -> encryptEntropy -> saveVault -> unlockedSeed.
 * Overwrite is the CALLER's responsibility: pass overwrite=true only after an
 * explicit, confirmed OVERWRITE; otherwise importing over a "primary" vault throws.
 */
export async function importWallet(
  passphrase: string,
  mnemonic: string,
  label = "Primary",
  overwrite = false,
): Promise<ImportResult> {
  const phrase = mnemonic.trim().replace(/\s+/g, " ").toLowerCase();
  if (!validateMnemonic(phrase)) {
    throw new Error("Invalid recovery phrase. Check the words and try again.");
  }
  if (!overwrite && (await hasVault())) {
    throw new Error("A wallet already exists. Confirm overwrite to import a new one.");
  }
  const entropy = mnemonicToEntropy(phrase);
  const seed = await mnemonicToSeed(phrase);
  const accounts = deriveAllAccounts(seed);
  const blob = await encryptEntropy(entropy, passphrase, accounts, label);
  await saveVault(blob);
  entropy.fill(0);
  unlockedSeed = seed;
  cachedAccounts = accounts;
  return { accounts };
}
```
- Add `validateMnemonic` to the `./mnemonic` import; add `hasVault` to the `./storage` import (currently only `saveVault, loadVault`). Normalize the phrase (trim + collapse whitespace + lowercase) BEFORE validate so pasted phrases with stray spacing validate correctly (English BIP-39 is lowercase).

**TDD steps:**
1. [ ] RED — `session.import.test.ts` (`@vitest-environment node`, `import "fake-indexeddb/auto"`, `beforeEach: lock(); await deleteVault()`):
   - **valid phrase imports + derives the SAME address as the known vector:** import the all-zero `M`; assert `result.accounts.evm === deriveEvm(await mnemonicToSeed(M)).address` (and solana/bitcoin match); assert `isUnlocked() === true`; assert `revealMnemonic(PASS)` round-trips to `M`.
   - **invalid phrase throws + writes NO vault:** `await expect(importWallet(PASS, "not a real phrase")).rejects.toThrow(/invalid/i)`; assert `await hasVault() === false`.
   - **whitespace/case tolerance:** import `M.toUpperCase()` with extra spaces → same addresses (normalization works).
   - **overwrite guard:** `createWallet(PASS)` first → `await expect(importWallet(PASS, M)).rejects.toThrow(/already exists/i)`; then `importWallet(PASS, M, "Primary", true)` succeeds and the new addresses match the imported vector (the old vault is replaced, not merged).
   - Run: `pnpm test session.import` — RED.
2. [ ] GREEN — implement `importWallet`. Run: `pnpm test session.import` — green. Then `pnpm test:run lib/wallet` (or `pnpm test wallet`) — the whole wallet unit suite stays green.
3. [ ] `pnpm typecheck && pnpm lint` — green. Commit `feat(wallet): importWallet — import a BIP-39 vault (validate-first, overwrite-guarded)`.

**Verify:** `pnpm test session.import && pnpm typecheck`.

---

## Task A2 — Wallet MODE selector + persistence + IMPORT form (both entry points)

**Files:**
- NEW `lib/wallet/mode.ts`, `lib/wallet/mode.test.ts`
- NEW `components/wallet/WalletModeSelect.tsx` (+ `.test.tsx`), `components/wallet/ImportWalletForm.tsx` (+ `.test.tsx`)
- EDIT `components/wallet/WalletApp.tsx`, `components/wallet/WalletChainApp.tsx`
- EDIT `e2e/wallet.spec.ts`, `e2e/wallet-screen.spec.ts`, `e2e/wallet-csp.spec.ts`

**READ FIRST:** `lib/wallet/embedded/storage.ts` (WHOLE — the `openDB`/`upgrade`/`DB_VERSION` pattern the `meta` store extends; DB_VERSION bump semantics), `components/wallet/WalletApp.tsx` (WHOLE — the `View` state machine + create form + mnemonic-once dialog; the mode chooser wraps this), `components/wallet/WalletChainApp.tsx` (WHOLE — the `create` view + island load flow), `components/wallet/ImportWalletForm`-adjacent styling in `WalletApp.tsx` (reuse the input/label/button styles verbatim), `lib/wallet/embedded/session.ts` (`importWallet` from A1; `createWallet`; `hasVault`), `e2e/wallet.spec.ts` + `e2e/wallet-screen.spec.ts` + `e2e/wallet-csp.spec.ts` (WHOLE — the exact selectors that must still resolve AFTER the chooser is inserted).

**Design decisions (state in the plan):**
- **Persisted mode store.** Bump `storage.ts` `DB_VERSION` 1→2; in the same `upgrade` add a `meta` store (`keyPath: "id"`). `mode.ts` reads/writes a single `meta` record `{ id: "wallet", mode: WalletMode, watchAddress?: 0x… }`. Do NOT create a second IDB database (one `openDB` per app; a second DB fragments the upgrade path).
- **Default mode = `embedded`.** No persisted record → `embedded` (backwards-compatible: an existing user with a vault lands straight in embedded).
- **Chooser placement.** The mode chooser is the FIRST screen ONLY when there is no persisted mode AND (for embedded) no vault yet — i.e. it never blocks an existing embedded user. Persisting a mode is sticky; a "Change mode" affordance returns to the chooser. On `/wallet` (`WalletApp`) the chooser gates: embedded (create/import), offline-sign (C5), and a link to the dashboard for external/watch-only. On `/dashboard/wallet` (`WalletChainApp`) the chooser gates: embedded (the existing screen), hardware/external (B2), watch-only (C1).

**Exact interface (`lib/wallet/mode.ts`):**
```ts
import "client-only";
export type WalletMode = "embedded" | "hardware" | "watchonly";
export interface WalletModeMeta { mode: WalletMode; watchAddress?: `0x${string}` }
export async function getWalletMode(): Promise<WalletModeMeta>;      // default { mode: "embedded" }
export async function setWalletMode(meta: WalletModeMeta): Promise<void>;
export async function clearWalletMode(): Promise<void>;             // back to chooser
```

**`WalletModeSelect.tsx`** — three cards (Embedded / Hardware or external / Watch-only), each with an honest one-line description, `data-testid="mode-embedded" | "mode-hardware" | "mode-watchonly"`, keyboard-focusable buttons, `onSelect(mode)`.

**`ImportWalletForm.tsx`** (`"use client"`) — a `<textarea>` for the mnemonic (`getByLabel(/recovery phrase/i)`), a passphrase input (min 12, reuse `MIN_PASSPHRASE`), inline validation error, an OVERWRITE confirm block shown only when `hasVault()` is true (a checkbox "I understand this replaces my existing wallet" gating the submit), and on submit calls `importWallet(pass, phrase, "Primary", overwriteConfirmed)`. Never logs / renders the phrase back; clears the textarea on success. `data-testid="import-submit"`, `role="alert"` for errors.

**TDD steps:**
1. [ ] RED — `mode.test.ts` (`@vitest-environment node`, `fake-indexeddb/auto`): default is `{mode:"embedded"}`; `setWalletMode({mode:"watchonly", watchAddress})` then `getWalletMode()` round-trips; `clearWalletMode()` returns to default; setting mode does NOT disturb an existing vault (`saveVault` a blob, set mode, assert `hasVault()` still true). Run `pnpm test wallet/mode` — RED.
2. [ ] RED — `WalletModeSelect.test.tsx` (Vitest + Testing Library): renders three mode cards; clicking each fires `onSelect` with the right mode; the cards are buttons (a11y). `ImportWalletForm.test.tsx`: invalid phrase → inline error + `importWallet` NOT called-to-success (mock `importWallet` to throw); valid phrase (all-zero vector) → `importWallet` called with the normalized phrase; when `hasVault()` is true the overwrite checkbox gates submit. Run — RED.
3. [ ] GREEN — `mode.ts` (+ storage `DB_VERSION` bump + `meta` store), `WalletModeSelect`, `ImportWalletForm`. Wire the chooser into `WalletApp` (embedded branch = the existing create/import; import via the new form) and `WalletChainApp` (embedded branch = the existing screen). Run steps 1–2 — green.
4. [ ] EDIT the three e2e specs so they reach the pre-existing states THROUGH the chooser: `wallet.spec.ts` clicks `mode-embedded` before the create form; `wallet-screen.spec.ts` selects embedded before asserting the screen states; `wallet-csp.spec.ts` asserts 0 CSP violations after selecting embedded (scanner-view CSP is added in C3). Keep every existing assertion. **These specs add ZERO registrations.**
5. [ ] `pnpm typecheck && pnpm lint && pnpm test wallet` — green. Commit `feat(wallet): mode selector (embedded|hardware|watchonly) + persisted mode + import form`.

**Verify:** `pnpm test wallet && pnpm typecheck && pnpm e2e wallet.spec wallet-screen.spec wallet-csp.spec`.

---

## GROUP B — HARDWARE / EXTERNAL

## Task B1 — `sendEvmExternal(walletClient, req)` in `send.ts`

**Files:**
- EDIT `lib/wallet/services/send.ts`
- NEW `lib/wallet/services/send.external.test.ts`

**READ FIRST:** `lib/wallet/services/send.ts` (WHOLE — `EvmSendRequest`, `buildCall`, `previewEvmSend`, `sendEvm`; reuse `buildCall` + `publicClientFor`), `lib/passport/mint.ts` :182–215 (`submitMintExternal` — the FROZEN `simulate → walletClient.writeContract` external pattern; `walletClient.account` null-check), `lib/governance/write.ts` (`*External` shape), viem `WalletClient.sendTransaction` / `writeContract` types, `lib/wallet/services/send.test.ts` (mock-client test shape).

**Exact interface (append to `send.ts`):**
```ts
import type { WalletClient } from "viem";

/**
 * EXTERNAL wallet (wagmi/hardware) plain SEND. The wallet's OWN signer signs and
 * broadcasts — this app never sees the key. Native -> walletClient.sendTransaction;
 * ERC-20 -> writeContract(erc20.transfer) (the wallet encodes + broadcasts).
 * Returns the tx hash. A user rejection / wrong chain propagates as a thrown error.
 */
export async function sendEvmExternal(
  walletClient: WalletClient,
  req: EvmSendRequest,
): Promise<`0x${string}`> {
  const account = walletClient.account;
  if (!account) throw new Error("External wallet has no account.");
  if (req.token) {
    return walletClient.writeContract({
      account,
      chain: null,
      address: req.token,
      abi: erc20Abi,
      functionName: "transfer",
      args: [req.to, req.amount],
    });
  }
  return walletClient.sendTransaction({ account, chain: null, to: req.to, value: req.amount });
}
```
- `chain: null` lets wagmi use the connected chain (the correct-chain check lives in B2's UI before this is called). Do NOT re-simulate for a plain native send (there is nothing to simulate); for ERC-20 the wallet's `writeContract` will estimate. (If a reviewer prefers a pre-flight `estimateGas`, add it read-only via `publicClientFor` — but the wallet is the source of truth for its own send.)

**TDD steps:**
1. [ ] RED — `send.external.test.ts`: a mock `walletClient` with spy `sendTransaction`/`writeContract`. Native send → `sendTransaction` called with `{to, value}`, returns the stub hash. ERC-20 send → `writeContract` called with `erc20.transfer` args `[to, amount]` at `req.token`. Null account → throws "External wallet has no account.". Run `pnpm test send.external` — RED.
2. [ ] GREEN — implement. Run — green. `pnpm test send` (whole send suite) stays green.
3. [ ] `pnpm typecheck && pnpm lint`. Commit `feat(wallet): sendEvmExternal — plain native/ERC-20 send via the external wallet's own signer`.

**Verify:** `pnpm test send.external && pnpm typecheck`.

---

## Task B2 — HARDWARE / EXTERNAL panel in the dashboard wallet

**Files:**
- NEW `components/wallet/ExternalWalletPanel.tsx` (+ `.test.tsx`)
- EDIT `components/wallet/WalletChainApp.tsx` (mount the panel in the `hardware` mode branch)

**READ FIRST:** `lib/wallet/external/wagmi.ts` (connectors: `injected()` + `walletConnect()`), `components/providers/{AppProviders,WagmiProvider}.tsx` (already mounted around both wallet pages — wagmi hooks are available), wagmi v2 hooks (`useAccount`, `useConnect`, `useDisconnect`, `useChainId`, `useSwitchChain`, `useWalletClient`), `lib/wallet/services/portfolio.ts` (`loadPortfolio(chainId, addr)` — reuse for external balances), `lib/wallet/services/send.ts` (`previewEvmSend` + B1 `sendEvmExternal`), `components/wallet/SendModal.tsx` (the send-form UX to mirror for the external send), `lib/config/chain.ts` (`activeChain().primaryChainId` — the expected chain), `e2e/wallet-csp.spec.ts` (the mock EIP-1193 `window.ethereum` injection pattern for tests).

**Behavior:**
- **Connect view:** buttons for each connector (`injected()` labelled by the detected wallet; `walletConnect()` only when `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` set). No connector / none detected → an honest inline "No wallet connector detected — install a browser wallet or use WalletConnect" state (never a crash). A user rejection of the connect prompt → an inline "Connection cancelled" state, retryable.
- **Connected view:** show `useAccount().address` (checksummed), a WalletConnect/injected label, and live balances via `loadPortfolio(chainId, address)` (reuse the existing reads — graceful empty on failure). A **correct-chain check**: if `useChainId() !== activeChain().primaryChainId`, show "Wrong network — switch to <chain>" with a `useSwitchChain` button; block send until on the right chain.
- **External SEND:** a `<TxButton>`-style flow (mirror `SendModal`) that reads `useWalletClient()`, builds `EvmSendRequest`, shows `previewEvmSend` fee, and on confirm calls `sendEvmExternal(walletClient, req)`. Honest states: pending → hash → receipt (reuse `waitForTransactionReceipt` via `publicClientFor`), and a "rejected by wallet" state on throw. No false success.
- **Disconnect** via `useDisconnect`.

**TDD steps:**
1. [ ] RED — `ExternalWalletPanel.test.tsx` (Vitest + Testing Library with a mocked wagmi module: mock `useAccount`/`useConnect`/`useChainId`/`useSwitchChain`/`useWalletClient`, and a fetch/portfolio mock): disconnected → shows connect buttons; connected + right chain → shows the checksummed address + balances; connected + WRONG chain → shows the switch prompt and the send is blocked; connect-rejected → inline retryable error; send happy path → calls `sendEvmExternal` and renders the pending→hash states; send rejected → error state. Run `pnpm test ExternalWalletPanel` — RED.
2. [ ] GREEN — implement `ExternalWalletPanel`; mount it in `WalletChainApp`'s `hardware` branch. Run — green.
3. [ ] `pnpm typecheck && pnpm lint && pnpm test wallet` — green. Commit `feat(wallet): hardware/external panel — wagmi connect + live balances + external send + chain guard`.

**Verify:** `pnpm test ExternalWalletPanel && pnpm typecheck`.

---

## GROUP C — WATCH-ONLY + AIR-GAPPED (the core)

## Task C1 — Watch-only store + setup + read-only screen + badge

**Files:**
- NEW `components/wallet/WatchOnlySetup.tsx` (+ `.test.tsx`), `components/wallet/WatchOnlyBadge.tsx`
- EDIT `components/wallet/WalletChainApp.tsx` (the `watchonly` mode branch: setup → read-only screen keyed by the watched address)
- (Watched address persistence lives in `lib/wallet/mode.ts` `watchAddress` — A2.)

**READ FIRST:** `lib/wallet/mode.ts` (A2 — `getWalletMode`/`setWalletMode` with `watchAddress`), `components/wallet/WalletChainApp.tsx` (WHOLE — the `loadAll` read pipeline keyed on `evmAddress`; reuse it verbatim keyed by the watched address), `lib/wallet/services/{portfolio,history,chainStats}.ts` (all take a plain address arg → zero change), viem `getAddress` (checksum validation), `components/wallet/PortfolioHeader.tsx` (the hero; the SEND action here opens the AIR-GAPPED send, not `SendModal`).

**Behavior:**
- **Setup:** an input for an EVM address; validate with `getAddress` (throws → inline "Not a valid EVM address"); on success `setWalletMode({mode:"watchonly", watchAddress})` and render the read-only screen. A "Change address" affordance re-opens setup.
- **Read-only screen:** the SAME portfolio / history / chain-stats layout as embedded, keyed by `watchAddress` (reuse `loadAll`). NO unlock, NO stake writes, NO receive-to-sign. A prominent `<WatchOnlyBadge/>` ("WATCH-ONLY — read-only; this device holds no keys") near the hero. The SEND action opens `AirgappedSendModal` (C4), NOT the embedded `SendModal`.
- `WatchOnlyBadge.tsx` — a small shared, styled, `role="status"` badge (reused by the setup + screen + air-gapped modal header).

**TDD steps:**
1. [ ] RED — `WatchOnlySetup.test.tsx`: invalid address → inline error, `setWalletMode` NOT called; valid checksummed address → `setWalletMode({mode:"watchonly", watchAddress})` called; lowercased valid address is accepted + normalized via `getAddress`. `WatchOnlyBadge` renders the WATCH-ONLY label with `role="status"`. Run `pnpm test WatchOnly` — RED.
2. [ ] GREEN — implement setup + badge; wire the `watchonly` branch in `WalletChainApp` (setup when no `watchAddress`, else the read-only screen keyed by it, SEND → C4 modal placeholder until C4 lands — sequence C4 or stub the button disabled with a "coming in this wave" note removed by C4). Run — green.
3. [ ] `pnpm typecheck && pnpm lint && pnpm test wallet`. Commit `feat(wallet): watch-only mode — validated watched address + read-only portfolio + WATCH-ONLY badge`.

**Verify:** `pnpm test WatchOnly && pnpm typecheck`.

---

## Task C2 — Air-gapped codec + build (unsigned) + broadcast (signed)

**Files:**
- NEW `lib/wallet/airgapped/codec.ts`, `lib/wallet/airgapped/build.ts`, `lib/wallet/airgapped/broadcast.ts`
- NEW `lib/wallet/airgapped/codec.test.ts`, `build.test.ts`, `broadcast.test.ts`, `boundary.test.ts`

**READ FIRST:** `lib/wallet/services/send.ts` (WHOLE — `EvmSendRequest`, `buildCall`, and the EXACT unsigned-tx object `sendEvm` assembles: `{chainId, nonce, to, value, data, gas, maxFeePerGas, maxPriorityFeePerGas, type:"eip1559"}` — `build.ts` MUST produce this identical shape; and `client.sendRawTransaction({serializedTransaction})` — `broadcast.ts` MUST reuse this; **NOTE the transitive signer imports at send.ts:5-6 that forbid `build.ts` from importing `send.ts`**), `lib/wallet/services/sendView.ts` (`sendableTokens` — token metadata source for the ERC-20 decode display), `lib/wallet/services/evmClients.ts` (`publicClientFor`), viem `serializeTransaction` / `parseTransaction` / `decodeFunctionData` / `erc20Abi`, viem `keccak256`/`isHex`, `lib/wallet/receive.ts` (the `QRCode.toDataURL` pattern — note it uses NO `errorCorrectionLevel` → defaults to EC-M cap 2331; the air-gapped path pins `"L"` instead), `test/no-secret-to-fetch.test.ts` (the fetch-spy the D3 extension will run over these).

**Exact interfaces:**
```ts
// codec.ts (client-only) — the self-contained versioned envelope (Constraint #7)
export interface UnsignedTxParams {
  to: `0x${string}`; value: bigint; data?: `0x${string}`;
  nonce: number; gas: bigint; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint;
}
export interface UnsignedEnvelope { v: 1; t: "cr-eth-tx-unsigned"; chainId: number; tx: UnsignedTxParams; }
export interface SignedEnvelope { v: 1; t: "cr-eth-tx-signed"; raw: `0x${string}`; }

/** Encode an unsigned envelope to a compact JSON string (bigints -> decimal strings). */
export function encodeUnsigned(env: UnsignedEnvelope): string;
export function decodeUnsigned(s: string): UnsignedEnvelope;   // throws on wrong v/t/shape
export function encodeSigned(env: SignedEnvelope): string;
/** Accept either a bare 0x raw tx OR a {v,t,raw} envelope; return the 0x raw. */
export function decodeSigned(s: string): `0x${string}`;        // throws on non-hex / bad envelope

/**
 * HONEST human-readable summary of an unsigned envelope (Constraint #11: native + ERC-20).
 * For a NATIVE tx (empty/`0x` `tx.data`): recipient = tx.to, amount = tx.value, token = "native".
 * For an ERC-20 tx (non-empty transfer calldata): `decodeFunctionData({abi: erc20Abi, data: tx.data})`
 * to recover [recipient, amount]; token = tx.to (the CONTRACT); resolve symbol/decimals via
 * `sendableTokens(chainId)`. NEVER surface the raw tx.to/tx.value for ERC-20 (that would show the
 * token contract as "recipient" and amount 0). tokenContract is surfaced too so the signer sees it.
 */
export interface DecodedEnvelope {
  recipient: `0x${string}`; amount: bigint;
  tokenContract?: `0x${string}`;   // present for ERC-20; absent for native
  isErc20: boolean;
}
export function decodeEnvelopeForDisplay(env: UnsignedEnvelope): DecodedEnvelope;

// version-40 byte-mode capacity of the repo's `qrcode` 1.5.4, empirically verified:
//   EC-L 2953 · EC-M 2331 · EC-Q 1663 · EC-H 1273. `encodeUnsignedToQr` PINS EC level "L",
// so this 2953 constant is the honest cap (do NOT default to EC-M like receive.ts, whose cap is 2331).
export const QR_BYTE_LIMIT = 2953;
/**
 * Encode + render an unsigned envelope to a QR data URL. Checks EXACT UTF-8 byte length
 * (`new TextEncoder().encode(s).length`) BEFORE calling toDataURL: past QR_BYTE_LIMIT it THROWS
 * a clear `/too large for one QR/i` guard — it never falls into qrcode's own low-level throw.
 * MUST call `QRCode.toDataURL(s, { margin: 1, errorCorrectionLevel: "L" })` so the cap is really 2953.
 */
export async function encodeUnsignedToQr(env: UnsignedEnvelope): Promise<string>;
```
```ts
// build.ts (client-only) — NO seed / signer / session import; MUST NOT import "@/lib/wallet/services/send"
// (send.ts transitively pulls embedded/session + embedded/derive — Constraint #2). Import from ./call ONLY.
import { buildCall, type EvmSendRequest } from "@/lib/wallet/services/call";
/** Build the SAME unsigned EIP-1559 params sendEvm would sign, for a WATCHED `from`. */
export async function buildUnsignedTx(req: EvmSendRequest, from: `0x${string}`): Promise<UnsignedEnvelope>;
// = publicClientFor(req.chainId); const call = buildCall(req);  // buildCall imported from the signer-free ./call
//   const [nonce, fees] = Promise.all([getTransactionCount({address: from, blockTag:"pending"}), estimateFeesPerGas()]);
//   const gas = estimateGas({account: from, to: call.to, value: call.value, data: call.data});
//   return { v:1, t:"cr-eth-tx-unsigned", chainId: req.chainId, tx:{ to: call.to, value: call.value, data: call.data, nonce, gas, ...fees } };
```
```ts
// broadcast.ts (client-only) — NO seed / signer / session import (Constraint #2)
/** Broadcast a scanned signed raw tx via the SAME proxy call sendEvm uses; returns the hash. */
export async function broadcastSignedRaw(chainId: number, rawOrEnvelope: string): Promise<`0x${string}`>;
// = const raw = decodeSigned(rawOrEnvelope); return publicClientFor(chainId).sendRawTransaction({ serializedTransaction: raw });
```
- To keep `buildUnsignedTx` producing the byte-identical shape, factor `buildCall` into a NEW signer-free module `lib/wallet/services/call.ts` (imports ONLY viem `encodeFunctionData`/`erc20Abi`; declares `EvmSendRequest`; NO `embedded/session`/`embedded/derive` import) so `send.ts` and `build.ts` share it. `send.ts` re-exports `buildCall` + `EvmSendRequest` from `./call` for backward compat (existing importers of `@/lib/wallet/services/send` are unchanged). `build.ts` imports `buildCall`/`EvmSendRequest` ONLY from `./call` — NEVER from `send.ts`. **Do NOT export `buildCall` from `send.ts` for `build.ts` to consume** — that would route the watch-only bundle through `send.ts`'s transitive signer imports (send.ts:5-6) and silently defeat the custody boundary. Record the `call.ts` choice in the commit body.
- **`call.ts` NEW file (add a `call.test.ts`):** `buildCall` native → `{to: recipient, value: amount}`; ERC-20 → `{to: token, value: 0n, data: encodeFunctionData(erc20.transfer, [recipient, amount])}`. Its first line is `import "client-only"`; it imports NO `embedded/*`. Verify `send.ts` still compiles + its tests stay green after the move (re-export line `export { buildCall, type EvmSendRequest } from "./call";`).

**TDD steps:**
1. [ ] RED — `codec.test.ts`:
   - **round-trip:** build an `UnsignedEnvelope` → `encodeUnsigned` → `decodeUnsigned` deep-equals (bigints preserved). `encodeSigned`/`decodeSigned` round-trip; `decodeSigned` accepts a bare `0x…` raw too; `decodeSigned` throws on non-hex and on a wrong-`t` envelope; `decodeUnsigned` throws on `v!==1` / wrong `t`.
   - **serialize-sign-parse round-trip (the load-bearing one):** from an `UnsignedEnvelope`, `serializeTransaction` the params, sign with a TEST key (`privateKeyToAccount(anvil #0)` or a fixed test priv key), `parseTransaction` the signed raw, and assert `to`/`value`/`nonce`/`chainId` match the envelope — proving the envelope carries exactly what a signer needs.
   - **ERC-20 decode-for-display (the honesty test):** build an ERC-20 envelope via `buildCall({chainId, to: recipient, amount, token})` — so `tx.to` is the TOKEN CONTRACT, `tx.value` is `0n`, and `tx.data` is the transfer calldata — then assert `decodeEnvelopeForDisplay(env)` returns `{recipient, amount, tokenContract: token, isErc20: true}` (recipient decoded from calldata, NOT the raw `tx.to`; amount NOT `0`). A native envelope → `{recipient: tx.to, amount: tx.value, isErc20: false, tokenContract: undefined}`.
   - **too-large guard (EC-L cap 2953):** an envelope whose encoded UTF-8 byte length lands in the 2954+ range (oversized `data`) → `encodeUnsignedToQr` rejects with `/too large for one QR/i` (does NOT truncate, does NOT surface qrcode's own low-level throw). Also add a fixture at exactly the boundary — a payload of 2954 bytes hits the guard, a payload of 2953 bytes renders — proving the guard uses the EC-L cap the code actually pins, not the EC-M default (2331). The fixture MUST assert `encodeUnsignedToQr` calls `toDataURL` with `errorCorrectionLevel: "L"` (spy or inspect) so the 2953 constant stays honest.
2. [ ] RED — `build.test.ts` (mock `publicClientFor` returning canned `getTransactionCount`/`estimateFeesPerGas`/`estimateGas`): `buildUnsignedTx({chainId, to, amount}, from)` returns an envelope whose `tx` equals the shape `sendEvm` would sign (native `{to, value}`; ERC-20 `{to: token, value: 0n, data: transfer(...)}`); `t`/`v`/`chainId` correct. `broadcast.test.ts` (mock `sendRawTransaction`): `broadcastSignedRaw(chainId, signedEnvelope)` decodes + calls `sendRawTransaction({serializedTransaction: raw})` and returns the hash; a bare `0x` raw also broadcasts.
3. [ ] RED — `boundary.test.ts` (static grep, mirroring `no-server-wallet-import.test.ts`): `build.ts` + `broadcast.ts` source contains NONE of `requireSeed|withEvmSigner|evmSigner|unlockedSeed|signTransaction|mnemonicToSeed|from "@/lib/wallet/embedded`; **AND `build.ts`/`broadcast.ts` source does NOT import `send.ts` — assert NO `from "@/lib/wallet/services/send"` (nor a relative `./send`) — because `send.ts` transitively imports `embedded/session`; this is the TRANSITIVE guard a per-file signer-symbol grep alone would miss.** As a defense-in-depth check, also assert `call.ts` itself contains no `from "@/lib/wallet/embedded"` (it is the signer-free shared module). `sign.ts` (C5) contains NONE of `sendRawTransaction|/api/rpc|broadcastSignedRaw` (C5 fills sign.ts; assert the build+broadcast half now, add the sign half in C5). Run all four — RED.
4. [ ] GREEN — implement `call.ts` (+ `call.test.ts`), `codec.ts` (incl. `decodeEnvelopeForDisplay` + EC-L-pinned `encodeUnsignedToQr`), `build.ts`, `broadcast.ts`; make `send.ts` re-export `buildCall`/`EvmSendRequest` from `./call`. Run steps 1–3 — green (boundary sign.ts assertion deferred/xfail until C5, or split boundary.test.ts so build/broadcast asserts land here).
5. [ ] `pnpm typecheck && pnpm lint && pnpm test airgapped && pnpm test send` — green (send suite unaffected by the `call.ts` extraction + re-export). Commit `feat(wallet): air-gapped codec (incl. ERC-20 decode) + signer-free call.ts + build(unsigned) + broadcast(signed) — self-contained versioned QR envelope`.

**Verify:** `pnpm test airgapped && pnpm test send && pnpm typecheck`.

---

## Task C3 — Camera QR scanner component (jsQR + getUserMedia + manual-paste fallback)

**Files:**
- EDIT `package.json` (add `"jsqr"`)
- NEW `components/wallet/QrScanner.tsx` (+ `.test.tsx`)
- EDIT `e2e/wallet-csp.spec.ts` (0 CSP violations with the scanner view rendered)

**READ FIRST:** `middleware.ts` (WHOLE — confirm NO `Permissions-Policy`, NO `media-src`; jsQR needs no CSP change; `img-src data:` covers the QR image), `components/wallet/ReceiveModal.tsx` (existing QR-image render pattern to mirror), the `jsqr` API (`jsQR(imageData.data, width, height): { data: string } | null`), Testing Library + Vitest jsdom `getUserMedia` mocking (`Object.defineProperty(navigator, "mediaDevices", …)`).

**Behavior (Constraint #5):**
- Renders a "Scan" button; `getUserMedia({ video: { facingMode: "environment" } })` is called ONLY on tap. On success, attach the stream to a hidden `<video>`, draw frames to a `<canvas>`, read `ImageData`, run `jsQR` in a `requestAnimationFrame` loop; on a decode, call `onResult(text)` and stop the stream.
- **Permission-denied / no-camera:** catch `NotAllowedError`/`NotFoundError`/absent `mediaDevices` → inline error + reveal a manual-paste `<textarea>` fallback (`onResult` fires on paste-and-submit). The fallback is ALSO available up-front via a "paste instead" link (degrades with no camera at all).
- **Cleanup:** on unmount and on close, `stream.getTracks().forEach(t => t.stop())` and cancel the RAF (no dangling camera).
- a11y: labelled button, `role="alert"` for the error, labelled textarea. Props: `{ label: string; onResult: (text: string) => void; onCancel?: () => void }`.

**TDD steps:**
1. [ ] RED — `QrScanner.test.tsx`: getUserMedia mocked to RESOLVE + a stubbed `jsQR` returning `{data:"envelope"}` → `onResult("envelope")` fires and the tracks' `stop()` spy is called on unmount. getUserMedia mocked to REJECT `NotAllowedError` → inline error + the manual-paste textarea appears; pasting + submit fires `onResult`. `mediaDevices` absent → the paste fallback is available without ever calling getUserMedia. Run `pnpm test QrScanner` — RED.
2. [ ] GREEN — `pnpm add jsqr`; implement `QrScanner`. Run — green.
3. [ ] EDIT `e2e/wallet-csp.spec.ts` — add a case that renders a view containing the scanner (e.g. the watch-only air-gapped send or the offline-sign entry, once C4/C5 land — or render `QrScanner` behind an already-reachable button) and asserts 0 CSP violations. (Camera itself is not exercised in e2e — the manual-paste fallback path is; the CSP assertion covers the bundled jsQR having no external fetch.)
4. [ ] `pnpm typecheck && pnpm lint && pnpm test QrScanner`. Commit `feat(wallet): QrScanner — bundled jsQR camera scan + permission-denied/no-camera manual-paste fallback + track cleanup`.

**Verify:** `pnpm test QrScanner && pnpm typecheck`.

---

## Task C4 — Watch-only AIR-GAPPED SEND flow UI

**Files:**
- NEW `components/wallet/AirgappedSendModal.tsx` (+ `.test.tsx`)
- EDIT `components/wallet/WalletChainApp.tsx` (watch-only SEND action opens this modal; remove the C1 stub)

**READ FIRST:** `lib/wallet/airgapped/{codec,build,broadcast}.ts` (C2), `components/wallet/QrScanner.tsx` (C3), `lib/wallet/services/sendView.ts` (`toSendConfirmVM` / `sendableTokens` — the human-readable summary), `components/wallet/SendModal.tsx` (the amount/token/recipient form to mirror), `components/wallet/WatchOnlyBadge.tsx` (C1), viem `waitForTransactionReceipt` via `publicClientFor`.

**Behavior (Constraint #6 honesty — a strict state machine):**
1. **Compose** — recipient + amount + token picker (reuse `sendableTokens`); build `EvmSendRequest` for the watched address.
2. **Show unsigned QR** — `buildUnsignedTx(req, watchAddress)` → `encodeUnsignedToQr(env)` → render the QR + a human-readable summary (`toSendConfirmVM`) + a "too large for one QR (needs BC-UR — follow-up)" guard state when the codec throws. Copyable text fallback of the envelope (for a paste-based offline signer).
3. **Scan signed** — a `QrScanner` (or paste) for the SIGNED raw tx; `decodeSigned` validates it's hex/enveloped (reject garbage with a clear error — NO false "signed" state).
4. **Broadcast** — `broadcastSignedRaw(chainId, signed)` → hash; then `waitForTransactionReceipt` → `success`/`reverted`. Only on a confirmed receipt does the UI say "sent". A revert or a broadcast error surfaces honestly (retry-scan possible).
- The modal header carries the WATCH-ONLY badge. No step lies about state; the "sent" affordance is gated on the receipt.

**TDD steps:**
1. [ ] RED — `AirgappedSendModal.test.tsx` (mock `buildUnsignedTx`/`encodeUnsignedToQr`/`broadcastSignedRaw`/receipt): compose → shows the unsigned QR + human summary; too-large → shows the BC-UR follow-up guard (no QR); scanning a valid signed env → broadcasts + shows the receipt-confirmed "sent" state with the hash; scanning garbage → error, NO "sent"; a broadcast throw → error state, retryable. Run `pnpm test AirgappedSendModal` — RED.
2. [ ] GREEN — implement the modal state machine; wire it into `WalletChainApp` watch-only SEND. Run — green.
3. [ ] `pnpm typecheck && pnpm lint && pnpm test wallet`. Commit `feat(wallet): watch-only air-gapped send — unsigned QR -> scan signed -> broadcast -> receipt (honest states)`.

**Verify:** `pnpm test AirgappedSendModal && pnpm typecheck`.

---

## Task C5 — Embedded OFFLINE SIGNER mode (scan a request to sign)

**Files:**
- NEW `lib/wallet/airgapped/sign.ts` (+ `sign.test.ts`); complete `boundary.test.ts` sign.ts assertion (C2)
- NEW `components/wallet/OfflineSignModal.tsx` (+ `.test.tsx`)
- EDIT `components/wallet/WalletApp.tsx` (an unlocked embedded wallet exposes "Scan a request to sign")

**READ FIRST:** `lib/wallet/embedded/session.ts` (`withEvmSigner` / `isUnlocked` — the ONLY signing seam; `account.signTransaction`), `lib/wallet/airgapped/codec.ts` (`decodeUnsigned`, `encodeSigned`, AND `decodeEnvelopeForDisplay` — the ERC-20-aware honest summary), `lib/wallet/services/send.ts` (`sendEvm` :99–112 — the EXACT `account.signTransaction({...type:"eip1559"})` call to mirror; note it does NOT broadcast here), `lib/wallet/services/sendView.ts` (`sendableTokens` — token symbol/decimals for the decoded ERC-20 display; note `toSendConfirmVM` consumes a semantic `SendPreview` the offline device does NOT have, so it CANNOT drive the display directly from a raw envelope — use `decodeEnvelopeForDisplay` first), viem `decodeFunctionData`/`erc20Abi`/`formatUnits`, `components/wallet/QrScanner.tsx` (C3), `components/wallet/UnlockWalletModal.tsx` (the offline signer must be unlocked first).

**Exact interface (`sign.ts`, client-only — NO broadcast / NO fetch / NO `/api/rpc`):**
```ts
import "client-only";
import { withEvmSigner } from "@/lib/wallet/embedded/session";
import { type UnsignedEnvelope, type SignedEnvelope } from "./codec";
/**
 * OFFLINE SIGN: sign a scanned unsigned envelope with the UNLOCKED embedded key
 * and return the SIGNED envelope. NEVER broadcasts — no network call whatsoever.
 * Unlock-gated (withEvmSigner throws when locked).
 */
export async function signUnsignedEnvelope(env: UnsignedEnvelope): Promise<SignedEnvelope> {
  return withEvmSigner(async (account) => {
    if (!account.signTransaction) throw new Error("Signer cannot sign transactions.");
    const raw = await account.signTransaction({
      chainId: env.chainId, nonce: env.tx.nonce, to: env.tx.to, value: env.tx.value,
      data: env.tx.data, gas: env.tx.gas, maxFeePerGas: env.tx.maxFeePerGas,
      maxPriorityFeePerGas: env.tx.maxPriorityFeePerGas, type: "eip1559",
    });
    return { v: 1, t: "cr-eth-tx-signed", raw };
  });
}
```

**`OfflineSignModal.tsx`** — for an UNLOCKED embedded wallet: `QrScanner` (or paste) an unsigned envelope → `decodeUnsigned` → **run `decodeEnvelopeForDisplay(env)` to recover the TRUE recipient + amount (+ token) honestly** → show the DECODED human-readable tx: recipient / amount / token / chain / fee. **CRITICAL ERC-20 HONESTY (Constraint #11, the whole point of air-gapped review):** the offline device has ONLY the envelope, whose `tx.to` for an ERC-20 send is the TOKEN CONTRACT and `tx.value` is `0n`, with the real recipient + amount inside `tx.data`. The modal MUST NOT display raw `tx.to`/`tx.value` for an ERC-20 tx — it MUST `decodeFunctionData({abi: erc20Abi, data: tx.data})` (via `decodeEnvelopeForDisplay`) to show the ACTUAL recipient + amount, resolve the token symbol/decimals from `sendableTokens(chainId)`, and ALSO surface the token-contract address so the signer can verify what it is signing before it signs. A native tx shows recipient = `tx.to`, amount = `tx.value`, token = native. → an explicit "Sign this transaction" confirm → `signUnsignedEnvelope` → `encodeSigned` → render the signed QR (via `qrcode.toDataURL`) + copyable text. NO broadcast affordance anywhere in this modal. Locked → prompt unlock first.

**TDD steps:**
1. [ ] RED — `sign.test.ts` (`@vitest-environment node`, `fake-indexeddb/auto`, seed the fixed all-zero vault + `unlock`): `signUnsignedEnvelope(env)` returns a `SignedEnvelope` whose `raw` `parseTransaction`s back to the envelope's `to`/`value`/`nonce`/`chainId`; when LOCKED it throws (unlock-gated); the module makes NO fetch (spy `global.fetch` → asserts zero calls). Complete `boundary.test.ts`: `sign.ts` contains NONE of `sendRawTransaction|/api/rpc|broadcastSignedRaw|from "./broadcast"`. Run `pnpm test airgapped/sign && pnpm test airgapped/boundary` — RED.
2. [ ] RED — `OfflineSignModal.test.tsx`: scanning/pasting a NATIVE unsigned envelope → shows the decoded human summary (recipient = tx.to, amount = tx.value); **scanning/pasting an ERC-20 unsigned envelope (built via `buildCall` with a `token`, so `tx.to` = token contract, `tx.value` = 0n, recipient+amount in `tx.data`) → the modal shows the DECODED recipient and DECODED amount (assert the displayed recipient is the ERC-20 `[recipient]` arg — NOT the token contract; assert the displayed amount is the transfer amount — NOT `0`; assert the token symbol from `sendableTokens` and the token-contract address are shown)**; confirm → `signUnsignedEnvelope` called → signed QR rendered; NO broadcast button exists (assert absent); locked wallet → unlock prompt. Run — RED.
3. [ ] GREEN — implement `sign.ts` + `OfflineSignModal`; expose "Scan a request to sign" in `WalletApp` (unlocked embedded). Run steps 1–2 — green.
4. [ ] `pnpm typecheck && pnpm lint && pnpm test airgapped && pnpm test wallet`. Commit `feat(wallet): embedded offline signer — scan unsigned QR -> human-readable -> sign (no broadcast) -> signed QR`.

**Verify:** `pnpm test airgapped/sign && pnpm test airgapped/boundary && pnpm typecheck`.

---

## GROUP D — VERIFY + CLOSE-OUT

## Task D1 — Anvil integration proof: watch-only air-gapped END-TO-END (the TEST signs, never the app)

**Files:**
- NEW `test/integration/airgapped-e2e.test.ts`

**READ FIRST:** `test/integration/anvil-harness.ts` (WHOLE — `startAnvilWithContracts`, `AnvilDeployment.admin` = anvil key #0 THROWAWAY, `fundCryptAndRewards`, `foundryAvailable()` skip, the `afterAll` `git checkout -- config/contracts.ts`), `test/integration/wallet-e2e.test.ts` (WHOLE — the structure: `// @vitest-environment node`, env set BEFORE app imports, in-process `/api/rpc/31337` dispatch, the `rpcMethods` capture asserting forbidden methods never used), `lib/wallet/airgapped/{build,broadcast,codec}.ts`, `lib/wallet/embedded/session.ts` (`importWallet` — the import-vector assertion), viem `serializeTransaction`/`privateKeyToAccount`.

**Proof (LOCAL ANVIL ONLY — the throwaway anvil key #0 is the "offline signer" stand-in; the app never signs):**
1. `startAnvilWithContracts([...])`; fund a WATCHED address (a second anvil account) with native + $CRYPT via the harness/treasury draw.
2. Set the app env to local (`CHAIN_ENV=local`, `RPC_ANVIL`), so `publicClientFor(31337)` / `serverRpcUrl(31337)` / the in-process `/api/rpc/31337` proxy resolve the REAL read/broadcast path (capture every RPC method).
3. `buildUnsignedTx({chainId:31337, to: recipient, amount}, watchedAddress)` → `UnsignedEnvelope` (the app builds; holds NO key).
4. **The TEST (offline-signer stand-in) signs:** `serializeTransaction` the envelope params + `privateKeyToAccount(watchedPrivKey).signTransaction(...)` → the signed raw; wrap as a `SignedEnvelope`. (This models the air-gapped device; the app never sees the key.)
5. `broadcastSignedRaw(31337, signedEnvelope)` (the APP path) → hash → `waitForTransactionReceipt` success.
6. **Assert:** the recipient's native (and/or $CRYPT) balance MOVED by `amount`; `rpcMethods` INCLUDES `eth_sendRawTransaction` and NEVER `eth_sendTransaction` / `personal_sign` / `eth_sign` / `eth_accounts`.
7. **Import vector:** `importWallet(PASS, KNOWN_MNEMONIC)` derives the EXPECTED anvil address for that mnemonic (a deterministic vector — e.g. the anvil default mnemonic's account #0 address), proving import derivation matches an external source.

**TDD steps:**
1. [ ] RED — write `airgapped-e2e.test.ts` behind `foundryAvailable()` skip; it fails until C2/A1 land (they do by D1). Run `pnpm test:integration airgapped` — RED (or skipped where foundry absent).
2. [ ] GREEN — the app modules already exist; the test asserts the end-to-end. Run `pnpm test:integration` — green (15 → 16 integration).
3. [ ] `pnpm typecheck`. Commit `test(wallet): anvil integration — watch-only air-gapped build->sign(test key)->broadcast + import vector`.

**Verify:** `pnpm test:integration` (full integration suite green; the new proof asserts the custody + method invariants).

---

## Task D2 — Playwright spec: wallet modes (login-bootstrapped, 0 new registrations)

**Files:**
- NEW `e2e/wallet-modes.spec.ts`

**READ FIRST:** `e2e/admin-panel.spec.ts` (WHOLE — the login-bootstrap template: direct `new PrismaClient` with an ABSOLUTE `file:` datasource URL, a precomputed Argon2id hash, `POST /api/auth/login`, NO `/api/auth/register`; the axe helper to copy), `playwright.config.ts` (prod webServer, shared `prisma/dev.db`), `e2e/wallet-screen.spec.ts` (the `page.route` RPC-stub catalog to reuse for the read-only watch-only screen), `e2e/wallet-csp.spec.ts` (the mock `window.ethereum` injection), `components/wallet/*` (the `data-testid`s: `mode-embedded|mode-hardware|mode-watchonly`, `import-submit`, `import` textarea label, the WATCH-ONLY badge, the unsigned-QR testid).

**Assertions (all with stubbed RPC via `page.route`; login-bootstrapped for the auth-gated dashboard; 0 registrations):**
- **Mode selector renders all three** modes (`mode-embedded`, `mode-hardware`, `mode-watchonly` visible) on `/dashboard/wallet` (after login).
- **Import form validates a BAD phrase:** select embedded → import → paste a bad phrase → inline error, no navigation to "unlocked".
- **Watch-only setup with an address shows the read-only screen:** select watch-only → enter a valid checksummed address → the read-only portfolio renders + the WATCH-ONLY badge is visible + a SEND button.
- **Watch-only SEND produces an unsigned QR:** click SEND → compose → the unsigned-QR (`data-testid`) renders (build stubbed via `page.route`).
- **Camera permission-denied shows the manual-paste fallback:** in the air-gapped send (or offline-sign) scan step, override `navigator.mediaDevices.getUserMedia` to reject (`page.addInitScript`) → the inline error + manual-paste textarea appear; pasting a signed env advances the flow (broadcast stubbed).
- **axe:** 0 critical/serious on the new views.
- Spec header documents the registration ledger: **0 new registrations (login-bootstrapped like admin-panel.spec); total stays 9.**

**TDD steps:**
1. [ ] RED — write the spec (login-bootstrap the user via direct prisma + `POST /api/auth/login`, mirroring admin-panel.spec exactly). Run `pnpm e2e wallet-modes` — RED (until the UI wiring from A2/C1/C4/C5 is present; it is by D2).
2. [ ] GREEN — adjust selectors to the shipped testids; run `pnpm e2e wallet-modes` — green. Confirm the registration count with a full `pnpm e2e` run stays at 9 (grep `/api/auth/register` across specs; the new spec has none).
3. [ ] Commit `test(e2e): wallet-modes spec — selector + import validation + watch-only read-only + unsigned QR + camera fallback (0 new registrations)`.

**Verify:** `pnpm e2e wallet-modes && pnpm e2e` (full e2e green, registrations < 10).

---

## Task D3 — Close-out: extend the secret guard + docs + version + FULL gate + acceptance

**Files:**
- EDIT `test/no-secret-to-fetch.test.ts`
- EDIT `docs/ARCHITECTURE.md`, `docs/superpowers/specs/2026-07-01-cryptrepublic-network-state-design.md`, `README.md`, `CHANGELOG.md`

**READ FIRST:** `test/no-secret-to-fetch.test.ts` (WHOLE — the fetch-spy harness to extend), `lib/wallet/airgapped/*` (the paths the extended guard drives), `docs/ARCHITECTURE.md` (§5 non-custodial write path + §10/§11 — append §12 Wallet modes after §11), the spec §5 Wallet Subsystem (:850, subsections 5.1–5.4 — append §5.x wallet-modes), `README.md` (wave table), `CHANGELOG.md` (Keep-a-Changelog).

**Extend `test/no-secret-to-fetch.test.ts` (Constraint #1):** in the SAME fixed-vault harness, additionally drive (a) the **watch-only build+broadcast**: `buildUnsignedTx` for the fixed vault's EVM address + `broadcastSignedRaw` of a signed env, and (b) the **offline-sign** path: `signUnsignedEnvelope(env)` then broadcast the result — and assert:
- No captured fetch body contains `M` / entropy hex / priv-key hex (as today).
- **Additionally, the generated QR payloads** (`encodeUnsigned`/`encodeUnsignedToQr` string + `encodeSigned` string) contain NONE of `M` / entropy hex / priv-key hex — the unsigned QR carries only tx params; the signed QR carries only a public raw tx.
- `eth_sendRawTransaction` IS present in fetch (broadcast allowed); `eth_sendTransaction`/`personal_sign`/`eth_sign` are NEVER present.

**Docs:**
- `docs/ARCHITECTURE.md` §12 "Wallet modes" — the three modes; the custody boundary (watch-only holds no key; the shared tx-encoding lives in signer-free `services/call.ts` so the watch-only path never transitively imports `send.ts`'s embedded signer; offline signer never broadcasts; separate modules + the TRANSITIVE-safe `boundary.test.ts`); the self-contained versioned QR envelope (NOT BC-UR) + the ERC-20 calldata decode (`decodeFunctionData`) so the offline signer reviews the TRUE recipient+amount + the single-QR capacity guard (EC-L cap 2953, checked before render) + BC-UR/Keystone as documented follow-up; the bundled jsQR scanner + camera UX + no CSP change; EVM-only MVP (Solana/BTC follow-up); the extended secret guard.
- Spec §5.x — a wallet-modes subsection: embedded create/import; hardware/external via wagmi (Ledger WebHID deferred); watch-only + air-gapped signing loop; the non-custodial invariants.
- `README.md` — wave table row (Wave 11 — wallet modes) + a one-line wallet-modes note. `CHANGELOG.md` — v0.11.0 entry.

**TDD steps:**
1. [ ] RED — extend `no-secret-to-fetch.test.ts` with the watch-only + offline-sign drives + the QR-payload scans. Run `pnpm test no-secret-to-fetch` — RED (until the assertions align with the shipped codec).
2. [ ] GREEN — confirm the paths pass the extended guard (they must — they carry no secrets). Run — green.
3. [ ] Docs edits (ARCHITECTURE §12, spec §5.x, README, CHANGELOG). `pnpm format:check` green (Prettier covers `.md`).
4. [ ] **FULL GATE:** `pnpm guard:secrets && pnpm format:check && pnpm typecheck && pnpm lint && pnpm test && pnpm test:integration && pnpm e2e && (cd contracts && forge test) && pnpm build`. All green; e2e registrations < 10; snapshot + coverage gates pass.
5. [ ] Commit `docs+test(wallet): extend no-secret-to-fetch to air-gapped paths + Wave 11 docs + v0.11.0 + full gate`.

**Verify:** the full gate command above, all green.

---

## Final acceptance checklist (verify before claiming Wave 11 complete)

- [ ] **importWallet** validates the phrase BEFORE derivation; a valid known-vector phrase derives the SAME addresses; an invalid phrase throws + writes NO vault; overwriting a "primary" vault requires an explicit `overwrite=true` (never silent) (A1, D1 import vector).
- [ ] **Mode selector** persists `embedded|hardware|watchonly` (+ watch-only address) in IndexedDB `meta`; defaults to `embedded`; never blocks an existing embedded user; the import form is reachable and clears the phrase on success (A2).
- [ ] **Existing wallet specs still pass THROUGH the chooser** — `wallet.spec`, `wallet-screen.spec`, `wallet-csp.spec` green with the mode step inserted (A2).
- [ ] **External send** — `sendEvmExternal` uses the wallet's own signer (native `sendTransaction`, ERC-20 `writeContract`); the panel connects (injected + WalletConnect), shows the connected address + live balances, enforces a correct-chain check, and degrades on no-connector / rejection (B1, B2).
- [ ] **Watch-only** — a checksum-validated watched address drives a read-only portfolio/history reusing the existing services; a prominent WATCH-ONLY badge; no unlock, no write, no false "signed" state (C1).
- [ ] **Air-gapped codec** — round-trips (encode↔decode + serialize→sign(test key)→parse); `decodeEnvelopeForDisplay` recovers the TRUE ERC-20 recipient+amount from calldata (not the token contract / not amount 0); `encodeUnsignedToQr` pins EC level "L" so `QR_BYTE_LIMIT=2953` is the real cap (verified: EC-M default would be 2331); a single QR for typical sends; the too-large payload (>2953 UTF-8 bytes, checked before `toDataURL`) shows the BC-UR follow-up guard, never truncates and never surfaces qrcode's raw throw; `build.ts`/`broadcast.ts` hold NO key and do NOT import `send.ts` (boundary.test — transitive) (C2).
- [ ] **QR scanner** — bundled jsQR + getUserMedia only on tap; permission-denied / no-camera shows an inline error + manual-paste fallback; MediaStream tracks stopped on unmount/close; a11y clean; ZERO CSP change (C3).
- [ ] **Watch-only air-gapped send** — build unsigned → show QR → scan (or paste) signed → broadcast → receipt; honest states throughout; "sent" only after a confirmed receipt (C4).
- [ ] **Embedded offline signer** — an unlocked vault scans an unsigned QR → shows the human-readable tx (ERC-20: decoded TRUE recipient+amount+token via `decodeEnvelopeForDisplay`/`decodeFunctionData`, never the raw token-contract `to`/`0` value; native: `tx.to`/`tx.value`) → signs (`account.signTransaction`) → renders the signed QR; NEVER broadcasts (no broadcast affordance; `sign.ts` imports no broadcast/fetch path) (C5, boundary.test).
- [ ] **NON-CUSTODIAL guard extended + green** — `test/no-secret-to-fetch.test.ts` covers the watch-only build+broadcast + offline-sign paths, scanning both fetch bodies AND QR payloads for the mnemonic/entropy/priv-key (found NOWHERE); `eth_sendRawTransaction` allowed, `eth_sendTransaction`/`personal_sign`/`eth_sign` never used (D3, D1).
- [ ] **Integration proof** — anvil watch-only air-gapped end-to-end: build unsigned → sign with the throwaway anvil key (offline-signer stand-in) → broadcast via the app path → recipient balance moved; `rpcMethods` has `eth_sendRawTransaction` and never the signing/enumeration methods; import derives the expected anvil address (D1).
- [ ] **e2e** — mode selector renders all three; import validates a bad phrase; watch-only setup shows the read-only screen + WATCH-ONLY badge + a SEND producing an unsigned QR; camera permission-denied shows the manual-paste fallback; axe 0 critical/serious; **0 new registrations (total stays 9)** (D2).
- [ ] **No RPC / CSP regressions** — no new allowlist methods; `connect-src` unchanged; scanner fully bundled; `wallet-csp.spec` green on the new views (C3, Constraints #9–10).
- [ ] **All suites green + counts grow** — unit, integration (16), e2e (registrations < 10), forge (165), snapshot + coverage, `build`; per-task commits with the Opus 4.8 trailer; docs (ARCHITECTURE §12, spec §5.x, README, CHANGELOG v0.11.0) updated (D3).

## Notes for the implementer (traps — verified)

1. **`buildCall` must be SHARED — from a signer-free module.** `build.ts` (watch-only unsigned) and `sendEvm` (embedded) must produce the byte-identical tx shape, so `buildCall` + `EvmSendRequest` live in a NEW `lib/wallet/services/call.ts` (viem-only). `send.ts` re-exports them; `build.ts` imports them from `./call` ONLY. Do NOT export `buildCall` from `send.ts` for `build.ts` to consume — `send.ts` transitively imports the embedded signer (send.ts:5-6), so routing `build.ts` through it would pull signing code into the no-key watch-only bundle. Do not fork the encoding (a divergence would make the offline-signed tx not match what the user reviewed).
2. **DB_VERSION bump is one-way** — bumping `storage.ts` to v2 with the added `meta` store must keep the existing `vaults` store intact in the `upgrade` (guard both `if (!contains(...))`). Do NOT open a second IDB database.
3. **The custody boundary is a TRANSITIVE-safe grep** (`boundary.test.ts`) — `build.ts`/`broadcast.ts` must import no seed/signer/session symbol AND must NOT import `send.ts` (which transitively imports `embedded/session`); a per-file signer-symbol grep alone would pass `build.ts` while the module graph still pulls the whole signer in. `sign.ts` must import no broadcast/fetch/`/api/rpc` symbol. Shared tx-encoding lives in the signer-free `lib/wallet/services/call.ts`; keep helpers on the correct side of the line, and never reach across via `send.ts`.
4. **jsQR is pure JS** — no WASM, no worker, so NO CSP change; do NOT reach for `@zxing` (which would need `worker-src blob:` + `wasm-unsafe-eval`, both already present but unnecessary here). The camera prompt works because there is NO `Permissions-Policy` header.
5. **Honesty over convenience in the air-gapped send** — the "sent" state is gated on `waitForTransactionReceipt` success; a scanned-garbage or reverted tx must NOT show success. The too-large payload MUST guard (BC-UR follow-up), never truncate.
6. **The offline signer NEVER broadcasts** — `OfflineSignModal` has NO broadcast button and `sign.ts` has NO network call (asserted by `sign.test.ts`'s fetch-spy AND `boundary.test.ts`). Broadcasting on the offline device would defeat the air gap.
7. **Registration budget** — `wallet-modes.spec` is login-bootstrapped (direct prisma + `POST /api/auth/login`), adds ZERO `/api/auth/register`; re-grep the register count before D3's gate.
8. **Ledger WebHID + Solana/BTC watch-only + BC-UR/Keystone interop are DOCUMENTED DEFERRALS** — record each in ARCHITECTURE §12 + the spec, with a `// TODO(follow-up):` marker in `mode.ts` for the Solana/BTC watch-only case.

---

## Post-review addenda (reviewer MINOR findings — honor during the build)

The adversarial review applied the 1 blocker + 3 major findings above. Nine **minor** findings remain; honor them during implementation:

1. **Secret-scan the JSON payloads, not the PNG:** D3's guard must scan the `encodeUnsigned(env)`/`encodeSigned(env)` STRINGS (the actual QR content) for mnemonic/entropy/privkey; the `data:image/png;base64` URL is only shape-checked (`startsWith("data:image/")`) — pixel-level scanning is theater and the test comment says so.
2. **feeEstimate for the confirm summaries:** `toSendConfirmVM` requires `SendPreview.feeEstimate` — C4/C5 build it as `(tx.gas * tx.maxFeePerGas).toString()` from the SAME unsigned-tx numbers, so the displayed fee matches what was encoded.
3. **Capacity-guard the SIGNED QR too:** the too-large guard must wrap BOTH `encodeUnsignedToQr` AND the offline signer's signed-tx QR render (same EC-L byte check) — a large signed raw tx must guard honestly, never truncate.
4. **`import "client-only"` first line:** every new lib/wallet module (call.ts, build.ts, broadcast.ts, codec.ts, sign.ts, mode.ts) starts with `import "client-only"` as the FIRST non-empty line — test/no-server-wallet-import.test.ts enforces exactly that.
5. **D1 offline-signer stand-in:** sign with `privateKeyToAccount(pk).signTransaction({...})` ALONE (it returns the serialized signed raw tx); do NOT also call `serializeTransaction` — the plan's two-step description conflates mutually exclusive approaches.
6. **wagmi ground-truth correction:** `makeWagmiConfig` maps `profile.evm.map((e) => e.viemChain)` (an array) — there is no `profile.evm.viemChain`.
7. **D2 budget check counts UI registrations:** grep for REGISTER-tab submissions across e2e specs (the register() helpers), not for the literal `/api/auth/register` string.
8. **`pnpm test wallet`** (vitest positional filter) — there is no `test:run` script.
9. **True same-address import vector:** add a case where the existing vault's addresses ALREADY equal the imported mnemonic's derived addresses (import M over a vault seeded from M) and assert the overwrite guard/confirm flow still behaves correctly and derives identical addresses — not just the different-address overwrite case.
