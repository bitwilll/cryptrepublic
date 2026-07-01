# CryptRepublic Wave 3 — Multi-Chain Wallet — Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL — before touching code, load `superpowers:test-driven-development` and `superpowers:executing-plans`. Every task below is TDD: write the failing test, run it and SEE it fail, implement the real code, run it and SEE it pass, then commit. No step may be skipped or reordered. Never write implementation before its test. Never invent library APIs — where a task uses `@scure/bip39`, `@scure/bip32`, `@scure/btc-signer`, `ed25519-hd-key`, `@solana/web3.js`, `hash-wasm`, `viem`, `wagmi`, `idb`, `siwe`, or `qrcode`, FIRST verify the exact installed API surface (`node -e`, `pnpm why`, `ls node_modules/<pkg>/`, or reading the package's `.d.ts`) before writing code against it. Match the exact signatures in each task's **Interfaces** block.

**Goal.** Deliver Wave 3 of spec §9: (a) an embedded non-custodial BIP-39 HD wallet — key material CLIENT-ONLY, generated in the browser, encrypted at rest with Argon2id + AES-256-GCM, stored in IndexedDB, never sent to the server; (b) external wallet connect via wagmi v2 + viem, authenticated through the Wave 2 SIWE flow; (c) a real typed chain-config registry (testnet primary = Base Sepolia; mainnet primary = Base; both with sibling EVM chains + Solana + Bitcoin) that is the single source of truth for chainId / viem chain / explorer / RPC access; (d) multi-chain balance reads (EVM native + ERC-20, Solana SOL + SPL, BTC) and send/receive (EVM EIP-1559 + ERC-20, Solana transfer, BTC receive-only); (e) keyed server-side RPC proxy routes so API keys never reach the browser. A minimal wallet create/unlock/reveal UI island exercises the subsystem. The full Wallet & Chain screen is Wave 6 — match its concepts/labels (native $CRYPT + WETH/WBTC/USDC + passport NFT; SEND/RECEIVE/SWAP/STAKE/BRIDGE) but DO NOT build the full screen this wave.

**Architecture.** Two isolated halves. The **server** owns keyed RPC/indexer access only: allow-listed proxy route handlers (`app/api/rpc/[chain]`, `app/api/rpc/solana`, `app/api/history/[chain]`, `app/api/btc/*`) read private RPC/indexer keys from non-`NEXT_PUBLIC_` env, validate/allow-list the JSON-RPC method + target chain, and forward. The server NEVER receives, derives, stores, or logs a seed, private key, or plaintext passphrase — enforced by the secret-guard, `import "server-only"` on server modules, and an ESLint boundary rule forbidding any `app/**` route/server file (and any `import "server-only"` module) from importing `lib/wallet/**`. The **client** owns all key material: every module under `lib/wallet/` begins with `import "client-only"`; mnemonic gen, HD derivation, the Argon2id/AES-GCM vault, IndexedDB persistence, and the in-memory `WalletSession` all live there and run only inside `"use client"` components. Unlocked secrets live in a single module-scoped `WalletSession` as `Uint8Array` (never React state / localStorage / URL / logs), auto-lock after 10 min inactivity + on `visibilitychange` hidden + on tab close, and are `.fill(0)`-zeroized on lock. Chain config is centralized in `config/chains.config.ts` + `config/tokens.ts`; nothing hardcodes an RPC URL, chainId, contract, or token address outside those files. CSP + security headers are added in `next.config.ts` (or `middleware.ts`) to host the wallet safely (`wasm-unsafe-eval` only for the Argon2id WASM; `connect-src` pinned to our API + specific RPC/indexer origins; `frame-ancestors 'none'`).

**Tech Stack.** Next.js `15.1.0`, React `19.0.0`, TypeScript `5.6.3` (strict, no `any`), Prisma `^6.19.3` + SQLite (dev)/Postgres (prod), Vitest `2.1.5` (jsdom default; Node per-file via `// @vitest-environment node`), Playwright `^1.61.1`. New runtime deps (add with `pnpm add --save-exact`): `@scure/bip39`, `@scure/bip32`, `@scure/btc-signer`, `ed25519-hd-key`, `@solana/web3.js`, `@solana/spl-token`, `hash-wasm`, `idb`, `qrcode`, `wagmi`, `@tanstack/react-query`; dev: `fake-indexeddb`, `@types/qrcode`. `viem` `2.54.1` and `siwe` `^2.3.2` are already installed — do NOT bump. Package manager pnpm `10.33.0`, Node `>=20`. WebCrypto (`crypto.subtle`, `crypto.getRandomValues`) is global in Node 20 and jsdom — no polyfill needed; IndexedDB is provided by `fake-indexeddb` in tests.

---

## Global Constraints

Copy these verbatim into every reviewer's head. Violating any one fails CI or the security posture. Values are lifted directly from spec §5.1–5.11 and the Wave 3 LOCKED DECISIONS.

- **Non-custodial, always; the server never sees a secret (spec §5, §5.7).** The server never receives, derives, stores, transmits, or logs a seed phrase, mnemonic, private key, derived symmetric key, or plaintext vault passphrase. A total backend/DB compromise must leak zero spendable secrets. The DB stores only PUBLIC addresses (`LinkedWallet.address`) + the Wave 2 Argon2id *login* password hash (separate from the vault — never conflated). `pnpm guard:secrets` (no column matching `privateKey|seedPhrase|mnemonic|plaintextPassword|passwordPlain|secretKey`) must stay green. **`guard:secrets` is SCHEMA-ONLY today** — it greps only `prisma/schema.prisma` and does NOT inspect application code. Wave 3 is the first wave to handle real key material, so Task 4 EXTENDS `scripts/guard-no-secret-columns.sh` to also grep `lib/ app/ components/` for obvious secret sinks (`console.log(...mnemonic|seed|privateKey)`, `localStorage.setItem(...seed|mnemonic|privateKey)`, `sessionStorage.setItem(...)`) and wires it into the guard; the AUTHORITATIVE codebase secret-guard is nonetheless the Task 4 runtime fetch-spy test (a static grep cannot prove secret-safety).
- **CLIENT-ONLY wallet boundary (spec §2.6, §5).** EVERY module under `lib/wallet/` starts with `import "client-only";` and is only imported from `"use client"` components. NO server component, route handler, server action, or any `import "server-only"` module may import `lib/wallet/**`. This is enforced four ways: (1) `import "client-only"` at the top of every wallet module; (2) an ESLint `no-restricted-imports` boundary rule (Task 4) that forbids `lib/wallet` imports from `app/**/route.ts`, `app/**/layout.tsx`, `app/**/page.tsx` server files, server actions (`app/**/actions.ts`), any `import "server-only"` module (incl. `lib/indexer/**`), and `middleware.ts` — and, so the rule can actually fire on `config/`, `next.config.ts` sets `eslint.dirs` to include `config` (Task 8/Step 0); (3) a STATIC grep test (Task 4) that catches OBVIOUS footguns (a `fetch(`/`XHR` in `lib/wallet/services/**` that does not target `/api/*`, or a seed/entropy/privateKey identifier as a network argument) — this is a lint-style smoke check, NOT a proof of secret-safety; (4) the AUTHORITATIVE runtime guard (Task 4) — a positive test that spies on `global.fetch` across a full `createWallet → unlock → sendEvm` flow with a FIXED test vault and asserts NO captured request body (JSON-parsed and scanned) contains the known mnemonic, the entropy hex, or the derived private-key hex. (A signed raw transaction IS sent over the wire and is NOT a secret — the scan targets the mnemonic/entropy/private-key, not the serialized tx.)
- **Mnemonic (spec §5.1).** `@scure/bip39` + English wordlist. Entropy from `crypto.getRandomValues` ONLY — never `Math.random`, timestamps, or user input. Default 256-bit (24 words); accept 128/160/192/224/256. Exports: `generateMnemonic(strength=256)`, `validateMnemonic(phrase)`, `mnemonicToSeed(phrase, passphrase?)`, plus `mnemonicToEntropy` / `entropyToMnemonic` (the vault encrypts ENTROPY). The BIP-39 25th-word passphrase is reserved (not surfaced in v1 UI).
- **HD derivation (spec §5.2).** One account (index 0) per chain from the seed:
  - EVM (ETH/Base/Arbitrum/Optimism/Polygon) — secp256k1, `m/44'/60'/0'/0/0`, via `@scure/bip32` `HDKey.fromMasterSeed` → `viem/accounts` `privateKeyToAccount`. All five EVM chains share one address.
  - Solana — ed25519, `m/44'/501'/0'/0'` (SLIP-0010, ALL-hardened), via `ed25519-hd-key` `derivePath` → `@solana/web3.js` `Keypair.fromSeed(derived.key)`.
  - Bitcoin — native segwit (bech32), `m/84'/0'/0'/0/0`, via `@scure/bip32` + `@scure/btc-signer` (`p2wpkh`). **`deriveBitcoin(seed, network)` is NETWORK-EXPLICIT** — mainnet yields `bc1q…`, testnet yields `tb1q…`; the caller passes `activeChain().bitcoinNetwork` (default env = testnet → `tb1q…`). Tests MUST freeze BOTH a mainnet `bc1q…` vector (asserted with `network="mainnet"`) AND a testnet `tb1q…` vector (asserted with `network="testnet"`) to avoid the mainnet-vector-vs-testnet-default contradiction.
  - Each derive fn returns `{ address, publicKey }` + a short-lived signer handle; NEVER a long-lived raw private key object. Verify against PUBLISHED BIP-39/BIP-32 + SLIP-0010 test vectors (Task 2). **MANDATORY:** the EVM `m/44'/60'/0'/0/0` address for the all-zero "abandon…art" phrase and the Solana SLIP-0010 vector MUST be pinned from a PUBLISHED source (recorded in a code comment), NOT self-generated with the library under test — a self-generated vector only tests that the library equals itself. (Solana addresses are cluster-independent — no per-network variant needed.)
- **Vault — encryption at rest (spec §5.3).** KDF = **Argon2id via `hash-wasm`**: `memorySize:65536` (KiB = 64 MiB), `iterations:3`, `parallelism:1`, `hashLength:32`, `outputType:'binary'`, salt = 16 random bytes. **Fallback:** if WASM cannot load, PBKDF2-SHA512 `600000` iterations via WebCrypto `deriveKey`, recording `kdf:"pbkdf2"`. Cipher = **AES-256-GCM** via WebCrypto; KDF output imported as a NON-extractable `CryptoKey`. **IV = 12 random bytes FRESH on every encryption** (GCM nonce reuse under one key is catastrophic — unit-tested invariant). **AAD** = the serialized vault version + kdf + kdfParams (binds header to ciphertext). **On DECRYPT, reconstruct the AAD from the BLOB's stored `kdf`/`kdfParams`** (which may be `"pbkdf2"` on a fallback vault) — NEVER a hardcoded constant, or a PBKDF2 fallback vault fails its own auth tag. A test MUST force the WASM-unavailable fallback → encrypt (PBKDF2, `kdf:"pbkdf2"`) → decrypt succeeds, exercising the PBKDF2 branch (otherwise never tested). **Encrypt the BIP-39 ENTROPY** (so reveal reproduces the exact phrase). Public addresses stored OUTSIDE the ciphertext.
- **VaultBlob shape (spec §5.3) — persisted JSON in IndexedDB, NEVER sent to server.**
  ```jsonc
  {
    "v": 1, "kdf": "argon2id",
    "kdfParams": { "memorySize": 65536, "iterations": 3, "parallelism": 1, "hashLength": 32 },
    "cipher": "AES-256-GCM",
    "salt": "<base64,16>", "iv": "<base64,12>", "ct": "<base64, ciphertext incl 16-byte GCM tag>",
    "addresses": { "evm": "0x…", "solana": "…", "bitcoin": "bc1q…" },
    "createdAt": "<ISO8601>", "label": "Primary"
  }
  ```
  Storage: `idb`, db `"cryptrepublic"`, object store `"vaults"` (keyPath `"id"`, single active vault id `"primary"` in v1).
- **Lifecycle (spec §5.4).** Create → derive addresses → prompt passphrase (strength meter, min length ≥ 12) → Argon2id-derive key → AES-GCM encrypt entropy → write blob → hold seed in memory. Unlock → read blob → derive key → AES-GCM decrypt with stored IV → recover entropy → derive → hold in memory. **Wrong passphrase fails the GCM auth tag → throw `WalletUnlockError` ("incorrect passphrase") with NO oracle beyond pass/fail; it must NEVER return decrypted plaintext.** Lock → drop in-memory seed + signer handles, `.fill(0)` secret `Uint8Array`s. Unlocked material held ONLY in a single module-scoped `WalletSession` (never React/Redux state, localStorage/sessionStorage, URLs, or logs). Auto-lock: 10 min inactivity (configurable), `visibilitychange` → hidden past a short grace, and tab close (`pagehide`/`beforeunload`). Any signing action while locked forces re-unlock.
- **Honest security limitations (spec §5.4, §5.7, §10.2) — state in plan AND UI.** JavaScript gives NO guaranteed zeroization (immutable strings, GC copies, heap moves) and no defense against XSS-while-unlocked or a compromised device/OS. We minimize secret lifetime + surface area, but do NOT claim memory-forensic resistance or protection against arbitrary JS running while the wallet is unlocked. The reveal/create UI must carry: "CryptRepublic can never recover this phrase or reset your vault passphrase; anyone who sees it can take everything; we will never ask for it." (The Wave 2 web-login passphrase IS email-recoverable and is separate — never conflate the two in code or copy.)
- **Backup / reveal (spec §5.5).** Seed shown ONCE at creation. Reveal later ONLY via a fresh passphrase decrypt behind a non-dismissible full-screen warning; blur-until-tap; copy with ~30s clipboard auto-clear (best-effort); require confirmation of offline backup. No server-side recovery of any kind.
- **External connect (spec §5.8).** wagmi v2 + viem + `@tanstack/react-query`. Connectors: `injected()`, `walletConnect({ projectId: NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID })`, `coinbaseWallet()`. Chains = the active `evm` set (Base/Base Sepolia primary). SIWE reuses the Wave 2 server flow verbatim: client GETs `/api/auth/siwe/nonce`, builds + `personal_sign`s a `SiweMessage` bound to `NEXT_PUBLIC_APP_URL` host+origin, POSTs to `/api/auth/siwe/verify`. **CRITICAL chainId mismatch:** the Wave 2 SIWE server (`lib/auth/siwe.ts`) allow-lists ONLY the PRIMARY chainId (`ALLOWED_CHAIN_IDS = [84532|8453]`), but wagmi is configured with all 5 EVM chains — so if the user's wallet is on ETH/Arb/OP/Polygon, a SIWE message built with the connected chainId will be REJECTED. The client MUST force the SIWE `chainId` to `activeChain().primaryChainId` (or `useSwitchChain` to the primary chain before signing). Do NOT modify the Wave 2 SIWE server. The client uses `prepareMessage()` and EIP-191 `personal_sign` — exactly what `siwe.verify` expects.
- **Chain-config registry (spec §2.4, §5.9).** Single source of truth. GROW `lib/config/chain.ts` (keep the existing `CHAIN_ENV`/`isMainnet` exports) and ADD `config/chains.config.ts` (typed `CHAINS` keyed by `ChainEnv`) + `config/tokens.ts`. Testnet EVM set = Base Sepolia (primary) + ETH Sepolia + Arbitrum Sepolia + OP Sepolia + Polygon Amoy; mainnet EVM set = Base (primary) + ETH + Arbitrum + Optimism + Polygon. Each entry: `chainId`, viem `Chain`, explorer base URL, server RPC env-var name + public fallback RPC. Solana cluster (`devnet`/`mainnet-beta`) + Bitcoin network (`testnet`/`mainnet`). RPC URLs WITH keys are SERVER-ONLY (read only in route handlers from non-`NEXT_PUBLIC_` env); the browser calls `POST /api/rpc/[chain]`; a public fallback RPC is used ONLY for non-sensitive reads. Nothing hardcodes an RPC/chainId/contract/token address outside these files; mainnet is one env switch (`NEXT_PUBLIC_CHAIN_ENV`).
- **Token registry (spec §5.9).** `config/tokens.ts`: per-network curated list = native + $CRYPT + WETH + WBTC + USDC. $CRYPT and passport addresses come from the CONTRACTS registry populated in Wave 4 — leave TYPED PLACEHOLDERS that read from config (e.g. `undefined`/`0x0…0` sentinels the balance layer skips), NEVER hardcoded live addresses. Standard token addresses (WETH/WBTC/USDC) may be filled per network where publicly known, but still only in this file.
- **Multi-chain read/send (spec §5.9).** EVM: one viem `PublicClient` per chain (transport = our proxy); native via `getBalance`; ERC-20 via `multicall` (`balanceOf`/`decimals`/`symbol`) over the token registry. Send EIP-1559 (`estimateFeesPerGas`, `estimateGas`, pending nonce): embedded signs with the transient local account and broadcasts via `sendRawTransaction` through the proxy; external via wagmi `useSendTransaction`. ERC-20 send = encoded `transfer`. Receive = address + QR (`qrcode`). Tx history via Etherscan API v2 (multichain, one key) behind `GET /api/history/[chain]` (server key). Solana via `@solana/web3.js` through `POST /api/rpc/solana` (SOL + SPL balances; SOL `SystemProgram.transfer` + SPL `@solana/spl-token` transfer, signed by the derived ed25519 `Keypair`). Bitcoin via mempool.space/Esplora behind `GET /api/btc/*` — balances + receive ONLY; **BTC SEND is a flagged fast-follow (NOT v1); UI shows it disabled with a "coming soon" tag**.
- **Swap/Bridge (spec §5.10).** LI.FI primary (0x fallback) — the USER's own wallet signs; NEVER server-sign or custody. On testnets show a clearly-labeled MOCK route (no real execution); the same env switch un-gates mainnet. This wave: a thin, clearly-marked stub only (`lib/wallet/services/swap.ts` returning a MOCK quote on testnet) — no real aggregator execution.
- **CSP / security headers (spec §5.7, §10.2).** Add in `next.config.ts` (or `middleware.ts`): `default-src 'self'`; `connect-src 'self'` + the specific RPC/indexer/WalletConnect origins the wallet needs; `script-src 'self'` (+ nonce where Next requires); `wasm-unsafe-eval` ONLY to allow the Argon2id WASM (NO general `unsafe-eval`); NO `unsafe-inline` for scripts; `frame-ancestors 'none'` + `X-Frame-Options: DENY`; `img-src 'self' data:` (QR data URLs); `Referrer-Policy: strict-origin-when-cross-origin`; Trusted Types where feasible. **`connect-src` must cover EVERY origin the browser actually opens** — for `'self'` to genuinely cover all RPC/indexer reads, PREFER routing the public fallback RPC through `/api/rpc/[chain]` too (Task 1 sets `publicFallbackRpc` to a `/api/*` path so NO direct public-RPC origin is ever contacted; drop any direct public-RPC path). WalletConnect opens BOTH `.org` AND `.com` websockets: include `wss://*.walletconnect.com https://*.walletconnect.com wss://*.walletconnect.org https://*.walletconnect.org`. If any public RPC is kept direct, enumerate each origin explicitly. Verify it does NOT break Next dev/build or the Home/Auth pages — AND (Task 8) load `/wallet`, connect a mock wallet WITH CSP active, and assert ZERO `connect-src` violations.
- **WASM under CSP degrades, never bricks (spec §5.3).** `deriveKeyBytes` (kdf.ts) MUST catch a `WebAssembly`/CSP/`eval`-blocked error from `hash-wasm` and ROUTE to the PBKDF2-SHA512 fallback (recording `kdf:"pbkdf2"`), so a CSP hiccup degrades the KDF instead of breaking wallet creation. Node/jsdom do NOT enforce CSP, so unit tests CANNOT catch a CSP-blocked WASM — a Playwright (real-browser, prod-CSP) step (Task 8) MUST assert the Argon2id vault-encrypt path works under the live CSP.
- **Testing (spec §5, §9).** Vitest Node env (`// @vitest-environment node` FIRST line) for all crypto/HD/vault tests (WebCrypto is global in Node 20); `fake-indexeddb` for the vault store. MUST cover: mnemonic gen validity + entropy source; HD derivation against PUBLISHED BIP-39/BIP-32 + SLIP-0010 vectors pinned from external sources (EVM `0x9858EfFD…`, Solana SLIP-0010, BTC BOTH mainnet `bc1q…` AND testnet `tb1q…` via the network-explicit `deriveBitcoin(seed, network)`); vault encrypt→decrypt round-trip yields the IDENTICAL mnemonic; the PBKDF2 FALLBACK branch (force WASM-unavailable → encrypt with `kdf:"pbkdf2"` → decrypt succeeds via AAD-from-blob); WRONG passphrase throws `WalletUnlockError` and NEVER decrypts; non-deterministic ciphertext (fresh IV per encrypt); versioned blob + KDF param floor; the STATIC footgun grep (no obvious seed/private-key `fetch`/XHR, `lib/wallet` never imported from server files/actions/`server-only` modules) AND the AUTHORITATIVE RUNTIME fetch-spy (full `createWallet → unlock → sendEvm` with a fixed vault — no request body contains the mnemonic/entropy/private-key; signed raw tx allowed); SIWE message built with `activeChain().primaryChainId` (not the connected chain); a proxy JSON-RPC `error` propagates as a thrown viem error from `sendEvm` (not swallowed); chain-registry resolution per env; unit conversions; address validation/checksum. Playwright e2e (against the PRODUCTION build with real CSP): create embedded wallet → lock → unlock (right passphrase works, wrong fails) → reveal seed; Argon2id WASM works under prod CSP (`wasm-unsafe-eval`) with a PBKDF2-degrade check; and `/wallet` + mock-wallet-connect produces ZERO `connect-src` violations. Keep Home + Auth e2e green. (Live-testnet balance/send e2e that needs funded keys is a documented follow-up.)
- **Conventions (match Wave 1/2 EXACTLY).** pnpm; TS strict, `@typescript-eslint/no-explicit-any` = error (NO `any`); unused vars prefixed `_` (`^_`); `import "server-only"` atop every server module, `import "client-only"` atop every wallet module (Vitest aliases both to `test/empty-module.ts`); server/crypto tests use `// @vitest-environment node` as the FIRST line; `DATABASE_URL` fallback `file:./dev.db`; run `pnpm format` then `pnpm format:check` before every commit; new deps with install scripts go in `pnpm.onlyBuiltDependencies`; new deps pinned exact via `pnpm add --save-exact`. Test files `*.test.ts(x)` under `lib/`, `test/`, `components/`; e2e specs `*.spec.ts` under `e2e/`. Per-task commits ending with the trailer:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```
- **CI gate (`.github/workflows/web.yml`).** After every task the full chain must pass: `guard:secrets` (now ALSO grepping app code for secret sinks — Task 4) → `format:check` → `db:generate` → `prisma migrate deploy` → `typecheck` → `lint` (now linting `config/` via `next.config.ts` `eslint.dirs` — Task 8) → `test` (Vitest `include` now covers `config/**/*.test.ts` — Task 1, else those tests are silently skipped) → `build`. Keep the existing Home (`e2e/home.spec.ts`) and Auth (`e2e/auth.spec.ts`) e2e green. Add the new `no-server-wallet-import` ESLint rule to lint (Task 4).
- **Version floors.** Node ≥ 20. Next 15.1.0, React 19.0.0, viem 2.54.1, siwe ^2.3.2, Prisma ^6.19.3 — do NOT bump. Pin all new deps to exact resolved versions in the lockfile.

---

## File Structure (created/modified this wave)

```
config/
  chains.config.ts                    # CREATE: typed CHAINS registry keyed by ChainEnv (§2.4)
  chains.config.test.ts               # CREATE: per-env resolution + no-hardcode assertions
  tokens.ts                           # CREATE: curated token registry per network (native+$CRYPT+WETH/WBTC/USDC)
  tokens.test.ts                      # CREATE
lib/
  config/
    chain.ts                          # MODIFY: keep CHAIN_ENV/isMainnet; re-export activeChain()
  http/
    responses.ts                      # (reuse: json/badRequest/forbidden/tooManyRequests)
  rpc/
    allowlist.ts                      # CREATE: allow-listed JSON-RPC methods + chain resolution (server-only)
    allowlist.test.ts                 # CREATE
  wallet/                             # CLIENT-ONLY — every file starts import "client-only"
    units.ts                          # CREATE: wei<->eth, lamports, sats conversions + address checksum/validate
    units.test.ts                     # CREATE
    embedded/
      mnemonic.ts                     # CREATE: BIP-39 gen/validate/entropy (@scure/bip39)
      mnemonic.test.ts                # CREATE
      derive.ts                       # CREATE: HD derivation EVM/Solana/BTC
      derive.test.ts                  # CREATE (BIP/SLIP vectors)
      kdf.ts                          # CREATE: Argon2id (hash-wasm) + PBKDF2-SHA512 fallback
      kdf.test.ts                     # CREATE
      vault.ts                        # CREATE: AES-256-GCM encrypt/decrypt + VaultBlob + WalletUnlockError
      vault.test.ts                   # CREATE (round-trip, wrong-pass, fresh-IV, versioned blob)
      storage.ts                      # CREATE: IndexedDB persistence (idb)
      storage.test.ts                 # CREATE (fake-indexeddb)
      session.ts                      # CREATE: WalletSession lifecycle (create/unlock/lock/auto-lock/zeroize)
      session.test.ts                 # CREATE
    external/
      wagmi.ts                        # CREATE: wagmi config + connectors (from registry)
      siwe.ts                         # CREATE: client SIWE message build (verify is Wave 2 server)
      siwe.test.ts                    # CREATE
    services/
      evmClients.ts                   # CREATE: viem PublicClient per chain via proxy transport
      balances.ts                     # CREATE: EVM native+ERC-20 (multicall), Solana SOL+SPL, BTC
      balances.test.ts                # CREATE
      send.ts                         # CREATE: EVM EIP-1559 + ERC-20 build/sign/broadcast; Solana transfer; BTC receive-only
      send.test.ts                    # CREATE
      history.ts                      # CREATE: tx history via /api/history + /api/btc adapters
      swap.ts                         # CREATE: MOCK testnet quote stub (thin)
    receive.ts                        # CREATE: address + QR data URL (qrcode)
    receive.test.ts                   # CREATE
app/
  api/
    rpc/[chain]/route.ts              # CREATE (POST): allow-listed keyed EVM JSON-RPC proxy
    rpc/[chain]/route.test.ts         # CREATE
    rpc/solana/route.ts               # CREATE (POST): keyed Solana RPC proxy
    history/[chain]/route.ts          # CREATE (GET): Etherscan v2 multichain proxy
    btc/[...path]/route.ts            # CREATE (GET): mempool.space/Esplora proxy (balance/utxos/tx)
  wallet/
    page.tsx                          # CREATE: server shell → mounts <WalletApp/> (minimal exerciser)
components/
  providers/
    AppProviders.tsx                  # CREATE: "use client" Wagmi + QueryClient + EmbeddedWallet tree
    WagmiProvider.tsx                 # CREATE
    QueryProvider.tsx                 # CREATE
  wallet/
    WalletApp.tsx                     # CREATE: "use client" minimal create/unlock/reveal exerciser
    UnlockWalletModal.tsx             # CREATE
test/
  no-server-wallet-import.test.ts     # CREATE: static boundary + no-secret-to-fetch assertions
eslint.config.mjs                     # MODIFY: add no-restricted-imports boundary for lib/wallet
next.config.ts                        # MODIFY: CSP + security headers; ALSO set `eslint: { dirs: ["app","components","lib","config"] }` (+ "middleware" if present) so `next lint` actually lints `config/` — otherwise the config/** import-boundary rule NEVER fires
vitest.config.ts                      # MODIFY: add "config/**/*.test.ts" to `include` (Vitest currently only runs test/lib/components — config tests would be SILENTLY SKIPPED); add fake-indexeddb setup for wallet tests (or per-file import)
package.json                          # MODIFY: deps + onlyBuiltDependencies + save-exact
.env.example                          # MODIFY: document new RPC/indexer/WalletConnect env vars; the new names (RPC_BASE_SEPOLIA / RPC_BASE / ETHERSCAN_API_KEY) REPLACE the old commented names (BASE_SEPOLIA_RPC / BASE_MAINNET_RPC) — delete the old ones so there is ONE convention
```

---

### Task 1 — Chain-config registry + token registry + keyed RPC proxies

Establish the single source of truth for chains/tokens and the server-side keyed RPC/indexer/BTC proxies. No wallet key material here — this task is entirely server + config, and must land BEFORE the wallet so the read/send layers have a registry to consume.

**Files**
- Create: `config/chains.config.ts`, `config/chains.config.test.ts`
- Create: `config/tokens.ts`, `config/tokens.test.ts`
- Modify: `lib/config/chain.ts` (add `activeChain()` re-export; keep existing exports)
- Create: `lib/rpc/allowlist.ts`, `lib/rpc/allowlist.test.ts`
- Create: `app/api/rpc/[chain]/route.ts`, `app/api/rpc/[chain]/route.test.ts`
- Create: `app/api/rpc/solana/route.ts`
- Create: `app/api/history/[chain]/route.ts`
- Create: `app/api/btc/[...path]/route.ts`
- Modify: `vitest.config.ts` (extend `include` with `"config/**/*.test.ts"` so the config tests below actually run)
- Modify: `.env.example`, `package.json` (no new deps yet — uses installed `viem`)

**Interfaces**
- Produces (`config/chains.config.ts`):
  ```ts
  import type { Chain } from "viem";
  import { base, baseSepolia, mainnet, sepolia, arbitrum, arbitrumSepolia,
           optimism, optimismSepolia, polygon, polygonAmoy } from "viem/chains";
  import type { ChainEnv } from "@/lib/config/chain";

  export interface EvmChainEntry {
    chainId: number;
    viemChain: Chain;
    explorer: string;                 // base URL, no trailing slash
    serverRpcEnv: string;             // name of the non-NEXT_PUBLIC_ env var holding the keyed RPC
    publicFallbackRpc?: string;       // NEXT_PUBLIC_* read-only fallback (non-sensitive reads)
    isPrimary?: boolean;              // where CR contracts live
  }
  export interface ChainProfile {
    evm: readonly EvmChainEntry[];
    primaryChainId: number;
    solanaCluster: "devnet" | "mainnet-beta";
    bitcoinNetwork: "testnet" | "mainnet";
  }
  export const CHAINS: Record<ChainEnv, ChainProfile>;
  export function activeChain(): ChainProfile;
  export function evmEntry(chainId: number): EvmChainEntry;   // throws if not in active profile
  ```
- Produces (`config/tokens.ts`):
  ```ts
  export interface TokenEntry {
    symbol: "CRYPT" | "WETH" | "WBTC" | "USDC";
    decimals: number;
    address?: `0x${string}`;          // undefined = not deployed on this chain yet (Wave 4 fills $CRYPT)
  }
  export const TOKENS: Record<number /*chainId*/, readonly TokenEntry[]>;
  export function tokensForChain(chainId: number): readonly TokenEntry[];
  ```
- Produces (`lib/rpc/allowlist.ts`, server-only):
  ```ts
  export const ALLOWED_EVM_METHODS: readonly string[]; // read + broadcast: eth_call, eth_getBalance,
    // eth_blockNumber, eth_chainId, eth_gasPrice, eth_maxPriorityFeePerGas, eth_feeHistory,
    // eth_estimateGas, eth_getTransactionCount, eth_getTransactionReceipt, eth_getTransactionByHash,
    // eth_sendRawTransaction, eth_getCode, eth_getLogs
  export function isAllowedEvmMethod(method: string): boolean;
  export function serverRpcUrl(chainId: number): string;   // reads keyed env; throws if missing/unknown
  ```
- Produces (`app/api/rpc/[chain]/route.ts`): `POST` — body is a JSON-RPC request (or batch); rejects non-allow-listed methods (`badRequest`), resolves chainId → keyed RPC, forwards, returns the JSON-RPC response.

Steps:

- [ ] **Step 0: Make Vitest discover `config/**` tests.** `vitest.config.ts` currently has `include: ["test/**/*.test.ts", "test/**/*.test.tsx", "lib/**/*.test.ts", "components/**/*.test.tsx"]` — it does NOT include `config/`, so every `config/*.test.ts` in this task would be SILENTLY SKIPPED (a false green). Add `"config/**/*.test.ts"` to `include` (or, alternatively, relocate the config tests under `test/`). PROVE the change works: after adding the config test in Step 1, run `pnpm vitest run config/chains.config.test.ts` and CONFIRM Vitest actually collects/executes it (a run that reports "No test files found" means `include` was not updated) — you must SEE the new config tests execute.
- [ ] **Step 1: Write failing test for the chain registry.** Create `config/chains.config.test.ts`:
  ```ts
  // @vitest-environment node
  import { describe, it, expect } from "vitest";
  import { CHAINS, activeChain, evmEntry } from "./chains.config";

  describe("chains registry", () => {
    it("testnet primary is Base Sepolia (84532) and includes 5 EVM chains", () => {
      const p = CHAINS.testnet;
      expect(p.primaryChainId).toBe(84532);
      expect(p.evm.map((e) => e.chainId).sort((a, b) => a - b)).toEqual(
        [84532, 11155111, 421614, 11155420, 80002].sort((a, b) => a - b),
      );
      expect(p.solanaCluster).toBe("devnet");
      expect(p.bitcoinNetwork).toBe("testnet");
    });
    it("mainnet primary is Base (8453) with Base/ETH/Arb/OP/Polygon", () => {
      const p = CHAINS.mainnet;
      expect(p.primaryChainId).toBe(8453);
      expect(p.evm.map((e) => e.chainId).sort((a, b) => a - b)).toEqual(
        [8453, 1, 42161, 10, 137].sort((a, b) => a - b),
      );
    });
    it("evmEntry throws for a chain not in the active profile", () => {
      expect(() => evmEntry(999999)).toThrow();
    });
    it("activeChain defaults to testnet", () => {
      expect(activeChain().primaryChainId).toBe(84532);
    });
  });
  ```
- [ ] **Step 2: Run it, expect FAIL.** `pnpm vitest run config/chains.config.test.ts` → FAILS (module missing). Confirm the failure is "Cannot find module".
- [ ] **Step 3: Verify viem's exported chain objects.** Run `node -e "const c=require('viem/chains'); console.log([c.baseSepolia,c.sepolia,c.arbitrumSepolia,c.optimismSepolia,c.polygonAmoy,c.base,c.mainnet,c.arbitrum,c.optimism,c.polygon].map(x=>[x.name,x.id]))"` and confirm each chain exists with the expected id (84532/11155111/421614/11155420/80002/8453/1/42161/10/137). Note the exact export names.
- [ ] **Step 4: Implement the registry.** Create `config/chains.config.ts` per the **Interfaces** block: build `CHAINS.testnet` and `CHAINS.mainnet` with `EvmChainEntry` for each chain (`chainId`, `viemChain`, `explorer` from `<chain>.blockExplorers.default.url`, `serverRpcEnv` naming e.g. `RPC_BASE_SEPOLIA`/`RPC_BASE`/`RPC_ETHEREUM`/…, `isPrimary` on Base Sepolia / Base). **CSP-safe fallback routing (fix for `connect-src`):** set `publicFallbackRpc` to the SAME `/api/rpc/${chainId}` proxy path (a relative `/api/*` URL), NOT a direct public-RPC origin — so `connect-src 'self'` genuinely covers ALL EVM reads and NO direct public-RPC origin is ever contacted by the browser. (If a direct public RPC is ever reintroduced, its exact origin MUST be enumerated in the Task 8 CSP `connect-src`.) `activeChain()` reads `CHAIN_ENV` from `@/lib/config/chain`. `evmEntry(id)` finds in the active profile or `throw new Error(...)`.
- [ ] **Step 5: Run it, expect PASS.** `pnpm vitest run config/chains.config.test.ts` → PASS.
- [ ] **Step 6: Re-export `activeChain` from `lib/config/chain.ts`.** Add to the existing file (do NOT remove `CHAIN_ENV`/`isMainnet`):
  ```ts
  export { activeChain, evmEntry, CHAINS } from "@/config/chains.config";
  ```
  Run `pnpm typecheck` → PASS.
- [ ] **Step 7: Write failing test for the token registry.** Create `config/tokens.test.ts` asserting `tokensForChain(84532)` includes a native-less list with symbols `CRYPT/WETH/WBTC/USDC`, that `CRYPT.address` is `undefined` (Wave 4 placeholder), and that `tokensForChain(999999)` returns `[]`. Run → FAIL (module missing).
- [ ] **Step 8: Implement `config/tokens.ts`.** Per **Interfaces**: `TOKENS` keyed by chainId with `TokenEntry[]`; `CRYPT` entry has `address: undefined` on every chain (typed placeholder — Wave 4 fills it); `WETH/WBTC/USDC` addresses filled per network only where publicly known (leave `undefined` otherwise). `tokensForChain` returns `TOKENS[chainId] ?? []`. Run `pnpm vitest run config/tokens.test.ts` → PASS.
- [ ] **Step 9: Write failing test for the RPC allow-list.** Create `lib/rpc/allowlist.test.ts` (`// @vitest-environment node`): assert `isAllowedEvmMethod("eth_call")` is `true`, `isAllowedEvmMethod("eth_sendRawTransaction")` is `true`, `isAllowedEvmMethod("personal_sign")` is `false`, `isAllowedEvmMethod("eth_accounts")` is `false`; and `serverRpcUrl` throws when the env var is unset. Run → FAIL.
- [ ] **Step 10: Implement `lib/rpc/allowlist.ts`.** `import "server-only"`; export `ALLOWED_EVM_METHODS` (the read+broadcast list from **Interfaces**; NO signing/account methods), `isAllowedEvmMethod`, and `serverRpcUrl(chainId)` reading `process.env[evmEntry(chainId).serverRpcEnv]` and `throw`ing if missing. Run → PASS.
- [ ] **Step 11: Write failing integration test for the EVM RPC proxy.** Create `app/api/rpc/[chain]/route.test.ts` (`// @vitest-environment node`): stub `global.fetch`; POST a `{jsonrpc:"2.0",method:"eth_blockNumber",params:[],id:1}` with `params: Promise.resolve({ chain: "84532" })` and assert the proxy forwards to the keyed URL (set the env var in the test) and returns the stubbed JSON; POST `method:"eth_accounts"` and assert `400`; POST with an unknown chain and assert `400`. Run → FAIL.
- [ ] **Step 12: Implement the EVM proxy route.** Create `app/api/rpc/[chain]/route.ts`: `POST(req, { params })` (Next 15: `params` is a Promise — `await` it), parse JSON body, reject if any request in the body has a method failing `isAllowedEvmMethod` (`badRequest`), resolve `serverRpcUrl(Number(chain))` (catch → `badRequest`), `fetch` it with the body, return the upstream JSON via `json(...)`. Never log the body. Run → PASS.
- [ ] **Step 13: Implement the Solana + history + BTC proxies (with a smoke test each).** Create `app/api/rpc/solana/route.ts` (`POST`: forward JSON-RPC to the keyed Solana RPC from `activeChain().solanaCluster` mapped to a `RPC_SOLANA`/`NEXT_PUBLIC_SOLANA_RPC` env; allow-list Solana read methods `getBalance`/`getParsedTokenAccountsByOwner`/`getLatestBlockhash`/`sendTransaction`/`getSignaturesForAddress`); `app/api/history/[chain]/route.ts` (`GET`: build the Etherscan v2 multichain URL with `chainid` + `ETHERSCAN_API_KEY`, forward, return JSON); `app/api/btc/[...path]/route.ts` (`GET`: allow-list Esplora paths `address/:addr`, `address/:addr/utxo`, `tx/:id`; base URL from `activeChain().bitcoinNetwork` → mempool.space; forward). Add one `// @vitest-environment node` test per route asserting URL construction + an allow-list rejection (stub `fetch`). Run all → PASS.
- [ ] **Step 14: Document env + verify quality gate.** Update `.env.example`: **DELETE the old commented names `BASE_SEPOLIA_RPC` and `BASE_MAINNET_RPC`** (the new `RPC_BASE_SEPOLIA`/`RPC_BASE` names REPLACE them — one convention only, no duplicates), then add `RPC_BASE_SEPOLIA`, `RPC_BASE`, `RPC_ETHEREUM`, `RPC_ARBITRUM`, `RPC_OPTIMISM`, `RPC_POLYGON`, `RPC_SOLANA`, `ETHERSCAN_API_KEY`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, `NEXT_PUBLIC_SOLANA_RPC`, `NEXT_PUBLIC_APP_URL` with comments that keyed vars are SERVER-ONLY. (Do NOT add `NEXT_PUBLIC_RPC_*` public-fallback vars — per Step 4 the fallback routes through `/api/rpc/[chain]`, so there is no direct public-RPC origin to configure.) Run `pnpm format && pnpm format:check && pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
- [ ] **Step 15: Commit.** `git add -A && git commit` — message: "Wave 3 Task 1: chain-config registry, token registry, keyed RPC/history/BTC proxies" + the Co-Authored-By trailer.

---

### Task 2 — Mnemonic + HD derivation (client-only) with BIP/SLIP test vectors

The crypto core: generate BIP-39 mnemonics from secure entropy and derive EVM/Solana/BTC accounts, verified against PUBLISHED test vectors. Client-only; verify the exact library API before writing.

**Files**
- Modify: `package.json` (add `@scure/bip39 @scure/bip32 @scure/btc-signer ed25519-hd-key @solana/web3.js` exact; none have postinstall build scripts, but confirm and add any that do to `pnpm.onlyBuiltDependencies`)
- Create: `lib/wallet/embedded/mnemonic.ts`, `lib/wallet/embedded/mnemonic.test.ts`
- Create: `lib/wallet/embedded/derive.ts`, `lib/wallet/embedded/derive.test.ts`
- Create: `lib/wallet/units.ts`, `lib/wallet/units.test.ts`

**Interfaces**
- Produces (`lib/wallet/embedded/mnemonic.ts`):
  ```ts
  export function generateMnemonic(strength?: 128 | 160 | 192 | 224 | 256): string; // default 256
  export function validateMnemonic(phrase: string): boolean;
  export function mnemonicToEntropy(phrase: string): Uint8Array;
  export function entropyToMnemonic(entropy: Uint8Array): string;
  export function mnemonicToSeed(phrase: string, passphrase?: string): Promise<Uint8Array>;
  ```
- Produces (`lib/wallet/embedded/derive.ts`):
  ```ts
  export interface DerivedAccount { address: string; publicKey: string; }
  export function deriveEvm(seed: Uint8Array): DerivedAccount & { path: string };   // m/44'/60'/0'/0/0
  export function deriveSolana(seed: Uint8Array): DerivedAccount & { path: string }; // m/44'/501'/0'/0'
  export function deriveBitcoin(                                                     // m/84'/0'/0'/0/0
    seed: Uint8Array, network: "mainnet" | "testnet",                               // NETWORK-EXPLICIT: mainnet→bc1q…, testnet→tb1q…
  ): DerivedAccount & { path: string };
  // Signers are produced on demand and never returned as long-lived raw keys:
  export function evmSigner(seed: Uint8Array): ReturnType<typeof import("viem/accounts").privateKeyToAccount>;
  export function solanaKeypair(seed: Uint8Array): import("@solana/web3.js").Keypair;
  ```
- Produces (`lib/wallet/units.ts`): `weiToEth`, `ethToWei` (bigint), `lamportsToSol`, `satsToBtc`, `isValidEvmAddress`, `toChecksumAddress`, `isValidSolanaAddress`, `isValidBtcAddress`.

Steps:

- [ ] **Step 1: Add deps + verify APIs.** `pnpm add --save-exact @scure/bip39 @scure/bip32 @scure/btc-signer ed25519-hd-key @solana/web3.js`. Then verify each API: `node -e "const b=require('@scure/bip39'); const w=require('@scure/bip39/wordlists/english'); console.log(Object.keys(b), typeof w.wordlist)"`, `node -e "const {HDKey}=require('@scure/bip32'); console.log(typeof HDKey.fromMasterSeed)"`, `node -e "const e=require('ed25519-hd-key'); console.log(Object.keys(e))"`, `node -e "const s=require('@scure/btc-signer'); console.log(Object.keys(s))"`, `node -e "const {Keypair}=require('@solana/web3.js'); console.log(typeof Keypair.fromSeed)"`. Note the exact fn/property names for use below.
- [ ] **Step 2: Write failing mnemonic test.** Create `lib/wallet/embedded/mnemonic.test.ts`:
  ```ts
  // @vitest-environment node
  import { describe, it, expect } from "vitest";
  import {
    generateMnemonic, validateMnemonic, mnemonicToEntropy, entropyToMnemonic,
  } from "./mnemonic";

  describe("mnemonic", () => {
    it("generates a valid 24-word phrase by default", () => {
      const m = generateMnemonic();
      expect(m.split(" ")).toHaveLength(24);
      expect(validateMnemonic(m)).toBe(true);
    });
    it("supports 12 words at 128-bit", () => {
      expect(generateMnemonic(128).split(" ")).toHaveLength(12);
    });
    it("rejects an invalid phrase", () => {
      expect(validateMnemonic("not a real mnemonic phrase at all zzz")).toBe(false);
    });
    it("round-trips a known BIP-39 vector (entropy <-> phrase)", () => {
      // BIP-39 test vector: all-zero 256-bit entropy
      const phrase =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon " +
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon " +
        "abandon abandon abandon art";
      expect(entropyToMnemonic(new Uint8Array(32))).toBe(phrase);
      expect(Array.from(mnemonicToEntropy(phrase))).toEqual(Array.from(new Uint8Array(32)));
    });
  });
  ```
- [ ] **Step 3: Run it, expect FAIL.** `pnpm vitest run lib/wallet/embedded/mnemonic.test.ts` → FAILS (module missing).
- [ ] **Step 4: Implement `mnemonic.ts`.** `import "client-only";` then wrap `@scure/bip39` (English wordlist). `generateMnemonic(strength=256)` MUST source entropy from `crypto.getRandomValues` — use the library's `generateMnemonic(wordlist, strength)` (it uses secure RNG internally; confirm in Step 1) OR generate entropy with `crypto.getRandomValues(new Uint8Array(strength/8))` and call `entropyToMnemonic`. `validateMnemonic(phrase)` → `bip39.validateMnemonic(phrase, wordlist)`. `mnemonicToEntropy`/`entropyToMnemonic` map to the library's fns. `mnemonicToSeed` → `bip39.mnemonicToSeed`. NO `Math.random`, timestamps, or user input anywhere.
- [ ] **Step 5: Run it, expect PASS.** `pnpm vitest run lib/wallet/embedded/mnemonic.test.ts` → PASS.
- [ ] **Step 6: Write failing derivation test with published vectors.** Create `lib/wallet/embedded/derive.test.ts`:
  ```ts
  // @vitest-environment node
  import { describe, it, expect } from "vitest";
  import { mnemonicToSeed } from "./mnemonic";
  import { deriveEvm, deriveSolana, deriveBitcoin } from "./derive";

  // Canonical test mnemonic (all-zero 256-bit entropy → known addresses in common wallets).
  const M =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon " +
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon " +
    "abandon abandon abandon art";

  describe("HD derivation vectors", () => {
    it("derives the expected EVM address at m/44'/60'/0'/0/0", async () => {
      const seed = await mnemonicToSeed(M);
      const acct = deriveEvm(seed);
      expect(acct.path).toBe("m/44'/60'/0'/0/0");
      // PUBLISHED vector for the all-zero "abandon…art" phrase — MUST be pinned from an
      // external source (e.g. iancoleman.io/bip39, MetaMask docs), NOT self-generated:
      //   m/44'/60'/0'/0/0 → 0x9858EfFD232B4033E47d90003D41EC34EcaEda94
      expect(acct.address).toBe("0x9858EfFD232B4033E47d90003D41EC34EcaEda94");
    });
    it("derives the expected Solana address at m/44'/501'/0'/0' (SLIP-0010)", async () => {
      const seed = await mnemonicToSeed(M);
      const acct = deriveSolana(seed);
      expect(acct.path).toBe("m/44'/501'/0'/0'");
      // PUBLISHED SLIP-0010 ed25519 vector (Phantom-compatible) for this phrase — pin the
      // exact base58 pubkey from an external tool, NOT self-generated with the lib under test.
      expect(acct.address.length).toBeGreaterThanOrEqual(32); // base58 (replace with frozen value in Step 7)
    });
    it("derives a mainnet native-segwit BTC address (bc1q…) at m/84'/0'/0'/0/0", async () => {
      const seed = await mnemonicToSeed(M);
      const acct = deriveBitcoin(seed, "mainnet");
      expect(acct.path).toBe("m/84'/0'/0'/0/0");
      // PUBLISHED BIP-84 vector for this phrase: bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu
      expect(acct.address).toBe("bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu");
    });
    it("derives a testnet native-segwit BTC address (tb1q…) at m/84'/0'/0'/0/0", async () => {
      const seed = await mnemonicToSeed(M);
      const acct = deriveBitcoin(seed, "testnet");
      expect(acct.path).toBe("m/84'/0'/0'/0/0");
      expect(acct.address.startsWith("tb1q")).toBe(true); // freeze the exact tb1q… value in Step 7
    });
  });
  ```
- [ ] **Step 7: Compute + freeze the exact vectors.** The EVM `0x9858EfFD…` and mainnet BTC `bc1qcr8te4k…` values above are PUBLISHED vectors for the all-zero "abandon…art" phrase (record the source URL in a code comment). For Solana and the testnet `tb1q…`, derive once in a scratch `node` REPL, then CROSS-CHECK against an EXTERNAL published source — the Solana pubkey against a SLIP-0010 ed25519 tool (Phantom-compatible), the `tb1q…` against a BIP-84 testnet tool — and freeze the confirmed values (do NOT accept a value produced only by the library under test). This freezes real regression vectors, not tautologies.
- [ ] **Step 8: Run it, expect FAIL.** `pnpm vitest run lib/wallet/embedded/derive.test.ts` → FAILS (module missing).
- [ ] **Step 9: Implement `derive.ts`.** `import "client-only";`
  - `deriveEvm`: `HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0/0")`; take `.privateKey`, `privateKeyToAccount(toHex(priv))` → `{ address, publicKey: account.publicKey, path }`.
  - `deriveSolana`: `derivePath("m/44'/501'/0'/0'", Buffer.from(seed).toString("hex")).key` → `Keypair.fromSeed(key.slice(0,32))` → `{ address: kp.publicKey.toBase58(), publicKey: kp.publicKey.toBase58(), path }`.
  - `deriveBitcoin(seed, network)`: `HDKey.fromMasterSeed(seed).derive("m/84'/0'/0'/0/0")`; build p2wpkh with `@scure/btc-signer` passing the EXPLICIT network object — `p2wpkh(pubkey, network === "mainnet" ? btc.NETWORK : btc.TEST_NETWORK)` (confirm the exact `@scure/btc-signer` network export names in Step 1) → `{ address, publicKey, path }`. The `network` argument is REQUIRED (no default); callers pass `activeChain().bitcoinNetwork`. mainnet→`bc1q…`, testnet→`tb1q…`.
  - `evmSigner(seed)` / `solanaKeypair(seed)` return transient signer handles (not persisted).
- [ ] **Step 10: Run it, expect PASS.** `pnpm vitest run lib/wallet/embedded/derive.test.ts` → PASS.
- [ ] **Step 11: Write failing units test.** Create `lib/wallet/units.test.ts` asserting `ethToWei("1")===10n**18n`, `weiToEth(10n**18n)==="1"`, `lamportsToSol(1_000_000_000n)==="1"`, `isValidEvmAddress` + `toChecksumAddress` (use a known mixed-case checksum vector), `isValidBtcAddress("bc1q…")===true`, `isValidSolanaAddress` for a base58 key. Run → FAIL.
- [ ] **Step 12: Implement `units.ts`.** `import "client-only";` use viem's `parseEther`/`formatEther`/`getAddress`/`isAddress` for EVM; simple bigint math for lamports/sats; base58 length/charset + `bech32` shape checks (via `@scure/btc-signer` decode or a minimal validator) for BTC/Solana. Run → PASS.
- [ ] **Step 13: Quality gate + commit.** `pnpm format && pnpm format:check && pnpm typecheck && pnpm lint && pnpm test && pnpm build`. Confirm the new deps have no postinstall build scripts (`pnpm why <pkg>` / lockfile); if any do, add to `pnpm.onlyBuiltDependencies`. Commit: "Wave 3 Task 2: BIP-39 mnemonic + HD derivation (EVM/Solana/BTC) with published vectors" + trailer.

---

### Task 3 — Vault: Argon2id/PBKDF2 KDF + AES-256-GCM encrypt/decrypt + VaultBlob + IndexedDB

Encryption at rest. The heart of the security posture: encrypt the BIP-39 entropy, wrong passphrase must NEVER decrypt, fresh IV per encrypt, versioned blob, IndexedDB persistence. Client-only.

**Files**
- Modify: `package.json` (add `hash-wasm idb` exact; dev `fake-indexeddb`)
- Create: `lib/wallet/embedded/kdf.ts`, `lib/wallet/embedded/kdf.test.ts`
- Create: `lib/wallet/embedded/vault.ts`, `lib/wallet/embedded/vault.test.ts`
- Create: `lib/wallet/embedded/storage.ts`, `lib/wallet/embedded/storage.test.ts`

**Interfaces**
- Produces (`lib/wallet/embedded/kdf.ts`):
  ```ts
  export interface KdfParams { memorySize: 65536; iterations: 3; parallelism: 1; hashLength: 32; }
  export const ARGON2_PARAMS: KdfParams;
  export type KdfKind = "argon2id" | "pbkdf2";
  export interface DerivedKeyResult { keyBytes: Uint8Array; kdf: KdfKind; }
  // Argon2id via hash-wasm; falls back to PBKDF2-SHA512(600000) via WebCrypto when WASM unavailable.
  export function deriveKeyBytes(passphrase: string, salt: Uint8Array): Promise<DerivedKeyResult>;
  export const PBKDF2_ITERATIONS: 600000;
  ```
- Produces (`lib/wallet/embedded/vault.ts`):
  ```ts
  export class WalletUnlockError extends Error {}
  export interface VaultBlob {
    v: 1; kdf: "argon2id" | "pbkdf2"; kdfParams: KdfParams; cipher: "AES-256-GCM";
    salt: string; iv: string; ct: string;                 // base64
    addresses: { evm: string; solana: string; bitcoin: string };
    createdAt: string; label: string;
  }
  export function encryptEntropy(
    entropy: Uint8Array, passphrase: string,
    addresses: VaultBlob["addresses"], label?: string,
  ): Promise<VaultBlob>;
  export function decryptEntropy(blob: VaultBlob, passphrase: string): Promise<Uint8Array>; // throws WalletUnlockError on wrong pass
  ```
- Produces (`lib/wallet/embedded/storage.ts`):
  ```ts
  export function saveVault(blob: VaultBlob, id?: string): Promise<void>;   // default id "primary"
  export function loadVault(id?: string): Promise<VaultBlob | undefined>;
  export function hasVault(id?: string): Promise<boolean>;
  export function deleteVault(id?: string): Promise<void>;
  ```

Steps:

- [ ] **Step 1: Add deps + verify APIs.** `pnpm add --save-exact hash-wasm idb` and `pnpm add --save-exact -D fake-indexeddb`. Verify: `node -e "const h=require('hash-wasm'); console.log(typeof h.argon2id)"` (confirm `argon2id` signature: `{ password, salt, parallelism, iterations, memorySize, hashLength, outputType }`), `node -e "const {openDB}=require('idb'); console.log(typeof openDB)"`. Add any packages with postinstall scripts to `pnpm.onlyBuiltDependencies` (check the lockfile).
- [ ] **Step 2: Write failing KDF test.** Create `lib/wallet/embedded/kdf.test.ts` (`// @vitest-environment node`): assert `ARGON2_PARAMS` equals `{memorySize:65536,iterations:3,parallelism:1,hashLength:32}`; `deriveKeyBytes("pw", salt)` resolves to `{ keyBytes: 32 bytes, kdf: "argon2id" }`; deriving twice with the SAME passphrase+salt yields identical `keyBytes` (determinism); different salt → different key. **Fallback path:** mock `hash-wasm`'s `argon2id` to throw a `WebAssembly`-style error (`vi.mock`) and assert `deriveKeyBytes` still resolves to `{ keyBytes: 32 bytes, kdf: "pbkdf2" }` (proves the catch routes to PBKDF2 rather than propagating). Run → FAIL.
- [ ] **Step 3: Implement `kdf.ts`.** `import "client-only";` `deriveKeyBytes` tries `hash-wasm` `argon2id` with `ARGON2_PARAMS` (`outputType:"binary"`, `salt`, `password: passphrase`) inside a `try/catch` → `{ keyBytes, kdf:"argon2id" }`. The `catch` MUST specifically handle a `WebAssembly`/CSP/`eval`-blocked failure (`hash-wasm` compiles WASM which a strict `script-src` without `'wasm-unsafe-eval'` blocks — throwing a `CompileError`/`WebAssembly` error) and ROUTE to the fallback rather than propagate, so a CSP hiccup DEGRADES instead of bricking wallet creation. Fallback = WebCrypto `crypto.subtle.deriveBits` with PBKDF2-SHA512, `PBKDF2_ITERATIONS=600000`, 32-byte output → `{ keyBytes, kdf:"pbkdf2" }`. NOTE: Node/jsdom do NOT enforce CSP, so this degrade path is proven in a browser by the Task 8 Playwright prod-CSP step (unit tests cover the API-throws path via a mock). Run → PASS.
- [ ] **Step 4: Write failing vault test — round-trip + wrong-pass + fresh-IV + versioned.** Create `lib/wallet/embedded/vault.test.ts` (`// @vitest-environment node`):
  ```ts
  // @vitest-environment node
  import { describe, it, expect } from "vitest";
  import { encryptEntropy, decryptEntropy, WalletUnlockError } from "./vault";
  import { generateMnemonic, mnemonicToEntropy, entropyToMnemonic } from "./mnemonic";

  const ADDR = { evm: "0x0000000000000000000000000000000000000000", solana: "So1111", bitcoin: "bc1qx" };

  describe("vault", () => {
    it("round-trips: decrypt recovers the identical entropy/mnemonic", async () => {
      const m = generateMnemonic();
      const entropy = mnemonicToEntropy(m);
      const blob = await encryptEntropy(entropy, "correct horse battery staple", ADDR);
      const back = await decryptEntropy(blob, "correct horse battery staple");
      expect(entropyToMnemonic(back)).toBe(m);
    });
    it("WRONG passphrase throws WalletUnlockError and NEVER returns plaintext", async () => {
      const entropy = mnemonicToEntropy(generateMnemonic());
      const blob = await encryptEntropy(entropy, "right-passphrase-123", ADDR);
      await expect(decryptEntropy(blob, "wrong-passphrase-123")).rejects.toBeInstanceOf(WalletUnlockError);
    });
    it("uses a FRESH IV per encryption (non-deterministic ciphertext)", async () => {
      const entropy = mnemonicToEntropy(generateMnemonic());
      const a = await encryptEntropy(entropy, "pw", ADDR);
      const b = await encryptEntropy(entropy, "pw", ADDR);
      expect(a.iv).not.toBe(b.iv);
      expect(a.ct).not.toBe(b.ct);
    });
    it("persists a versioned blob with pinned KDF params and public addresses outside ct", async () => {
      const blob = await encryptEntropy(mnemonicToEntropy(generateMnemonic()), "pw", ADDR);
      expect(blob.v).toBe(1);
      expect(blob.cipher).toBe("AES-256-GCM");
      expect(blob.kdfParams).toEqual({ memorySize: 65536, iterations: 3, parallelism: 1, hashLength: 32 });
      expect(blob.addresses).toEqual(ADDR);
    });
    it("PBKDF2 FALLBACK round-trips (AAD reconstructed from blob.kdf) when WASM is unavailable", async () => {
      // Force the WASM-unavailable fallback so the vault is written with kdf:"pbkdf2".
      // (Mock hash-wasm's argon2id to throw a WebAssembly/CompileError, e.g. via vi.mock/vi.spyOn
      //  on the kdf module or the hash-wasm import — see kdf.ts catch branch.)
      const entropy = mnemonicToEntropy(generateMnemonic());
      const blob = await encryptEntropy(entropy, "pw-fallback-123", ADDR);
      expect(blob.kdf).toBe("pbkdf2");
      // decrypt MUST reconstruct AAD from blob.kdf/blob.kdfParams (NOT a hardcoded argon2id constant),
      // else the GCM auth tag fails for a pbkdf2 vault:
      const back = await decryptEntropy(blob, "pw-fallback-123");
      expect(Array.from(back)).toEqual(Array.from(entropy));
    });
  });
  ```
- [ ] **Step 5: Run it, expect FAIL.** `pnpm vitest run lib/wallet/embedded/vault.test.ts` → FAIL (module missing).
- [ ] **Step 6: Implement `vault.ts`.** `import "client-only";`
  - `encryptEntropy`: `salt = crypto.getRandomValues(new Uint8Array(16))`, `iv = crypto.getRandomValues(new Uint8Array(12))` (FRESH every call), `const { keyBytes, kdf } = await deriveKeyBytes(passphrase, salt)`, `crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false /*non-extractable*/, ["encrypt","decrypt"])`. Build `aad` from the ACTUAL `kdf` returned (which may be `"pbkdf2"` on fallback): `TextEncoder().encode(JSON.stringify({v:1,kdf,kdfParams:ARGON2_PARAMS}))`. `crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:aad}, key, entropy)`. Base64-encode salt/iv/ct; set `blob.kdf = kdf`. Return the `VaultBlob`. `.fill(0)` the `keyBytes` after import.
  - `decryptEntropy`: rebuild key from `blob.salt` + the passphrase (re-run `deriveKeyBytes`); **reconstruct the AAD from the BLOB's stored fields — `TextEncoder().encode(JSON.stringify({v:blob.v,kdf:blob.kdf,kdfParams:blob.kdfParams}))` — NOT a hardcoded `"argon2id"` constant** (a PBKDF2 fallback vault stores `kdf:"pbkdf2"`, and a mismatched AAD fails the GCM auth tag even with the correct passphrase). `crypto.subtle.decrypt({name:"AES-GCM",iv,additionalData:aad}, key, ct)` inside `try/catch` — ANY failure (wrong pass fails the GCM tag) → `throw new WalletUnlockError("incorrect passphrase")`. Never surface partial plaintext. Return the entropy `Uint8Array`.
- [ ] **Step 7: Run it, expect PASS.** `pnpm vitest run lib/wallet/embedded/vault.test.ts` → PASS (all four cases).
- [ ] **Step 8: Write failing storage test.** Create `lib/wallet/embedded/storage.test.ts` (`// @vitest-environment node`) with `import "fake-indexeddb/auto";` as the FIRST import: `saveVault(blob)` then `loadVault()` returns the same blob; `hasVault()` is `true` after save, `false` after `deleteVault()`. Run → FAIL.
- [ ] **Step 9: Implement `storage.ts`.** `import "client-only";` use `idb` `openDB("cryptrepublic", 1, { upgrade(db){ db.createObjectStore("vaults", { keyPath: "id" }); } })`; `saveVault` puts `{ id, ...blob }`; `loadVault` gets by id (default `"primary"`) and strips `id`; `hasVault`/`deleteVault` accordingly. Run → PASS.
- [ ] **Step 10: Quality gate + commit.** Full chain. Ensure the wallet tests run under Node env (per-file directive). Commit: "Wave 3 Task 3: Argon2id/PBKDF2 KDF + AES-256-GCM vault + IndexedDB store" + trailer.

---

### Task 4 — WalletSession lifecycle + zeroize/auto-lock + boundary rule (no secret to server / no server import)

Bind the pieces into a lifecycle, hold secrets only in a module-scoped session, and LOCK DOWN the client-only boundary with an ESLint rule + a static test.

**Files**
- Create: `lib/wallet/embedded/session.ts`, `lib/wallet/embedded/session.test.ts`
- Modify: `eslint.config.mjs` (add `no-restricted-imports` boundary for `lib/wallet`, scoped to include server actions + `import "server-only"` modules)
- Modify: `scripts/guard-no-secret-columns.sh` (extend beyond schema-only: also grep app code for secret sinks) — wired into `pnpm guard:secrets`
- Create: `test/no-server-wallet-import.test.ts`
- Create: `test/no-secret-to-fetch.test.ts` (runtime fetch-spy across create→unlock→sendEvm)

**Interfaces**
- Produces (`lib/wallet/embedded/session.ts`):
  ```ts
  export interface WalletAccounts { evm: string; solana: string; bitcoin: string; }
  export interface CreateResult { mnemonic: string; accounts: WalletAccounts; } // mnemonic shown ONCE
  export function createWallet(passphrase: string, label?: string): Promise<CreateResult>;
  export function unlock(passphrase: string): Promise<WalletAccounts>;           // throws WalletUnlockError
  export function lock(): void;                                                    // zeroizes secrets
  export function isUnlocked(): boolean;
  export function getAccounts(): WalletAccounts | null;                            // public data even when locked (from blob)
  export function revealMnemonic(passphrase: string): Promise<string>;            // fresh decrypt
  export function withEvmSigner<T>(fn: (account: import("viem").Account) => Promise<T>): Promise<T>; // unlock-gated, zeroizes after
  export function startAutoLock(inactivityMs?: number): () => void;               // returns a teardown; wires visibilitychange + timers
  ```

Steps:

- [ ] **Step 1: Write failing session lifecycle test.** Create `lib/wallet/embedded/session.test.ts` (`// @vitest-environment node`, `import "fake-indexeddb/auto";` first):
  ```ts
  // @vitest-environment node
  import "fake-indexeddb/auto";
  import { describe, it, expect, beforeEach } from "vitest";
  import { createWallet, unlock, lock, isUnlocked, getAccounts, revealMnemonic } from "./session";
  import { deleteVault } from "./storage";
  import { WalletUnlockError } from "./vault";

  beforeEach(async () => { lock(); await deleteVault(); });

  describe("WalletSession", () => {
    it("create → holds unlocked, exposes accounts, reveals same mnemonic", async () => {
      const { mnemonic, accounts } = await createWallet("strong-passphrase-123");
      expect(isUnlocked()).toBe(true);
      expect(accounts.evm).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(await revealMnemonic("strong-passphrase-123")).toBe(mnemonic);
    });
    it("lock drops the unlocked state; getAccounts still returns public addresses", async () => {
      const { accounts } = await createWallet("strong-passphrase-123");
      lock();
      expect(isUnlocked()).toBe(false);
      expect(getAccounts()?.evm).toBe(accounts.evm);
    });
    it("unlock with the right passphrase works; wrong throws WalletUnlockError", async () => {
      await createWallet("strong-passphrase-123"); lock();
      await expect(unlock("wrong")).rejects.toBeInstanceOf(WalletUnlockError);
      expect(isUnlocked()).toBe(false);
      const a = await unlock("strong-passphrase-123");
      expect(isUnlocked()).toBe(true);
      expect(a.evm).toMatch(/^0x/);
    });
  });
  ```
- [ ] **Step 2: Run it, expect FAIL.** `pnpm vitest run lib/wallet/embedded/session.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement `session.ts`.** `import "client-only";` module-scoped mutable state: `let unlockedSeed: Uint8Array | null`, `let cachedAccounts: WalletAccounts | null`. `createWallet` → generate mnemonic → entropy → seed → derive all three accounts (BTC via `deriveBitcoin(seed, activeChain().bitcoinNetwork)`) → `encryptEntropy` → `saveVault` → set `unlockedSeed`/`cachedAccounts` → return `{ mnemonic, accounts }`. `unlock` → `loadVault` → `decryptEntropy` (throws on wrong) → seed → derive → set state → return accounts. `lock` → `unlockedSeed?.fill(0)`, null everything. `getAccounts` reads `cachedAccounts` (populate from blob addresses on first `loadVault`, even while locked). `revealMnemonic` → fresh `loadVault` + `decryptEntropy` → `entropyToMnemonic`. `withEvmSigner` → require unlocked, derive a transient signer, run `fn`, zeroize the transient private key. Secrets NEVER touch React state/localStorage/logs. **Guard ALL browser globals — `window`, `document`, AND `indexedDB` — behind `typeof … !== "undefined"` (or feature-detect)** so node-env tests using `fake-indexeddb/auto` (which shims `indexedDB` but NOT `window`/`document`) never dereference an undefined `window`; note this guard applies to `startAutoLock` and any storage-access path.
- [ ] **Step 4: Run it, expect PASS.** `pnpm vitest run lib/wallet/embedded/session.test.ts` → PASS.
- [ ] **Step 5: Implement auto-lock (browser-guarded).** Add `startAutoLock(inactivityMs=600000)` that (only when `typeof window !== "undefined"`) sets an inactivity timer reset on `mousemove`/`keydown`/`click`, calls `lock()` on timeout, on `document.visibilitychange` → `hidden` (past a short grace), and on `pagehide`; returns a teardown that removes listeners + clears timers. Add a jsdom test (`// @vitest-environment jsdom`, default) that dispatches `visibilitychange` with `document.hidden=true` and asserts `lock()` ran (spy on `isUnlocked`). Run → PASS.
- [ ] **Step 6: Write failing boundary/static test (footgun grep — NOT a proof of safety).** Create `test/no-server-wallet-import.test.ts` (`// @vitest-environment node`): (a) glob all files under `app/**` that are route/layout/page server files, server actions (`app/**/actions.ts`), `lib/**` modules containing `import "server-only"`, and `middleware.ts`; assert NONE contains a string import from `@/lib/wallet` or a relative `lib/wallet` path; (b) glob every file under `lib/wallet/**` and assert each begins with `import "client-only"`; (c) glob `lib/wallet/**` and assert any `fetch(` call in `lib/wallet/services/**` targets only our `/api/*` proxy paths (regex: `fetch\((["'\`])/api/`) and that identifiers named `/seed|entropy|privateKey|mnemonic/` never appear as a `fetch`/`JSON.stringify`-to-network argument. **This is a lint-style grep for OBVIOUS footguns — it does NOT and CANNOT prove no secret reaches the network** (that is the RUNTIME fetch-spy in Step 6b). Run → FAIL if any wallet module lacks `client-only` (they should already have it) or if a violation exists.
- [ ] **Step 6b: Write the AUTHORITATIVE runtime fetch-spy test (positive secret-leak assertion).** Create `test/no-secret-to-fetch.test.ts` (`// @vitest-environment node`, `import "fake-indexeddb/auto";` first). Use a FIXED test vault: seed the wallet from a KNOWN mnemonic (the all-zero "abandon…art" phrase) so the entropy hex and the derived EVM private-key hex are known constants in the test. `vi.spyOn(global, "fetch")` (capture every call's URL + body) and stub RPC responses so a full `createWallet → unlock → sendEvm` flow completes (nonce/fees/gas/`eth_sendRawTransaction`). After the flow, for EVERY captured request: JSON-parse (or string-scan) the body and ASSERT it contains NONE of: the known mnemonic string, the entropy hex, the derived private-key hex (case-insensitive, with/without `0x`). Explicitly ALLOW the serialized/signed raw transaction (it IS broadcast and is NOT a secret) — assert the private key does not appear even though the signed tx does. Run → FAIL (modules not yet wired) then, once Tasks 5/6 land the send path, → PASS. (If `sendEvm` is not yet importable at Task 4, stub the flow to `createWallet → unlock → revealMnemonic` now and EXPAND to `sendEvm` in Task 6 Step 6 — the plan REQUIRES the full create→unlock→sendEvm coverage by end of Task 6.)
- [ ] **Step 7: Make it pass.** Fix any wallet module missing `import "client-only"`. Confirm no server file imports `lib/wallet`. Run both static + runtime tests → PASS.
- [ ] **Step 7b: Extend `guard:secrets` from schema-only to also scan app code.** Edit `scripts/guard-no-secret-columns.sh`: keep the existing `prisma/schema.prisma` grep, and ADD a grep over `lib/ app/ components/` for secret SINKS — e.g. `console\.(log|info|warn|error)\(.*(mnemonic|seed|privateKey)`, `(localStorage|sessionStorage)\.setItem\(.*(seed|mnemonic|privateKey)`, `document\.cookie\s*=.*(seed|mnemonic|privateKey)` — exiting non-zero (with a clear message) on any hit. Keep it wired into `pnpm guard:secrets`. Add a scratch offending line (e.g. `console.log(mnemonic)` in a temp file), CONFIRM `pnpm guard:secrets` now FAILS, then remove it and confirm it passes. NOTE in a comment that this static guard complements — does not replace — the Step 6b runtime fetch-spy, which is the authoritative codebase secret-guard.
- [ ] **Step 8: Add the ESLint boundary rule (broadened scope).** In `eslint.config.mjs` add a config block scoped to ALL server surfaces — route/layout/page files, SERVER ACTIONS (`app/**/actions.ts`), `middleware.ts`, and every server-only module tree including the indexer (`files: ["app/**/route.ts","app/**/layout.tsx","app/**/page.tsx","app/**/actions.ts","middleware.ts","lib/{auth,db,rpc,indexer}/**","config/**"]`) — with:
  ```js
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [
        { group: ["@/lib/wallet", "@/lib/wallet/*", "**/lib/wallet/*"],
          message: "lib/wallet is CLIENT-ONLY: never import wallet key-material modules from a server file." },
      ],
    }],
  },
  ```
  (Rationale for the broadened scope: server actions and any `import "server-only"` module — e.g. `lib/indexer/**` — run on the server just like route handlers and must be covered. If future server-only trees appear, add them here, OR invert the rule to an allow-list of `components/**` + the client wallet UI. Page/layout files that are Server Components are covered; the `"use client"` wallet UI lives under `components/wallet/**`, which is NOT in this scope and may import `lib/wallet`.)
  For `config/**` to be linted at all, `next.config.ts` must set `eslint.dirs` to include `config` — that change is made in Task 8 Step 0; if Task 8 has not run yet, temporarily verify the `config/**` scope with `pnpm eslint config/` directly.
- [ ] **Step 9: Run lint, expect PASS — then PROVE the rule fires on BOTH surfaces.** `pnpm lint` → PASS (no server file currently imports `lib/wallet`). (a) Plant a temporary bad `import "@/lib/wallet/embedded/session"` in a scratch SERVER file (e.g. a temp `app/api/_scratch/route.ts`), confirm `pnpm lint` FAILS, remove it. (b) Plant a temporary bad `import "@/lib/wallet/embedded/session"` in a scratch `config/` file (e.g. `config/_scratch.ts`) and run the config-scoped lint (`pnpm eslint config/` now, or `pnpm lint` once Task 8's `eslint.dirs` includes `config`) — confirm it FAILS THERE too (proving the `config/**` boundary genuinely fires, not just the server-file case), then remove it.
- [ ] **Step 10: Quality gate + commit.** Full chain. Commit: "Wave 3 Task 4: WalletSession lifecycle + auto-lock + client-only boundary (ESLint rule + static test)" + trailer.

---

### Task 5 — Multi-chain read layer (EVM native + ERC-20, Solana, BTC) + history

Read balances across chains through the proxies, and surface tx history via the server adapters. All reads route through `/api/*`; no keyed URL is ever in the client.

**Files**
- Create: `lib/wallet/services/evmClients.ts`
- Create: `lib/wallet/services/balances.ts`, `lib/wallet/services/balances.test.ts`
- Create: `lib/wallet/services/history.ts`

**Interfaces**
- Produces (`lib/wallet/services/evmClients.ts`):
  ```ts
  import type { PublicClient } from "viem";
  export function publicClientFor(chainId: number): PublicClient; // transport = http("/api/rpc/<chainId>")
  ```
- Produces (`lib/wallet/services/balances.ts`):
  ```ts
  export interface Balance { symbol: string; decimals: number; raw: bigint; formatted: string; address?: string; }
  export function evmBalances(chainId: number, owner: `0x${string}`): Promise<Balance[]>; // native + ERC-20 via multicall
  export function solanaBalances(owner: string): Promise<Balance[]>;                       // SOL + SPL (registry-filtered)
  export function btcBalance(address: string): Promise<Balance>;                           // confirmed + mempool
  ```
- Produces (`lib/wallet/services/history.ts`):
  ```ts
  export interface TxRow { hash: string; from: string; to: string; value: string; timestamp: number; direction: "in" | "out"; }
  export function evmHistory(chainId: number, address: string): Promise<TxRow[]>; // GET /api/history/<chainId>
  export function btcHistory(address: string): Promise<TxRow[]>;                   // GET /api/btc/address/<addr>
  ```

Steps:

- [ ] **Step 1: Write failing balances test.** Create `lib/wallet/services/balances.test.ts` (`// @vitest-environment node`): stub `global.fetch` to return a JSON-RPC response for `eth_getBalance` and a `multicall` `eth_call` result (encoded), then assert `evmBalances(84532, owner)` returns a native entry with the expected `formatted` and one entry per registry token (skipping tokens with `address: undefined`). Stub the Solana proxy response for `getBalance` and assert `solanaBalances` returns a `SOL` entry. Stub `/api/btc/address/:addr` and assert `btcBalance` sums `funded - spent`. Run → FAIL.
- [ ] **Step 2: Implement `evmClients.ts`.** `import "client-only";` `publicClientFor(chainId)` → `createPublicClient({ chain: evmEntry(chainId).viemChain, transport: http(\`/api/rpc/${chainId}\`) })`. (viem's `http()` posts JSON-RPC to the URL — exactly our proxy contract.)
- [ ] **Step 3: Implement `balances.ts`.** `import "client-only";`
  - `evmBalances`: `client.getBalance({address})` for native; for each `tokensForChain(chainId)` entry with a defined `address`, `client.multicall({ contracts: [balanceOf, decimals, symbol] })` (ERC-20 ABI), map to `Balance`. Format with viem `formatUnits`.
  - `solanaBalances`: POST to `/api/rpc/solana` `getBalance` (SOL) + `getParsedTokenAccountsByOwner` (SPL, filter to registry mints).
  - `btcBalance`: GET `/api/btc/address/${address}`, compute `chain_stats.funded_txo_sum - spent_txo_sum` (+ mempool stats), format sats→BTC.
- [ ] **Step 4: Run it, expect PASS.** `pnpm vitest run lib/wallet/services/balances.test.ts` → PASS.
- [ ] **Step 5: Implement `history.ts` + a smoke test.** `import "client-only";` `evmHistory` GETs `/api/history/${chainId}?address=…` and maps rows; `btcHistory` GETs `/api/btc/address/${address}` tx list. Add a `// @vitest-environment node` test stubbing `fetch` and asserting mapping + `direction` derivation. Run → PASS.
- [ ] **Step 6: Quality gate + commit.** Full chain. Commit: "Wave 3 Task 5: multi-chain balance reads (EVM/Solana/BTC) + tx history via proxies" + trailer.

---

### Task 6 — Send / receive (EVM EIP-1559 + ERC-20 + QR; Solana transfer; BTC receive-only) + swap stub

Money-moving path. Embedded signs locally with the transient account and broadcasts via the proxy; BTC send is disabled (flagged fast-follow); swap is a labeled testnet MOCK.

**Files**
- Modify: `package.json` (add `qrcode` exact; dev `@types/qrcode`)
- Create: `lib/wallet/receive.ts`, `lib/wallet/receive.test.ts`
- Create: `lib/wallet/services/send.ts`, `lib/wallet/services/send.test.ts`
- Create: `lib/wallet/services/swap.ts`

**Interfaces**
- Produces (`lib/wallet/receive.ts`):
  ```ts
  export function receiveQrDataUrl(address: string): Promise<string>; // qrcode.toDataURL
  ```
- Produces (`lib/wallet/services/send.ts`):
  ```ts
  export interface EvmSendRequest { chainId: number; to: `0x${string}`; amount: bigint; token?: `0x${string}`; }
  export interface SendPreview { to: string; amount: string; token: string; chainId: number; feeEstimate: string; }
  export function previewEvmSend(req: EvmSendRequest, from: `0x${string}`): Promise<SendPreview>; // estimates gas+fees
  export function sendEvm(req: EvmSendRequest): Promise<`0x${string}`>;   // unlock-gated; signs local, sendRawTransaction via proxy
  export function sendSolana(to: string, lamports: bigint): Promise<string>; // unlock-gated
  export const BTC_SEND_ENABLED = false;                                  // spec §5.9 fast-follow
  export function sendBitcoin(): never;                                   // throws "BTC send not available in v1"
  ```
- Produces (`lib/wallet/services/swap.ts`):
  ```ts
  export interface MockQuote { mock: true; label: "TESTNET MOCK"; fromToken: string; toToken: string; estOut: string; }
  export function getSwapQuote(fromToken: string, toToken: string, amount: bigint): Promise<MockQuote>; // testnet-only mock
  ```

Steps:

- [ ] **Step 1: Add dep + verify.** `pnpm add --save-exact qrcode` and `pnpm add --save-exact -D @types/qrcode`. Verify `node -e "const q=require('qrcode'); console.log(typeof q.toDataURL)"`.
- [ ] **Step 2: Write failing receive test.** Create `lib/wallet/receive.test.ts` (`// @vitest-environment node`): assert `receiveQrDataUrl("0xabc…")` resolves to a string starting `data:image/png;base64,`. Run → FAIL.
- [ ] **Step 3: Implement `receive.ts`.** `import "client-only";` `receiveQrDataUrl(address)` → `QRCode.toDataURL(address)`. Run → PASS.
- [ ] **Step 4: Write failing send test.** Create `lib/wallet/services/send.test.ts` (`// @vitest-environment node`, `import "fake-indexeddb/auto";`): after `createWallet`, stub `fetch` to answer `eth_getTransactionCount`, `eth_estimateGas`, `eth_maxPriorityFeePerGas`/`eth_feeHistory`, and `eth_sendRawTransaction` (returns a tx hash); assert `previewEvmSend` returns a `feeEstimate` and `sendEvm` returns the stubbed `0x…` hash. Assert native vs ERC-20 (`token` set) builds an encoded `transfer` call. Assert `sendBitcoin()` throws and `BTC_SEND_ENABLED === false`. **Error-propagation case (do NOT swallow):** stub the proxy to return a JSON-RPC `error` object for `eth_sendRawTransaction` (e.g. `{jsonrpc:"2.0",id:1,error:{code:-32000,message:"nonce too low"}}` or an execution-revert error) and assert `sendEvm` REJECTS (throws a viem error) — it must NOT resolve to a bogus success/hash. Run → FAIL.
- [ ] **Step 5: Implement `send.ts`.** `import "client-only";`
  - `previewEvmSend`: build a `PublicClient` (Task 5), `estimateFeesPerGas` + `estimateGas` + pending nonce; for ERC-20 (`token` set) encode `transfer(to, amount)` via viem `encodeFunctionData`; return the `SendPreview`.
  - `sendEvm`: require unlocked; `withEvmSigner` to sign an EIP-1559 tx (`account.signTransaction` / a `WalletClient` with `transport: http("/api/rpc/<chainId>")`), then `client.sendRawTransaction({ serializedTransaction })` → hash. Zeroize the transient key after signing. **Do NOT swallow JSON-RPC errors:** rely on viem's transport to surface a proxy-returned `{error:{...}}` (revert/nonce/etc.) as a thrown viem error — never map an error response to a fake success/hash (the Step 4 error-propagation case guards this).
  - `sendSolana`: require unlocked; build `SystemProgram.transfer` (SPL later), sign with `solanaKeypair`, send via `/api/rpc/solana` `sendTransaction`.
  - `sendBitcoin` throws; `BTC_SEND_ENABLED=false`.
- [ ] **Step 6: Run it, expect PASS.** `pnpm vitest run lib/wallet/services/send.test.ts` → PASS. **Then EXPAND the Task 4 runtime fetch-spy** (`test/no-secret-to-fetch.test.ts`) to run the FULL `createWallet → unlock → sendEvm` flow (now that `sendEvm` exists) against the fixed all-zero test vault, and re-assert that NO captured request body contains the known mnemonic / entropy hex / derived private-key hex (allowing the signed raw tx). Run `pnpm vitest run test/no-secret-to-fetch.test.ts` → PASS.
- [ ] **Step 7: Implement the swap MOCK stub.** `import "client-only";` `getSwapQuote` returns a `MockQuote` with `label:"TESTNET MOCK"` whenever `!isMainnet` (import from `@/lib/config/chain`); on mainnet, `throw new Error("LI.FI/0x integration lands in a later wave")` (thin stub — no real execution this wave). Add a tiny test asserting the testnet mock shape. Run → PASS.
- [ ] **Step 8: Quality gate + commit.** Full chain. Commit: "Wave 3 Task 6: send (EVM EIP-1559 + ERC-20, Solana), receive+QR, BTC receive-only, swap testnet-mock" + trailer.

---

### Task 7 — External connect (wagmi/viem providers) + client SIWE integration

Wire wagmi v2 + viem + react-query and integrate the Wave 2 SIWE server flow for external wallets. Providers mount only in interactive subtrees.

**Files**
- Modify: `package.json` (add `wagmi @tanstack/react-query` exact)
- Create: `lib/wallet/external/wagmi.ts`
- Create: `lib/wallet/external/siwe.ts`, `lib/wallet/external/siwe.test.ts`
- Create: `components/providers/QueryProvider.tsx`, `components/providers/WagmiProvider.tsx`, `components/providers/AppProviders.tsx`

**Interfaces**
- Produces (`lib/wallet/external/wagmi.ts`):
  ```ts
  import type { Config } from "wagmi";
  export function makeWagmiConfig(): Config; // chains from activeChain().evm; connectors injected/walletConnect/coinbaseWallet
  ```
- Produces (`lib/wallet/external/siwe.ts`):
  ```ts
  export function buildSiweMessage(address: string, nonce: string, chainId: number): string; // domain+uri from NEXT_PUBLIC_APP_URL
  export async function connectAndAuthenticate(
    signMessage: (msg: string) => Promise<string>, address: string,
    // NOTE: no chainId param — the message chainId is FORCED to activeChain().primaryChainId internally,
    // because the Wave 2 server allow-lists ONLY the primary chainId. (Or the CALLER useSwitchChain()s to
    // primary before signing and passes it; either way the signed message chainId MUST be the primary.)
  ): Promise<{ ok: boolean; next?: string }>; // GET /nonce → build (primary chainId) → sign → POST /verify
  ```

Steps:

- [ ] **Step 1: Add deps + verify.** `pnpm add --save-exact wagmi @tanstack/react-query`. Verify wagmi v2 API: `node -e "const w=require('wagmi'); console.log(typeof w.createConfig)"` and connectors: `node -e "const c=require('wagmi/connectors'); console.log(Object.keys(c))"` (confirm `injected`, `walletConnect`, `coinbaseWallet`). Confirm the installed major is v2.
- [ ] **Step 2: Write failing client-SIWE test.** Create `lib/wallet/external/siwe.test.ts` (`// @vitest-environment node`): stub `fetch` for `GET /api/auth/siwe/nonce` (returns `{nonce}`) and `POST /api/auth/siwe/verify` (returns `{ok:true,next:"/dashboard"}`); assert `buildSiweMessage` produces a message whose `domain` = host of `NEXT_PUBLIC_APP_URL` and `uri` = its origin (parse with `new SiweMessage`). **chainId assertion (guards the Wave 2 allow-list mismatch):** call `connectAndAuthenticate` while the connected wallet is on a NON-primary chain (e.g. pass/simulate chainId 1 or 42161) and assert the message actually POSTed to `/verify` has `chainId === activeChain().primaryChainId` (parse the posted `message` with `new SiweMessage` and check `.chainId`) — proving the client forces the primary chainId, not the connected one. Also assert `connectAndAuthenticate` calls verify with a signature from the provided `signMessage` and returns `{ok:true,next:"/dashboard"}`. Run → FAIL.
- [ ] **Step 3: Implement `siwe.ts`.** `import "client-only";` `buildSiweMessage` uses `siwe` `SiweMessage` with `domain = new URL(NEXT_PUBLIC_APP_URL).host`, `uri = new URL(NEXT_PUBLIC_APP_URL).origin`, `version:"1"`, `chainId`, `nonce`, `issuedAt`. `connectAndAuthenticate` GETs the nonce, then **FORCES `chainId = activeChain().primaryChainId`** (import from `@/lib/config/chain`) when building the message — NEVER the connected wallet's chainId — because the Wave 2 server allow-lists only the primary id (see `lib/auth/siwe.ts` `ALLOWED_CHAIN_IDS`). (If the connected wallet is on a non-primary chain, the UI SHOULD `useSwitchChain` to primary first for a truthful message, but the signed message chainId MUST be the primary regardless.) It then builds + calls `SiweMessage.prepareMessage()`, `signMessage(prepared)` (EIP-191 `personal_sign` — exactly what `siwe.verify` expects), POSTs `{message,signature}` to `/api/auth/siwe/verify` (with `credentials:"include"` so the session cookie is set), returns the JSON. This matches the Wave 2 `verifySiwe` domain/uri/chainId checks exactly — do NOT change the server. Run → PASS.
- [ ] **Step 4: Implement `wagmi.ts`.** `import "client-only";` `makeWagmiConfig()` → `createConfig({ chains: activeChain().evm.map(e=>e.viemChain) as [Chain,...Chain[]], connectors: [injected(), walletConnect({ projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID! }), coinbaseWallet({ appName: "CryptRepublic" })], transports: Object.fromEntries(activeChain().evm.map(e=>[e.chainId, http(\`/api/rpc/${e.chainId}\`)])) })`. Typecheck.
- [ ] **Step 5: Implement the provider tree.** `QueryProvider.tsx` (`"use client"`, a single `QueryClient` in `useState`, `QueryClientProvider`); `WagmiProvider.tsx` (`"use client"`, `WagmiProvider config={makeWagmiConfig()}`); `AppProviders.tsx` (`"use client"`, nests `QueryProvider > WagmiProvider > {children}`; the embedded-wallet context is added in Task 8's UI as needed). These are client components importing `lib/wallet/external/*` — allowed (outside the ESLint server scope). Typecheck → PASS.
- [ ] **Step 6: Quality gate + commit.** Full chain. Commit: "Wave 3 Task 7: external connect (wagmi v2 + viem + react-query) + client SIWE integration" + trailer.

---

### Task 8 — CSP/security headers + minimal wallet UI exerciser + Playwright e2e

Add the security headers that host the wallet, and a minimal create/unlock/reveal UI to exercise the subsystem end-to-end. Keep Home + Auth e2e green.

**Files**
- Modify: `next.config.ts` (CSP + security headers; AND `eslint.dirs` to include `config`)
- Create: `app/wallet/page.tsx` (server shell)
- Create: `components/wallet/WalletApp.tsx`, `components/wallet/UnlockWalletModal.tsx` (`"use client"`)
- Create: `e2e/wallet.spec.ts`, `e2e/wallet-csp.spec.ts` (or add CSP/WASM assertions to `wallet.spec.ts`)

**Interfaces**
- Produces (`app/wallet/page.tsx`): server component rendering `<WalletApp/>` inside `<AppProviders/>`.
- Produces (`components/wallet/WalletApp.tsx`): `"use client"` — buttons for Create / Lock / Unlock / Reveal; shows the derived EVM/Solana/BTC addresses (public) + a receive QR; wires `session.ts` + `receive.ts`; carries the honest-limitation warning copy.

Steps:

- [ ] **Step 0: Make `next lint` lint the `config/` dir.** `next lint` by default only lints `pages/app/components/lib` — it does NOT lint the root `config/` dir, so the Task 4 ESLint import-boundary rule scoped to `config/**` NEVER fires and `config/` ships UNLINTED. In `next.config.ts` set `eslint: { dirs: ["app", "components", "lib", "config"] }` (add `"middleware"` too if `middleware.ts` exists). PROVE it: plant a bad `import "@/lib/wallet/embedded/session"` in a scratch `config/_scratch.ts`, run `pnpm lint`, CONFIRM it FAILS (the config-boundary rule fires under `pnpm lint`, not only for a scratch server file), then remove the scratch file and confirm `pnpm lint` passes.
- [ ] **Step 1: Add CSP/security headers.** In `next.config.ts` add an `async headers()` returning, for all routes, a `Content-Security-Policy` = `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://*.walletconnect.com wss://*.walletconnect.com https://*.walletconnect.org wss://*.walletconnect.org; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`. **`connect-src` correctness:** by design ALL keyed RPC/indexer/BTC reads AND the public fallback go through `/api/*` (Task 1 Step 4 routes `publicFallbackRpc` to `/api/rpc/[chain]`), so `'self'` genuinely covers every read — do NOT add any direct public-RPC origin (if one is ever reintroduced, ENUMERATE its exact origin here). WalletConnect opens BOTH `.com` AND `.org` websockets — include `https://*.walletconnect.com wss://*.walletconnect.com` AND `https://*.walletconnect.org wss://*.walletconnect.org` (the previous draft omitted the `.com` wss). NOTE: `'wasm-unsafe-eval'` is ONLY for the Argon2id WASM; NO general `'unsafe-eval'`. In dev, Next needs `'unsafe-eval'` for HMR — gate the strict `script-src` to `NODE_ENV === "production"` (dev uses a relaxed variant). Document the tradeoff in a comment.
- [ ] **Step 2: Verify headers do not break the app.** `pnpm build` then confirm `pnpm dev` serves Home + Auth without CSP console violations (load `/` and `/auth`, check devtools console). Fix any violation by pinning the exact origin (never widen to `unsafe-inline`/`unsafe-eval` for scripts).
- [ ] **Step 3: Build the minimal wallet UI.** Create `components/wallet/WalletApp.tsx` (`"use client"`): on mount, `hasVault()` → show Unlock else Create; Create prompts a passphrase (min 12), calls `createWallet`, shows the mnemonic ONCE behind the non-dismissible warning + confirm-backed-up; Lock/Unlock/Reveal buttons; render addresses + `receiveQrDataUrl(accounts.evm)`. Create `UnlockWalletModal.tsx` for the unlock prompt (wrong pass → inline error, no oracle). Create `app/wallet/page.tsx` mounting it inside `<AppProviders/>`. Manually verify in `pnpm dev`.
- [ ] **Step 4: Write the Playwright e2e.** Create `e2e/wallet.spec.ts`: navigate `/wallet` → Create with a passphrase → assert 24-word mnemonic shown + addresses render → Lock → assert locked → Unlock with the RIGHT passphrase → assert unlocked + addresses → Lock → Unlock with the WRONG passphrase → assert an "incorrect passphrase" error and still locked → Reveal with the right passphrase → assert the same mnemonic. Use a deterministic passphrase; do NOT assert a specific mnemonic (it is random per run). Run `pnpm e2e e2e/wallet.spec.ts` → PASS.
- [ ] **Step 4b: WASM-under-CSP Playwright assertion (Argon2id path works with prod CSP).** Node/jsdom do NOT enforce CSP, so ONLY a real browser can prove the Argon2id WASM loads under `script-src 'self' 'wasm-unsafe-eval'`. In a Playwright test running against the PRODUCTION build (real CSP active — e.g. `pnpm build && pnpm start`, not `pnpm dev`), create a wallet and assert vault-encrypt SUCCEEDS (mnemonic shown, vault written) with NO `WebAssembly`/CSP CompileError in the console — i.e. the Argon2id (not the fallback) path executed under the live CSP. (Optionally add a second run with `'wasm-unsafe-eval'` removed to CONFIRM the kdf.ts catch degrades to PBKDF2 rather than bricking creation — proving MAJOR-fix #5.)
- [ ] **Step 4c: `/wallet` CSP `connect-src` assertion (connect a mock wallet WITH CSP active).** In a Playwright test against the production build (real CSP), load `/wallet`, connect a MOCK/injected wallet, and assert ZERO `connect-src` (or any CSP) violations in the console/CSP-report — covering the WALLET route + WalletConnect/RPC traffic, not only Home/Auth. Any violation → pin the exact origin in the CSP (never widen scripts to `unsafe-*`).
- [ ] **Step 5: Keep prior e2e green.** Run `pnpm e2e` (Home + Auth + Wallet + WASM/CSP) → all PASS. If CSP broke Auth's SIWE `personal_sign` island, pin the needed origin.
- [ ] **Step 6: Quality gate + commit.** Full chain incl. `pnpm e2e`. Commit: "Wave 3 Task 8: CSP/security headers + minimal wallet UI exerciser + Playwright e2e" + trailer.

---

### Task 9 — Close-out & acceptance checklist (spec §9 Wave 3)

Verify the wave against the spec's acceptance criteria and record any documented follow-ups.

**Files**
- Modify: `.env.example` (final pass), the wave plan doc (append the completed checklist), optionally a short `docs/` note listing follow-ups.

Steps:

- [ ] **Step 1: Run the full CI chain locally.** `pnpm guard:secrets && pnpm format:check && pnpm db:generate && pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm e2e` → all green.
- [ ] **Step 2: Verify each spec §9 Wave 3 acceptance criterion and check it off:**
  - [ ] Vitest wallet round-trip + HD vectors + chain helpers pass (Tasks 2, 3, 5).
  - [ ] Wrong passphrase NEVER decrypts (Task 3 test + Task 4 lifecycle + e2e); the PBKDF2 fallback branch also round-trips (Task 3).
  - [ ] Seed never leaves the client — verified by the ESLint boundary rule (broadened to server actions + `server-only` modules), the static footgun grep, the extended `guard:secrets` app-code scan, AND the AUTHORITATIVE runtime fetch-spy over create→unlock→sendEvm (Task 4/6) and the CSP `connect-src` verified on `/wallet` with a connected mock wallet (Task 8).
  - [ ] Chain-config registry (EVM ETH/Base/Arb/OP/Polygon + Solana + Bitcoin) resolves per env; nothing hardcodes RPC/chainId/token outside `config/` (Task 1).
  - [ ] Balance reads render for a funded testnet wallet — EVM native+ERC-20, Solana, BTC (Task 5). NOTE: a live-testnet balance/send e2e that needs a funded key is a DOCUMENTED follow-up (record it in Step 3), not a v1 blocker.
  - [ ] Base↔other-EVM works — the same read/send path resolves any active EVM chain via the registry (Task 1/5/6).
  - [ ] External connect + SIWE handshake works (Task 7; Auth SIWE e2e stays green).
  - [ ] Keyed RPC proxies live and allow-listed (Task 1).
- [ ] **Step 3: Record documented follow-ups (per spec).** In a short note append: BTC send (PSBT, flagged fast-follow); real LI.FI/0x swap/bridge execution (Wave 6); user-added tokens; multi-account HD; live-testnet funded-key send e2e; $CRYPT/passport token addresses arrive with the Wave 4 contracts registry (the `config/tokens.ts` placeholders get filled then).
- [ ] **Step 4: Confirm the honest-limitation copy is present** in the wallet UI (Task 8) and this plan's Global Constraints (JS zeroization limits; XSS-while-unlocked; device/OS compromise not defended; no server recovery of the vault).
- [ ] **Step 5: Final commit.** "Wave 3 Task 9: close-out — acceptance checklist + documented follow-ups" + trailer.

---

## Acceptance Summary (mirrors spec §9 Wave 3)

Wave 3 is DONE when: the embedded wallet creates/locks/unlocks/reveals with a passphrase (wrong passphrase never decrypts); all key material is provably client-only (ESLint boundary + static test + CSP); the chain-config + token registries are the single source of truth with a one-env-var mainnet flip; keyed RPC/history/BTC proxies are allow-listed and server-only; multi-chain balances (EVM native+ERC-20, Solana, BTC) and send/receive (EVM EIP-1559 + ERC-20, Solana; BTC receive-only; swap testnet-mock) work through the proxies; external connect (wagmi v2) + SIWE handshake works; and the full Vitest + Playwright + CI chain is green with Wave 1/2 suites intact.

---

## Wave 3 — COMPLETED (close-out, Task 9)

Full local CI chain green: `guard:secrets` · `format:check` · `db:generate` · `typecheck` · `lint` · `test` (39 files / 128 tests) · `build` (exit 0) · `e2e` (4 specs: home, auth, wallet, wallet-csp).

### Spec §9 Wave 3 acceptance checklist

- [x] Vitest wallet round-trip + HD vectors + chain helpers pass (Tasks 2, 3, 5).
- [x] Wrong passphrase NEVER decrypts (Task 3 vault test + Task 4 lifecycle + wallet e2e); the PBKDF2 fallback branch also round-trips (Task 3).
- [x] Seed never leaves the client — ESLint boundary rule (server routes/layouts/pages/actions + `server-only` trees + `config/**`), static footgun grep, extended `guard:secrets` app-code scan, AND the AUTHORITATIVE runtime fetch-spy over the FULL create→unlock→**sendEvm**→reveal flow with a fixed all-zero vector vault (mnemonic/entropy/private-key never in any request body; signed raw tx allowed). CSP `connect-src` verified on `/wallet` with a mounted wagmi tree + mock wallet (zero violations).
- [x] Chain-config registry (EVM ETH/Base/Arb/OP/Polygon + Solana + Bitcoin) resolves per env; nothing hardcodes RPC/chainId/token outside `config/` (Task 1).
- [x] Balance reads implemented — EVM native+ERC-20, Solana SOL+SPL, BTC (Task 5). Live-testnet balance/send e2e needs a funded key → DOCUMENTED follow-up (below), not a v1 blocker.
- [x] Base↔other-EVM works — the same read/send path resolves any active EVM chain via the registry (Tasks 1/5/6).
- [x] External connect + client SIWE handshake (chainId forced to `activeChain().primaryChainId`) works; Auth SIWE e2e stays green (Task 7).
- [x] Keyed RPC/history/BTC proxies live and allow-listed, server-only (Task 1).
- [x] CSP/security headers host the wallet: strict `script-src 'self' 'nonce-…' 'wasm-unsafe-eval'` (no general `unsafe-eval`, no script `unsafe-inline`), `frame-ancestors 'none'`, pinned `connect-src`. Argon2id WASM verified working under the live prod CSP; zero CSP violations on Home/Auth/Wallet (Task 8).
- [x] Honest-limitation copy present in the wallet UI (`components/wallet/WalletApp.tsx`) and this plan's Global Constraints (JS zeroization limits; XSS-while-unlocked; device/OS compromise not defended; no server recovery of the vault; vault passphrase is separate from the recoverable web-login passphrase).

### Documented follow-ups (per spec)

- **BTC send** (PSBT signing) — flagged fast-follow; UI shows send disabled in v1 (`BTC_SEND_ENABLED = false`).
- **Real swap/bridge execution** (LI.FI primary / 0x fallback) — Wave 6; this wave ships a testnet MOCK stub only (`lib/wallet/services/swap.ts`).
- **User-added tokens** and **multi-account HD** (index > 0) — future.
- **Live-testnet funded-key send/balance e2e** — needs a funded key + real keyed RPC env vars; unit/integration coverage stands in for now.
- **$CRYPT / passport token addresses** — arrive with the Wave 4 contracts registry; the `config/tokens.ts` `CRYPT` placeholders (address `undefined`, skipped by the balance layer) get filled then.
- **SPL token send** — `sendSolana` covers native SOL transfer; SPL transfer is a follow-up.

### Deviations from the plan (fixed for the installed versions)

- **wagmi pinned to v2 (2.19.5).** The unpinned install first resolved to wagmi 3.x, whose `@wagmi/core` "tempo" module fails the Next/webpack build (`Can't resolve 'accounts'`). v2 is the plan's stated target and builds cleanly; viem stays 2.54.1.
- **Coinbase Wallet connector omitted.** Coinbase Wallet SDK v4 injects an inline analytics `<script>` at init and beacons a deviceId to `cca-lite.coinbase.com`, violating the strict `script-src` (no `unsafe-inline`), the pinned `connect-src`, and the privacy posture. `injected()` still surfaces the Coinbase browser extension; mobile Coinbase Wallet is reachable via WalletConnect.
- **CSP delivered via `middleware.ts` (not `next.config.ts headers()`).** A strict nonce-based `script-src` needs a per-request nonce, which `headers()` cannot mint. `app/layout.tsx` sets `export const dynamic = "force-dynamic"` so Next applies the request-time nonce to its inline bootstrap/RSC scripts (statically prerendered HTML bakes those scripts without a nonce and would be blocked). Tradeoff: loses full static prerender — the accepted cost of a strict CSP that safely hosts the wallet.
- **EVM ERC-20 balances via per-token `readContract` (not `multicall`).** Token symbol/decimals live in `config/tokens.ts` (the registry is authoritative), so only on-chain `balanceOf` is needed — one `eth_call` per token, fewer round-trips than a 3-call multicall and trivially stubbable in tests.
- **Optional-dep build warnings silenced** via `next.config.ts` webpack aliases (`@react-native-async-storage/async-storage`, `pino-pretty` → false). A residual "Critical dependency" warning originates in viem's `ox` dependency (pre-existing, non-fatal, exit 0).
