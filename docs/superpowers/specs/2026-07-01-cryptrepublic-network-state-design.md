# CryptRepublic — Full-Stack + Web3 Design Specification

CryptRepublic is a virtual "network state" web application in which users create an account, apply for citizenship, mint a soulbound passport NFT on a real EVM chain, and operate a non-custodial multi-chain wallet tied to that identity — alongside governance, treasury, sovereign-holdings/dividends, population/census, and embassy screens. This document specifies how the existing static design mockups (`Home.html`, `Auth.html`, `Dashboard.html` + `dash-*.jsx`, `Mobile.html`) are ported into one real full-stack product: a single Next.js (App Router) + TypeScript application serving marketing, the eight authenticated dashboard screens, the four-step mint flow, both wallet modes, and the backend API, plus an in-repo Foundry workspace of six Solidity contracts. The governing operating model is **build mainnet-ready, validate fully on a public testnet, and hand the user the keys**: contracts target **Base** (mainnet) / **Base Sepolia** (testnet, config-swappable to other EVM chains); the build is non-custodial throughout; and the build assistant never handles private keys, seed phrases, or real funds and never deploys mainnet — the user deploys and signs all real-money transactions.

---

## 1. Goals & Non-Goals

### Goals

- **One deployable application.** Next.js App Router + TypeScript delivering marketing site, the eight dashboard screens, the four-step mint flow, both wallet modes, and the backend API/DB access, with an in-repo Foundry contracts workspace.
- **Real identity on a real chain.** A soulbound (non-transferable) ERC-721 passport minted on Base / Base Sepolia, gated by EIP-712 witness attestations from existing citizens (with a genesis-attestor bootstrap), where `tokenId` = sequential citizen number.
- **All eight screens wired to live data.** Citizen home, Constitution & votes (governance), Treasury, Population (census + world map), Your passport, Sovereign holdings (dividends), Embassies, and Wallet & chain — every screen reads live on-chain state and backend/DB content, with **no** surviving hardcoded mock data.
- **Both wallet modes, non-custodial.** (a) An embedded browser-generated BIP-39 HD wallet encrypted under the user's passphrase (WebCrypto AES-GCM + a memory-hard KDF), stored client-side in IndexedDB, never sent to the server; and (b) external connect via wagmi + viem (MetaMask / WalletConnect) authenticated with SIWE (EIP-4361).
- **Multi-chain wallet v1.** EVM (Ethereum, Base, Arbitrum, Optimism, Polygon) full support — native + ERC-20 balances, send, receive, curated token list, QR, tx history; Solana (balances, send, receive); Bitcoin (balances, receive; send is a flagged fast-follow); swap/bridge via a third-party aggregator (LI.FI primary, 0x fallback) executed through the user's own signature (mainnet-mostly; on testnet limited/mocked and clearly marked).
- **Dual authentication.** Email + passphrase (Argon2id hashing, httpOnly cookie sessions) and SIWE (EIP-4361), sharing one non-custodial identity model.
- **Six audited-ready contracts.** `CryptRepublicPassport`, `CryptToken` ($CRYPT ERC-20), `CryptGovernance` (passport-gated, 1-citizen-1-vote), `CryptTreasury`, `DividendDistributor`, `CryptStaking`, built and tested with Foundry.
- **Config-swappable chain.** No hardcoded RPC URL, chainId, or contract address anywhere; a single environment switch (`NEXT_PUBLIC_CHAIN_ENV`) plus an address book flips the whole app between testnet and mainnet, or to another EVM chain.
- **Security rigor as a first-class property.** Server never stores private keys, seed phrases, or plaintext passwords; the wallet subsystem is designed so a total backend compromise leaks zero spendable secrets; contracts follow checks-effects-interactions, reentrancy guards, and on-chain invariant enforcement.

### Non-Goals

- **No self-run L2 / own chain.** We deploy to Base (EVM); we do not operate rollup or validator infrastructure. Mockup chrome implying a "CryptRepublic L2 / chain id 7331" is remapped to the configured Base network.
- **No custody.** The server holds no keys/seeds/plaintext passwords; the assistant signs no mainnet transactions and funds no accounts.
- **No real KYC/AML provider in v1.** Explicitly deferred, and flagged **REQUIRED before public mainnet** (schema field `CitizenshipApplication.kycStatus` exists to carry it).
- **No native mobile app.** Responsive web + the existing mobile design (`Mobile.html`) only.
- **No Bitcoin send in v1.** Balances + receive only; send is a flagged fast-follow (PSBT construction / coin selection deferred).
- **No production swap/bridge on testnet.** Testnet swap/bridge is limited or mocked and clearly marked; real aggregator execution is mainnet-mostly via the user's own signature.
- **No token/dividend economics tuning, i18n, advanced analytics, admin CMS, or speculative upgradeability** in v1 (prefer immutable contracts; see §6).
- **Legal characterization is out of build scope but blocking.** $CRYPT as a dividend-bearing token is very likely a regulated security — a standing legal flag (see §10), not a build deliverable.

---

## 2. Architecture & Project Structure

### 2.1 High-level shape

One deployable Next.js app (marketing + dashboard + API + DB access) plus a self-contained Foundry project for smart contracts. The Foundry build emits ABIs + deployed-address JSON that the TypeScript app consumes through a generated, typed contracts layer. There is exactly one source of truth for chain configuration, and "go to mainnet" is a single environment change (`NEXT_PUBLIC_CHAIN_ENV=mainnet`) plus a mainnet address book — no code edits.

```
cryptrepublic/
├── app/                       # Next.js App Router (routes = folders)
├── components/                # Shared React components (ported from mockups)
├── lib/                       # Framework-agnostic modules (wallet, chains, contracts, auth, db)
├── contracts/                 # Foundry workspace (Solidity, tests, deploy scripts)
├── prisma/                    # Schema, migrations, seed
├── styles/                    # Ported design system (government-issue theme)
├── config/                    # Typed runtime config (chains, addresses, features)
├── generated/                 # Build artifacts: contract ABIs + types (gitignored, regenerated)
├── public/                    # Static assets (fonts, seal SVG, images)
├── scripts/                   # Dev/ops scripts (sync-abis, seed, wait-for-anvil)
├── test/                      # Vitest unit/integration
├── e2e/                       # Playwright end-to-end
└── (config files: next.config.ts, tsconfig.json, .env.example, etc.)
```

### 2.2 Full directory tree

```
cryptrepublic/
│
├── app/
│   ├── layout.tsx                      # Root layout: fonts, <html>, theme vars, providers shell
│   ├── page.tsx                        # Marketing landing (Home.html port) — Server Component
│   ├── globals.css                     # Imports styles/tokens.css + base
│   ├── manifest.ts                     # PWA manifest (mobile build)
│   │
│   ├── (marketing)/                    # Route group — public marketing chrome + teaser pages
│   │   ├── layout.tsx                  # Marketing chrome (nav, footer) — Server Component
│   │   ├── holdings/page.tsx           # Public "Sovereign holdings" teaser
│   │   ├── governance/page.tsx         # Public governance teaser
│   │   ├── embassies/page.tsx          # Public embassy directory
│   │   └── population/page.tsx         # Public census / world map teaser
│   │
│   ├── auth/                           # Auth.html port
│   │   ├── layout.tsx                  # Minimal auth chrome
│   │   ├── page.tsx                    # Sign-in / register tabs (Server) + AuthForm (Client)
│   │   ├── sign-in/page.tsx
│   │   ├── register/page.tsx           # On success → /dashboard/mint
│   │   └── connect/page.tsx            # Wallet-connect + SIWE (Client-only island)
│   │
│   ├── dashboard/                      # Authenticated app — Dashboard.html + dash-*.jsx ports
│   │   ├── layout.tsx                  # Session guard (server), sidebar, WalletProvider mount
│   │   ├── page.tsx                    # Citizen home (dash-home.jsx)
│   │   ├── governance/page.tsx         # Constitution & votes (dash-gov-treasury.jsx)
│   │   ├── treasury/page.tsx           # Treasury (dash-gov-treasury.jsx)
│   │   ├── population/page.tsx         # Census + world map (dash-population-embassies.jsx)
│   │   ├── passport/page.tsx           # Your passport
│   │   ├── holdings/page.tsx           # Sovereign holdings / dividends (dash-holdings.jsx)
│   │   ├── embassies/page.tsx          # Embassies (dash-population-embassies.jsx)
│   │   ├── embassies/[code]/page.tsx   # Embassy detail
│   │   ├── wallet/                     # Wallet & chain — heavy client island
│   │   │   ├── page.tsx                # Shell (Server) → mounts <WalletApp/> (Client)
│   │   │   ├── send/page.tsx
│   │   │   ├── receive/page.tsx
│   │   │   ├── swap/page.tsx           # LI.FI/0x quote+execute (client sign)
│   │   │   ├── bridge/page.tsx
│   │   │   └── stake/page.tsx
│   │   └── mint/page.tsx               # 4-step mint flow (dash-mint.jsx): Attest→Oath→7 Witnesses→Seal
│   │
│   └── api/                            # Route Handlers (server-only) — full inventory in §4
│       ├── auth/…                      # register, login, logout, session, csrf, siwe/*, wallets/*, sessions/*
│       ├── citizens/…                  # me, [handle], directory
│       ├── applications/…              # attest, oath, witnesses/*, seal/*
│       ├── passport/…                  # metadata/[tokenId], [tokenId]/witnesses
│       ├── governance/…                # proposals, proposals/[id], vote/prepare, participation
│       ├── treasury/…                  # overview, flows, dividends/*
│       ├── holdings/…                  # assets, summary, dividends
│       ├── embassies/…                 # directory, [code]/stats, [code]/events, proposals
│       ├── population/…                # census, timeline, geo, top-cities
│       ├── stats/…                     # summary, activity, census, inductions
│       ├── chain/…                     # config, balances, tx-history, stats, swap/quote, bridge/quote
│       ├── rpc/[chain]/route.ts        # allow-listed JSON-RPC proxy (keys server-side)
│       ├── rpc/solana/route.ts
│       ├── btc/…                       # balance, utxos, tx/[id]
│       ├── constitution/route.ts
│       └── health/route.ts
│
├── components/
│   ├── ui/                             # Primitives (government-issue): Card, StatTile, Tag, LiveNumber,
│   │                                   #   PassportPreview, NavIcon, Wordmark, Spark, FormField, Seal,
│   │                                   #   Button, Field, DataTable, StatBlock, Badge, Modal, Tabs, QRCode, TxButton
│   ├── marketing/                      # SiteHeader, HeroPassport3D, LiveTicker, PillarsGrid, HoldingsStrip,
│   │                                   #   GovernanceStrip, EmbassiesStrip, CensusCounter, FinalCTA, SiteFooter
│   ├── dashboard/                      # Sidebar, Topbar, MobileNavDrawer, ProposalCard, DividendPanel,
│   │                                   #   CensusMap, EmbassyGrid, PassportCard, WalletStatusChip
│   ├── wallet/                         # AssetRow/TokenList, SendModal, ReceiveModal, SwapModal, BridgeModal,
│   │                                   #   StakeModal, ActivityLedger, ChainSwitcher, UnlockWalletModal ("use client")
│   ├── mint/                           # MintStepper, MintAttestStep, MintOathStep, MintWitnessStep (WitnessTile),
│   │                                   #   MintSealStep (SealingAnimation), MintSealedReceipt, MintPassportDraft
│   └── providers/                      # Client provider tree (see §2.7)
│       ├── AppProviders.tsx            # "use client" — wraps Wagmi + QueryClient + Wallet + Session
│       ├── WagmiProvider.tsx
│       ├── QueryProvider.tsx
│       ├── EmbeddedWalletProvider.tsx  # IndexedDB/WebCrypto vault context
│       └── ThemeProvider.tsx           # typed ThemeTokens context (useTokens())
│
├── lib/
│   ├── chains/
│   │   ├── index.ts                    # Assembles active chain set from config; useChainInfo() source
│   │   ├── evm.ts                      # viem chain defs (Base, Ethereum, Arbitrum, Optimism, Polygon)
│   │   ├── solana.ts                   # @solana/web3.js connection factory
│   │   ├── bitcoin.ts                  # bitcoinjs-lib / @scure/btc-signer network + address derivation
│   │   └── explorers.ts               # Block-explorer URL builders per network (BaseScan et al.)
│   │
│   ├── contracts/
│   │   ├── addresses.ts                # Address book per contract per network (from config)
│   │   ├── abis.ts                     # Re-exports generated ABIs from /generated
│   │   ├── clients.ts                  # viem publicClient/walletClient factories
│   │   ├── passport.ts                 # Typed read/write helpers — CryptRepublicPassport
│   │   ├── cryptToken.ts               # Typed helpers — CryptToken ($CRYPT ERC-20)
│   │   ├── governance.ts               # Typed helpers — CryptGovernance
│   │   ├── treasury.ts                 # Typed helpers — CryptTreasury
│   │   ├── dividends.ts                # Typed helpers — DividendDistributor
│   │   ├── staking.ts                  # Typed helpers — CryptStaking
│   │   └── witness.ts                  # EIP-712 attestation domain/types + verify helpers
│   │
│   ├── wallet/                         # CLIENT-ONLY (no server import allowed — see §2.6)
│   │   ├── embedded/
│   │   │   ├── mnemonic.ts             # BIP-39 gen/validate/entropy (@scure/bip39)
│   │   │   ├── derive.ts               # HD derivation per chain (EVM/Solana/BTC paths)
│   │   │   ├── vault.ts                # encrypt/decrypt vault blob (WebCrypto AES-GCM)
│   │   │   ├── kdf.ts                  # Argon2id (WASM) / PBKDF2 fallback key derivation
│   │   │   ├── storage.ts             # IndexedDB persistence of encrypted vault (idb)
│   │   │   └── session.ts             # unlock/lock lifecycle, in-memory key holder
│   │   ├── external/
│   │   │   ├── wagmi.ts                # wagmi config, connectors
│   │   │   └── siwe.ts                 # SIWE message build (verify is server-side)
│   │   ├── services/
│   │   │   ├── balances.ts            # multi-chain balance reads (native + ERC-20 + SPL + BTC)
│   │   │   ├── send.ts                # build/sign/broadcast transfers (EVM/SOL; BTC receive-only v1)
│   │   │   ├── history.ts             # tx history via indexer adapters
│   │   │   └── swap.ts                # LI.FI/0x quote → user-signed execution
│   │   └── passport/link.ts           # passport SBT + $CRYPT surfacing in wallet
│   │
│   ├── auth/                           # SERVER-ONLY
│   │   ├── password.ts                 # Argon2id hash/verify
│   │   ├── session.ts                  # opaque DB-backed session create/read/destroy (httpOnly)
│   │   ├── siwe.ts                     # EIP-4361 nonce + verify (siwe/viem)
│   │   ├── guard.ts                    # requireSession() / requireCitizen() / requireAdmin()
│   │   └── nonceStore.ts               # SIWE nonce persistence (DB, short TTL)
│   │
│   ├── db/                             # SERVER-ONLY
│   │   ├── client.ts                   # Prisma singleton (dev-safe global)
│   │   └── repositories/               # citizens.ts, proposals.ts, embassies.ts, assets.ts
│   │
│   ├── indexer/                        # SERVER-ONLY — chain-stat aggregation & caching
│   │   ├── stats.ts                    # citizen count, treasury, supply
│   │   └── history.ts                  # tx history provider adapters
│   │
│   ├── validation/                     # Shared (server + client) — Zod schemas
│   │   ├── auth.ts  proposals.ts  wallet.ts  profile.ts
│   │
│   └── utils/                          # format.ts, address.ts, units.ts, errors.ts
│
├── config/
│   ├── env.ts                          # SERVER env, parsed + validated by Zod at boot
│   ├── env.public.ts                   # NEXT_PUBLIC_* only, safe for client bundle
│   ├── chains.config.ts                # Typed CHAINS map keyed by CHAIN_ENV (testnet|mainnet)
│   ├── addresses.testnet.ts            # Base Sepolia deployed addresses (committed)
│   ├── addresses.mainnet.ts            # Base mainnet addresses (filled at user deploy time)
│   ├── tokens.ts                       # Curated token lists per network
│   └── features.ts                     # Feature flags (btcSend=false, swapMocked-on-testnet, KYC gate)
│
├── contracts/                          # FOUNDRY WORKSPACE (independent build)
│   ├── foundry.toml
│   ├── remappings.txt
│   ├── src/
│   │   ├── CryptRepublicPassport.sol   # Soulbound ERC-721 (non-transferable)
│   │   ├── CryptToken.sol              # $CRYPT ERC-20
│   │   ├── CryptGovernance.sol         # Passport-gated 1-citizen-1-vote
│   │   ├── CryptTreasury.sol
│   │   ├── DividendDistributor.sol     # Per-citizen claimable
│   │   ├── CryptStaking.sol            # Validator pool
│   │   ├── lib/WitnessAttestation.sol  # EIP-712 verify + genesis-attestor role
│   │   ├── lib/Roles.sol               # bytes32 role constants
│   │   └── interfaces/                 # IPassport, etc.
│   ├── test/                           # Foundry tests (*.t.sol)
│   ├── script/
│   │   ├── Deploy.s.sol                # Full deploy; writes broadcast/ address JSON
│   │   ├── Configure.s.sol             # Wire roles/addresses post-deploy
│   │   └── SeedGenesis.s.sol           # Bootstrap genesis attestor(s)
│   ├── broadcast/                      # Foundry run artifacts (deployed addresses per chainId)
│   └── out/                            # Compiled ABIs (source for sync-abis)
│
├── generated/                          # gitignored — `pnpm sync:abis` output
│   ├── abis/*.ts                       # ABI consts (as const) for viem typing
│   └── addresses.generated.ts          # Merged from broadcast/ + config address books
│
├── prisma/
│   ├── schema.prisma                   # datasource: SQLite (dev) / Postgres (prod)
│   ├── migrations/
│   └── seed.ts                         # Embassies, asset catalog, constitution, demo citizens (public only)
│
├── styles/
│   ├── tokens.css                      # CSS variables: palette, radius:0, spacing, type scale
│   ├── theme.css                       # Government-issue component styles
│   └── fonts.ts                        # next/font: Archivo (sans) + IBM Plex Mono (mono) + display fonts
│
├── public/
│   ├── seal/cr-seal.svg                # Octagonal CR seal
│   └── img/…                           # Ported mockup imagery
│
├── scripts/
│   ├── sync-abis.ts                    # contracts/out + broadcast → generated/
│   ├── wait-for-anvil.ts
│   └── check-env.ts                    # Fails build if required env missing per CHAIN_ENV
│
├── test/                               # Vitest (lib/, config/, api handler units)
├── e2e/                                # Playwright (auth, mint, wallet flows against testnet)
│
├── next.config.ts
├── tsconfig.json                       # path aliases: @/lib, @/config, @/components, @/generated
├── vitest.config.ts
├── playwright.config.ts
├── .env.example
├── package.json
└── pnpm-lock.yaml
```

> **Route-group note.** The canonical landing page is `app/page.tsx`; the `(marketing)` group holds the secondary public teaser pages and shared marketing chrome. Route groups (`(marketing)`) do not affect URLs — they only scope layout. `/auth` and `/dashboard` are their own segments with their own layouts (unauth chrome vs. session-guarded app shell).

### 2.3 Dependencies

Managed with **pnpm**. "Where" indicates the boundary the package is allowed to cross.

**Core framework:** `next`, `react`, `react-dom`, `typescript`, `zod` (runtime validation of env, API input, and form schemas — both boundaries).

**Web3 / EVM:** `viem` (typed RPC, ABI encoding, public/wallet clients, EIP-712 — reads on both boundaries, signing client-only); `wagmi` v2 (React hooks for external connect / account state — **client-only**); `@tanstack/react-query` (async cache for wagmi + wallet/balances/quotes — **client-only**); `siwe` (EIP-4361 — verify server-side, build client-side); `@lifi/sdk` primary / `@0x/swap-ts-sdk` fallback (swap/bridge quotes + route building, executed by user signature — quote proxy server-side, execute client-side).

**Non-EVM chains:** `@solana/web3.js`, `@solana/spl-token` (Solana balances/send/receive — reads both, sign/send client-only); `bitcoinjs-lib` + `@scure/btc-signer` (BTC network params, address derivation for receive — client; send flagged off in v1); `@scure/bip39`, `@scure/bip32`, `ed25519-hd-key` (audited HD derivation primitives — **client-only**).

**Auth / DB:** `argon2` (Argon2id passphrase hashing — **server-only**, native; swap to `@node-rs/argon2` if the target can't build native deps); opaque DB-backed sessions implemented in `lib/auth/session.ts` (**server-only**, see §4); `@prisma/client` (**server-only**) + `prisma` CLI.

> **Auth choice.** We use **opaque DB-backed sessions** (not JWT, and not `next-auth`): we need custom dual auth (email+passphrase and SIWE) over a non-custodial identity model, plus instant server-side revocation. A thin sealed httpOnly cookie carrying a random token whose SHA-256 hash is stored in the DB keeps the surface small; `next-auth` is heavier than needed here.

**Design / UI:** `next/font` (self-host Archivo + IBM Plex Mono and the display faces, zero layout shift); `qrcode` / `qrcode.react` (receive-address QR); `clsx`.

**Tooling / test:** `vitest`, `@vitest/coverage-v8`; `@playwright/test` (+ `@synthetixio/synpress` or a mock connector for MetaMask flows); `foundry` (`forge`, `anvil`, `cast` — system, not npm); `tsx`; `eslint`, `prettier`; `slither`, `solhint` for contract static analysis.

> **Native-module note.** `argon2` compiles native bindings — pin the runtime (Node 20 LTS) and keep it strictly server-side; it must never appear in a client bundle.

### 2.4 Typed chain-config module

`config/chains.config.ts` is the single source of truth. It exports a `CHAINS` record keyed by `CHAIN_ENV` (`"testnet" | "mainnet"`), and the app reads only the active entry via `activeChain()`. Nothing else in the codebase hardcodes an RPC URL, chainId, or contract address.

```ts
// config/chains.config.ts (shape — illustrative)
import { base, baseSepolia, mainnet, arbitrum, optimism, polygon } from 'viem/chains'
import { addressesTestnet } from './addresses.testnet'
import { addressesMainnet } from './addresses.mainnet'

export type ChainEnv = 'testnet' | 'mainnet'

export interface ContractAddresses {
  passport: `0x${string}`
  cryptToken: `0x${string}`
  governance: `0x${string}`
  treasury: `0x${string}`
  dividendDistributor: `0x${string}`
  staking: `0x${string}`
}

export interface ChainProfile {
  primary: typeof base            // where CR contracts live (Base / Base Sepolia)
  evm: readonly [/* base, ethereum, arbitrum, optimism, polygon */]
  rpc: Record<number, string>     // chainId → RPC URL (server: private; public: fallback)
  explorers: Record<number, string>
  addresses: ContractAddresses    // CR contracts on `primary`
  solanaCluster: 'mainnet-beta' | 'devnet'
  bitcoinNetwork: 'mainnet' | 'testnet'
}

export const CHAINS: Record<ChainEnv, ChainProfile> = {
  testnet: {
    primary: baseSepolia,
    evm: [baseSepolia /* + sepolia counterparts */],
    rpc: { [baseSepolia.id]: process.env.RPC_BASE_SEPOLIA! /* … */ },
    explorers: { [baseSepolia.id]: 'https://sepolia.basescan.org' },
    addresses: addressesTestnet,
    solanaCluster: 'devnet',
    bitcoinNetwork: 'testnet',
  },
  mainnet: {
    primary: base,
    evm: [base, mainnet, arbitrum, optimism, polygon],
    rpc: { [base.id]: process.env.RPC_BASE! /* … */ },
    explorers: { [base.id]: 'https://basescan.org' },
    addresses: addressesMainnet,
    solanaCluster: 'mainnet-beta',
    bitcoinNetwork: 'mainnet',
  },
}

export const activeChain = () =>
  CHAINS[(process.env.NEXT_PUBLIC_CHAIN_ENV ?? 'testnet') as ChainEnv]
```

Because `primary` is config-driven and the whole `evm` set is a list, swapping Base for another EVM chain is editing this file's chain refs + address book — no consumer changes. `lib/contracts/addresses.ts` and `lib/chains/index.ts` read exclusively from `activeChain()`.

### 2.5 Environment variables

Split strictly by exposure. `config/env.ts` (server) and `config/env.public.ts` (client) each parse with Zod at startup and **throw on missing/invalid** (`scripts/check-env.ts` runs in `prebuild`).

**Public (`NEXT_PUBLIC_*`, shipped to browser — never secret):**

```
NEXT_PUBLIC_CHAIN_ENV=testnet            # master switch: testnet | mainnet
NEXT_PUBLIC_APP_URL=https://…            # SIWE domain/uri, canonical origin
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=…   # WalletConnect project id (public by design)
NEXT_PUBLIC_RPC_BASE_SEPOLIA=…           # public read RPC fallback (client)
NEXT_PUBLIC_RPC_BASE=…                   # public read RPC fallback (client, mainnet)
NEXT_PUBLIC_SOLANA_RPC=…                 # public Solana read endpoint
NEXT_PUBLIC_FEATURE_BTC_SEND=false
```

**Server-only (never prefixed, never bundled):**

```
DATABASE_URL=…                           # Postgres (prod) / file: (dev SQLite)
SESSION_SECRET=…                         # session cookie encryption key (32+ bytes)
RPC_BASE_SEPOLIA=…  RPC_BASE=…           # private/keyed RPC (Alchemy/Infura/QuickNode)
RPC_ETHEREUM=… RPC_ARBITRUM=… RPC_OPTIMISM=… RPC_POLYGON=…
INDEXER_API_KEY=…                        # tx-history provider (Etherscan v2 multichain)
LIFI_API_KEY= / ZEROX_API_KEY=…          # swap/bridge aggregator keys (proxied, never client)
```

> **No key material, ever.** There is no `PRIVATE_KEY`, no `MNEMONIC`, no deployer secret in the app's env. Deployment private keys live only in the user's local Foundry/`cast`/hardware-wallet environment when *they* deploy. The server holds none of it. Embedded-wallet seeds exist only in the browser (WebCrypto/IndexedDB) and never reach the server.

**The "flip to mainnet"** is a single change: set `NEXT_PUBLIC_CHAIN_ENV=mainnet`, ensure `config/addresses.mainnet.ts` is populated (the user pastes the addresses their mainnet deploy produced), and point the server private RPC vars at mainnet endpoints. No code path branches on a hardcoded chain; testnet-specific behavior (mocked/limited swap+bridge, disabled BTC send) is gated by `config/features.ts` derived from `CHAIN_ENV`, and any such affordance renders with an explicit "TESTNET"/"SIMULATED" marker.

### 2.6 Rendering strategy & client/server boundary

**Default is Server Components.** Read-heavy, non-interactive surfaces render on the server and stream:

- **Marketing** (`app/page.tsx`, `(marketing)/*`) — Server Components; mostly static with ISR/`revalidate` for the live ticker and stats blocks. The hero's 3D passport is a small `"use client"` island inside an otherwise server-rendered page.
- **Dashboard read screens** (governance, treasury, population, holdings, embassies, passport, citizen home) — Server Components that fetch through `lib/db` + `lib/indexer` + `lib/contracts` read helpers (viem `publicClient` on the server, using private RPCs). Interactive bits (vote, claim) are client islands receiving server-fetched data as props.

**Client Components (`"use client"`) — mandatory where interactivity or key material lives:** everything under `lib/wallet/` and `components/wallet/`; wagmi / react-query / WalletConnect; the mint flow, swap/bridge/stake panels, send form, SIWE connect.

Boundary enforcement:

| Concern | Boundary | Enforcement |
|---|---|---|
| Passphrase hashing (`argon2`) | server-only | `import 'server-only'` in `lib/auth/password.ts` |
| Prisma / DB | server-only | `import 'server-only'` in `lib/db/client.ts` |
| Private RPC URLs, aggregator keys | server-only | non-`NEXT_PUBLIC_` env, read only in Route Handlers/RSC |
| Embedded wallet seed / signing | client-only | `import 'client-only'`, `"use client"`, ESLint no-server-import rule forbidding `lib/wallet` imports from `app/**/route.ts` and server files |
| Session sealing | server-only | `SESSION_SECRET` server env; guards in `lib/auth` |

**Session handling (server/edge):** sessions are opaque DB-backed tokens carried in httpOnly cookies (§4). `middleware.ts` runs a cheap edge presence check (cookie exists → allow, else redirect); full cryptographic verification, revocation checks, and citizen-status checks happen in the Node server layer (guards), because Argon2 and Prisma are Node-only and must not run on the Edge runtime.

### 2.7 Provider tree (client)

Mounted once, high in the interactive subtrees (dashboard + auth/connect), not the static marketing pages:

```
<AppProviders>                     // "use client"
  <QueryProvider>                  // @tanstack/react-query
    <WagmiProvider>                // external wallets, chains from activeChain()
      <EmbeddedWalletProvider>     // IndexedDB vault context, lock/unlock
        <ThemeProvider>            // typed ThemeTokens (useTokens())
          <SessionProvider>        // hydrates server session snapshot
            {children}
```

Server session state is fetched in `dashboard/layout.tsx` (Server Component) and passed as an initial prop into `SessionProvider`, so the client never round-trips just to learn who is logged in.

### 2.8 Local dev workflow

**Prereqs:** Node 20 LTS, pnpm, Foundry (`foundryup`), a Base Sepolia RPC + faucet ETH for the user's own test address. Two supported chain backends: **anvil** (fastest inner loop) and **Base Sepolia** (integration truth — the "validate on a public testnet" mandate).

**Scripted commands (`package.json`):**

```
pnpm chain:anvil        # anvil -p 8545 (local EVM)
pnpm contracts:build    # forge build
pnpm contracts:test     # forge test
pnpm contracts:deploy:anvil     # forge script Deploy.s.sol → local
pnpm contracts:deploy:sepolia   # forge script Deploy.s.sol → Base Sepolia  (USER runs; USER holds key)
pnpm sync:abis          # scripts/sync-abis.ts: contracts/out + broadcast → generated/
pnpm db:migrate         # prisma migrate dev
pnpm db:seed            # prisma db seed  (embassies, asset catalog, constitution, demo citizens)
pnpm dev                # next dev
pnpm test               # vitest
pnpm e2e                # playwright (against Base Sepolia deployment)
pnpm check:env          # fail fast on missing env for current CHAIN_ENV
```

**Cold-start sequence (local):** (1) `pnpm chain:anvil`; (2) `pnpm contracts:deploy:anvil` → writes `contracts/broadcast/`; (3) `pnpm sync:abis` → `generated/`; (4) `pnpm db:migrate && pnpm db:seed`; (5) `pnpm dev`. Dev uses **SQLite** (`DATABASE_URL="file:./dev.db"`); prod uses **Postgres** — the only difference is the `datasource` provider + `DATABASE_URL`. CI runs the Postgres path to catch drift.

> **Deployment boundary reminder.** `contracts:deploy:sepolia` and any mainnet deploy are run by the **user**, who supplies their own key to Foundry/`cast`/a hardware wallet. The build assistant validates against a testnet deployment the user provisions; it never handles keys, funds accounts, or broadcasts real-money transactions.

### 2.9 Design system port (once, shared)

The government-issue theme is ported a single time and consumed everywhere. **Tokens** (`styles/tokens.css`) are the CSS variables extracted verbatim from the mockups' `:root`:

```
--navy:#0a1929; --navy2:#0a2540; --ink:#0f1f33; --blue:#1957d3; --blue-d:#0e3a9b;
--cyan:#00b3e6; --gold:#c8a96a; --gold-d:#9d8246; --paper:#f6f7f9; --card:#ffffff;
--line:#e5eaef; --muted:#5a6a7d; --success:#1f8a5b;
--sans:'Archivo'; --mono:'IBM Plex Mono'; --maxw:1200px;
```

Structural chrome uses squared corners (`border-radius:0`); the mockups' rounded Card radii (6–10px) are preserved exactly as the JSX specifies — porting must not "fix" them. **Fonts** (`styles/fonts.ts`) self-host Archivo (sans/headings, weight 800, `letter-spacing:-.025em`, uppercase kickers) and IBM Plex Mono (all data, addresses, block numbers, labels), plus the display faces the dashboard JSX references (`Newsreader` italic serif headings, `Manrope` big numerals, `JetBrains Mono`), all via `next/font`, exposing `--font-*` CSS variables set on `<html>`. The **octagonal CR seal** ships as `public/seal/cr-seal.svg`, used by `components/ui/Seal.tsx` and the mint `SealingAnimation`. The dashboard's runtime token object (`window.CR_TOKENS()` in the mockup) is ported to a typed `ThemeTokens` context (`useTokens()` = a real `useContext`; the 200ms polling `setInterval` is deleted; default theme `programme`). Recurring mockup patterns are extracted into typed primitives (`Card`, `StatTile`, `Tag`, `LiveNumber`, `PassportPreview`, `NavIcon`, `Wordmark`, `Spark`, `FormField`, plus `Button`, `Field`, `DataTable`, `StatBlock`, `Badge`, `Modal`, `Tabs`, `QRCode`, `TxButton`) reused across marketing, dashboard, wallet, and the mobile responsive build. `Mobile.html`'s responsive rules fold into the same tokens + component set via breakpoints — one theme, one component library, all screens.

---

## 3. (Reserved — see §2)

*Architecture and project structure are covered in full by Section 2. The document proceeds to the data model.*

---

## 4. Data Model, API & Authentication

This section defines the persistence layer, authentication flows, the full HTTP API surface, and the API/auth security posture. **Foundational rule — the server never touches secrets.** The schema is deliberately incapable of holding private keys, seed phrases, or plaintext passwords. The only credential material persisted is an Argon2id password *hash* and short-lived SIWE nonces.

### 4.1 On-chain vs. off-chain: what the DB stores

The database is a **public/profile + cache** store. It is authoritative for off-chain-by-nature content (embassy directory, asset catalogs, census metadata, constitution text, comment/dissent threads, application workflow state) and a **read-through cache** for chain data. The chain is authoritative for anything money- or identity-critical.

| Concern | Source of truth | DB role |
|---|---|---|
| Passport ownership / soulbound status | `CryptRepublicPassport` on Base | Cache `passportTokenId`, `mintedTxHash`, `mintedAt`; re-verify on-chain for gating |
| Citizen count / population total | `totalSupply()` of passport contract | Live read (cached ≤60s) |
| $CRYPT balances, staking positions | Chain / wallet | Never persisted server-side; read live client-side or via `/api/chain/*` proxy |
| Governance proposals & tallies | `CryptGovernance` + events | `GovernanceProposalCache` (indexer-populated, reconciled to chain) |
| Claimable dividends | `DividendDistributor` | `DividendClaimIndex` (cache/index only; claim executed by user signature) |
| Tx history | Chain / RPC / indexer | `TxHistoryCache` (best-effort, non-authoritative) |
| Embassy directory, asset catalog, application flow, constitution | DB | Authoritative |

Any UI element that gates access or displays money is verified **live against the chain** at request time; caches exist only to make screens fast and are always labeled with an `asOf` marker and refreshable.

### 4.2 Prisma schema

```prisma
// prisma/schema.prisma
// datasource: postgresql (prod) / sqlite (dev) — enum→String, Json→String, Decimal→Float in dev

generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"  url = env("DATABASE_URL") }

// ── IDENTITY & AUTH ──────────────────────────────────────────
model User {
  id                 String   @id @default(cuid())
  email              String?  @unique          // nullable: SIWE-only users may have no email
  emailVerified      DateTime?
  passwordHash       String?                    // Argon2id encoded string; NULL for SIWE-only. NEVER plaintext.
  displayName        String?
  role               UserRole @default(CITIZEN)
  status             UserStatus @default(ACTIVE)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  citizenProfile     CitizenProfile?
  linkedWallets      LinkedWallet[]
  sessions           Session[]
  application         CitizenshipApplication?
  attestationsGiven  WitnessAttestation[] @relation("AttestationsGiven")

  @@index([status])
}

enum UserRole { CITIZEN  GENESIS_ATTESTOR  MODERATOR  ADMIN }
enum UserStatus { ACTIVE  SUSPENDED  DELETED }

// A "citizen" = a User who holds a minted soulbound passport.
model CitizenProfile {
  id                   String   @id @default(cuid())
  userId               String   @unique
  user                 User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  passportTokenId      String?  @unique          // uint256 as decimal string; null until minted
  passportChainId      Int?                       // e.g. 8453 (Base) / 84532 (Base Sepolia)
  mintedTxHash         String?
  mintedAt             DateTime?
  handle               String?  @unique           // @citizen-handle
  bio                  String?
  countryOfOrigin      String?                    // ISO-3166 alpha-2, self-declared (census map)
  city                 String?                    // self-declared home city (embassy join)
  avatarUrl            String?
  publicPrimaryAddress String?                    // chosen public address (checksummed)
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
  @@index([passportChainId, passportTokenId])
}

// External wallets (wagmi/SIWE) OR the public address of an embedded wallet.
// Stores ADDRESSES ONLY. No keys, no seed, no encrypted seed blob here.
model LinkedWallet {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  address     String                              // checksummed EVM / base58 SOL / bech32 BTC
  chainFamily ChainFamily
  label       String?
  kind        WalletKind                          // EXTERNAL or EMBEDDED (public addr of client wallet)
  isPrimary   Boolean  @default(false)
  verifiedAt  DateTime?                           // set when SIWE proof of ownership completed
  createdAt   DateTime @default(now())
  @@unique([chainFamily, address])                // an address links to at most one account
  @@index([userId])
}

enum ChainFamily { EVM  SOLANA  BITCOIN }
enum WalletKind  { EXTERNAL  EMBEDDED }

// Opaque DB-backed sessions (NOT JWT — see §4.6).
model Session {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash  String   @unique                     // cookie carries the token; DB stores its SHA-256
  csrfSecret String                               // per-session secret for double-submit CSRF
  ipHash     String?
  userAgent  String?
  createdAt  DateTime @default(now())
  expiresAt  DateTime
  revokedAt  DateTime?
  @@index([userId])
  @@index([expiresAt])
}

model SiweNonce {
  id         String   @id @default(cuid())
  nonce      String   @unique
  address    String?
  purpose    SiwePurpose @default(LOGIN)          // LOGIN vs LINK_WALLET
  userId     String?                              // set for LINK_WALLET (existing session)
  consumedAt DateTime?
  createdAt  DateTime @default(now())
  expiresAt  DateTime                             // ~5 min
  @@index([expiresAt])
}

enum SiwePurpose { LOGIN  LINK_WALLET }

// ── CITIZENSHIP APPLICATION & WITNESSES ─────────────────────
model CitizenshipApplication {
  id                  String   @id @default(cuid())
  userId              String   @unique
  user                User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  status              ApplicationStatus @default(DRAFT)
  step                ApplicationStep   @default(ATTEST)   // ATTEST → OATH → WITNESSES → SEAL
  declaredName        String?
  declaredCountry     String?
  declaredCity        String?
  motto               String?
  oathAcceptedAt      DateTime?
  intendedMintAddress String?                              // address the passport mints to
  kycStatus           KycStatus @default(NOT_STARTED)
  kycFlagNote         String?  @default("KYC/AML provider integration REQUIRED before public mainnet launch")
  attestations        WitnessAttestation[]
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  @@index([status])
}

enum ApplicationStatus { DRAFT  AWAITING_WITNESSES  READY_TO_SEAL  MINTED  REJECTED }
enum ApplicationStep   { ATTEST  OATH  WITNESSES  SEAL }
enum KycStatus         { NOT_STARTED  PENDING  APPROVED  REJECTED  WAIVED_TESTNET }

// EIP-712 witness signatures from existing citizens. Verified ON-CHAIN at mint; stored for aggregation/display.
model WitnessAttestation {
  id             String   @id @default(cuid())
  applicationId  String
  application     CitizenshipApplication @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  witnessUserId  String
  witness        User     @relation("AttestationsGiven", fields: [witnessUserId], references: [id])
  witnessAddress String
  isGenesis      Boolean  @default(false)
  signature      String
  domainHash     String
  structHash     String
  deadline       DateTime
  createdAt      DateTime @default(now())
  @@unique([applicationId, witnessAddress])       // one attestation per witness per application
  @@index([applicationId])
}

// ── OFF-CHAIN CONTENT (authoritative) ───────────────────────
model EmbassyDirectory {
  id            String   @id @default(cuid())
  code          String   @unique
  name          String
  region        String
  countryCode   String?
  city          String?
  neighborhood  String?
  hours         String?
  accentColor   String?
  latitude      Float?
  longitude     Float?
  contactUrl    String?
  status        EmbassyStatus @default(ACTIVE)
  establishedAt DateTime?
  displayOrder  Int      @default(0)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([region])
  @@index([status])
}

enum EmbassyStatus { ACTIVE  PLANNED  CLOSED }

model AssetCatalogEntry {
  id           String   @id @default(cuid())
  category     AssetCategory
  title        String
  description  String?
  location     String?
  valuationUsd Decimal? @db.Decimal(20, 2)        // display metadata; dividends are on-chain
  annualYield  Decimal? @db.Decimal(6, 4)
  status       String?
  acquiredAt   DateTime?
  mediaUrl     String?
  metadata     Json?
  isPublished  Boolean  @default(true)
  displayOrder Int      @default(0)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  @@index([category, isPublished])
}

enum AssetCategory { REAL_ESTATE  PATENT  EQUITY  TREASURY_RESERVE  OTHER }

model ProposalComment {                            // "dissent thread" (off-chain by nature)
  id         String   @id @default(cuid())
  chainId    Int
  onchainId  String
  authorId   String
  body       String
  upvotes    Int      @default(0)
  createdAt  DateTime @default(now())
  @@index([chainId, onchainId])
}

model ConstitutionSection {
  id          String @id @default(cuid())
  ref         String @unique                       // e.g. "§14"
  title       String
  body        String
  displayOrder Int   @default(0)
}

// ── CHAIN CACHES / INDEXES (non-authoritative; reconciled to chain) ──
model GovernanceProposalCache {
  id           String   @id @default(cuid())
  chainId      Int
  onchainId    String
  proposer     String
  title        String?
  description  String?
  state        String                              // mirrors contract State enum
  startBlock   BigInt?
  endBlock     BigInt?
  forVotes     BigInt   @default(0)
  againstVotes BigInt   @default(0)
  abstainVotes BigInt   @default(0)
  quorum       BigInt?
  lastSyncedAt DateTime @default(now())
  @@unique([chainId, onchainId])
  @@index([state])
}

model VoteIndex {                                   // sourced from events; UI participation stats
  id           String   @id @default(cuid())
  chainId      Int
  onchainId    String
  voterAddress String
  tokenId      String
  support      Int                                 // 0 against / 1 for / 2 abstain
  txHash       String
  blockNumber  BigInt
  votedAt      DateTime
  @@unique([chainId, onchainId, tokenId])
  @@index([chainId, onchainId])
}

model DividendClaimIndex {
  id                String   @id @default(cuid())
  chainId           Int
  address           String
  epoch             Int
  claimableAmount   String                         // base-units decimal string
  claimedAmount     String   @default("0")
  claimTxHash       String?
  lastSyncedAt      DateTime @default(now())
  @@unique([chainId, address, epoch])
  @@index([chainId, address])
}

model TxHistoryCache {
  id           String   @id @default(cuid())
  chainId      Int
  address      String
  txHash       String
  direction    TxDirection
  assetSymbol  String
  amount       String
  counterparty String?
  status       String
  blockNumber  BigInt?
  timestamp    DateTime
  raw          Json?
  @@unique([chainId, address, txHash])
  @@index([chainId, address, timestamp])
}

enum TxDirection { IN  OUT  SELF }

model TreasurySnapshot {
  id           String   @id @default(cuid())
  chainId      Int
  label        String
  tokenAddress String?
  balance      String
  valuationUsd Decimal? @db.Decimal(20, 2)
  capturedAt   DateTime @default(now())
  @@index([chainId, capturedAt])
}

model AuditLog {
  id         String   @id @default(cuid())
  userId     String?
  action     String
  targetType String?
  targetId   String?
  ipHash     String?
  metadata   Json?
  createdAt  DateTime @default(now())
  @@index([userId])
  @@index([action, createdAt])
}
```

**Dev/prod portability:** on SQLite (dev), `Json`→`String`, `enum`→`String` (with app-level validation), `Decimal`→`Float`. All monetary/on-chain integer values are stored as **decimal strings** or `BigInt`, never `Float`, to avoid precision loss. **What is explicitly absent (by design):** no `privateKey`, `seedPhrase`, `mnemonic`, `encryptedSeed`, or `passwordPlaintext` column anywhere. A CI check greps the schema/codebase for `privateKey|mnemonic|seedPhrase|secretKey` and fails the build if introduced.

### 4.3 Email + passphrase — register

`POST /api/auth/register` (public, rate-limited, origin-checked):

1. Validate with Zod: `{ email: string().email(), passphrase: string().min(12).max(256), displayName: string().min(1).max(64) }`; enforce strength server-side (length ≥12, zxcvbn score ≥3).
2. Normalize email; respond non-enumerating if it already exists.
3. Hash the passphrase with **Argon2id** (target ~250–500ms on prod hardware): `memoryCost ≥ 19 MiB (target 64 MiB)`, `timeCost = 3`, `parallelism = 1`, 16-byte salt, 32-byte output; store the full `$argon2id$…` encoded string.
4. Create `User` (`CITIZEN`, `ACTIVE`) + empty `CitizenshipApplication` (`DRAFT`, `ATTEST`).
5. Issue a session, set the httpOnly cookie, and **route to the mint flow** (`/dashboard/mint`).
6. Send an email-verification link (token stored hashed, short TTL); verification is required before SEAL/mint in production.

### 4.4 Email + passphrase — login

`POST /api/auth/login` (public, rate-limited per-IP and per-account): Zod `{ email, passphrase }`; look up by normalized email and **always** run an Argon2id verification (against a dummy hash if the user is absent) to equalize timing; on success rotate/create a session and set the cookie; on failure return a generic error. Rate limiting: sliding window (e.g. 5 attempts / 15 min per account and per IP) with exponential backoff/temporary lock, `429` + `Retry-After` when tripped, backed by Redis in prod (in-memory in dev).

### 4.5 SIWE (EIP-4361)

Three-step, DB-backed, single-use nonce:

1. `POST /api/auth/siwe/nonce` → generate a random `nonce`, persist a `SiweNonce` (`LOGIN`, `expiresAt ≈ now+5min`), return `{ nonce }`. The client builds the canonical EIP-4361 message.
2. Client signs with wallet (wagmi/viem).
3. `POST /api/auth/siwe/verify` with `{ message, signature }`: parse with `siwe`/`viem`; verify signature recovers the claimed address; verify `domain`/`uri` match our origin (anti-phishing), `chainId` is allowed, timestamps valid, and the nonce exists/unconsumed/unexpired → mark `consumedAt` atomically (single-use). Find-or-create `User` (SIWE-only: `email=null`, `passwordHash=null`), upsert a `LinkedWallet` (`EXTERNAL`, `verifiedAt=now`, `EVM`), issue a session. **Verification is server-side**; the client is never trusted to assert "I am address X."

### 4.6 Sessions, cookies, CSRF, lifetime

- **Opaque DB-backed sessions (not JWT).** Instant revocation (`revokedAt`/row delete), no long-lived bearer token. The cookie holds a high-entropy random token; the DB stores only its SHA-256 (`Session.tokenHash`).
- **Cookie flags:** `HttpOnly`, `Secure` (prod), `SameSite=Lax` (top-level nav; `Strict` for admin routes), `Path=/`, host-only. TTL: 7 days idle / 30 days absolute, sliding renewal, rotation on privilege change and on login.
- **CSRF:** double-submit token derived from `Session.csrfSecret`, sent via an `x-csrf-token` header on all mutating routes, plus an Origin/Referer allowlist.
- **Logout** (`POST /api/auth/logout`) sets `revokedAt` and clears the cookie; `POST /api/auth/sessions/revoke-all` for "sign out everywhere."

### 4.7 Embedded-wallet passphrase vs. login passphrase — separate secrets

**Decision: keep the login passphrase and the embedded-wallet encryption passphrase SEPARATE, with the wallet passphrase never leaving the browser.** The login passphrase is sent to the server (over TLS) to be Argon2id-verified; if it were also the wallet-encryption key, the server would momentarily receive the exact secret that decrypts the seed — collapsing the non-custodial guarantee. Separation ensures a server breach can never yield the seed. As an opt-in UX bridge, the wallet KDF input may be *derived* from the login passphrase **on the client only** (e.g. `HKDF(loginPassphrase, salt="cryptrepublic-wallet-v1")`) so the user types one secret while the derivation stays in the browser; default is fully separate. Changing the login passphrase must NOT silently invalidate wallet decryption — wallet re-encryption is a distinct client-side action, and the UI warns accordingly. Only the **public address** of the embedded wallet is ever sent to the server (`LinkedWallet`, `kind=EMBEDDED`).

### 4.8 API route inventory

All routes are App Router route handlers under `app/api/…`. Auth levels: **Public** / **Session** (valid cookie) / **Citizen** (session + verified passport on-chain) / **Admin**. All mutating routes require CSRF + Origin check and Zod-validate input (reject unknown keys). Shapes below are high-level.

**`/api/auth/*`** — `register` (POST, Public), `login` (POST, Public), `logout` (POST, Session), `session` (GET), `csrf` (GET, Session), `siwe/nonce` (POST, Public), `siwe/verify` (POST, Public), `verify-email` (POST, Public), `wallets/link/nonce` (POST, Session), `wallets/link/verify` (POST, Session), `wallets` (GET, Session), `wallets/:id` (DELETE, Session), `sessions` (GET, Session), `sessions/revoke-all` (POST, Session). Wallet-linking mirrors SIWE with `purpose=LINK_WALLET` bound to the current `userId`, enforcing `@@unique([chainFamily,address])`; embedded-wallet linking uses the same signature proof so the server confirms control before persisting.

**`/api/citizens/*`** — `me` (GET/PATCH, Session; PATCH updates `handle/bio/countryOfOrigin/city/avatarUrl/publicPrimaryAddress`), `:handle` (GET, Public), `directory` (GET, Public, cursor-paginated, `country?` filter). Passport status returned here is **verified live** against `CryptRepublicPassport.balanceOf/ownerOf` (short cache) whenever it gates the Citizen role.

**`/api/applications/*` (citizenship / mint flow)** — `me` (GET, Session), `attest` (POST, Session: `{declaredName, declaredCountry, declaredCity, intendedMintAddress}`), `oath` (POST, Session: `{accepted, motto}`), `witnesses/request` (POST, Session → `{applicationId, eip712TypedData}`), `witnesses/submit` (POST, Citizen or Genesis: `{applicationId, signature, deadline}`), `witnesses` (GET, Session → `{attestations, required:7, valid:n}`), `seal/prepare` (POST, Session → unsigned mint calldata `{to, data, chainId}` bundling the 7 sigs), `seal/confirm` (POST, Session: `{txHash}`). **The server prepares mint calldata but the user signs and broadcasts**; `seal/confirm` verifies the tx on-chain (correct contract, `Transfer` from the zero-address to the user's address) before flipping `MINTED` and caching `passportTokenId`. Witness signatures are EIP-712, verified server-side for UX and on-chain authoritatively at mint; Genesis submissions require `role=GENESIS_ATTESTOR`.

**`/api/passport/*`** — `metadata/[tokenId]` (GET, Public → tokenURI JSON), `[tokenId]/witnesses` (GET, Public → stored attestations).

**`/api/chain/*` & proxies** — `config` (GET, Public → active chains, addresses, chainIds, public RPC), `balances` (GET, Public → `{native, tokens[]}`), `tx-history` (GET, Public, cursor + `asOf`), `stats` (GET, Public → `{citizenCount, cryptSupply, treasuryUsd, asOf}`), `swap/quote` (GET, Session → LI.FI/0x passthrough, key server-side), `bridge/quote` (GET, Session). Plus the keyed JSON-RPC proxies `rpc/[chain]` and `rpc/solana`, and the Bitcoin provider proxies `btc/balance`, `btc/utxos`, `btc/tx/[id]`. The proxies hide/rotate provider keys and normalize/cache; they never sign. Swap/bridge quotes flag `{ testnetMocked: true }` on non-mainnet.

**`/api/governance/*`** — `proposals` (GET Public cache-reconciled; POST Citizen to save off-chain `{onchainId, title, description}`), `proposals/:id` (GET, Public → `{proposal, tallies, quorum, state, asOf}`), `vote/prepare` (POST, Citizen → vote calldata `{to, data, chainId}`), `participation` (GET, Public), `proposals/:id/comments` (GET Public / POST Citizen → `ProposalComment`). Voting power is **1-citizen-1-vote, passport-gated on-chain**; the server never casts votes.

**`/api/treasury/*`** — `overview` (GET, Public, snapshot cache), `flows` (GET, Public), `dividends/me` (GET, Citizen), `dividends/claim/prepare` (POST, Citizen → claim calldata), `dividends/claim/confirm` (POST, Citizen: `{epoch, txHash}`), `allocations` (GET, Public), `history` (GET, Public, `period` param). Dividends compute on-chain; the index is display-only; claims are user-signed. **Legal flag surfaced here and in the UI:** $CRYPT dividends are likely a regulated security — gate/review before mainnet.

**`/api/holdings/*`** — `assets` (GET Public / mutations Admin), `summary` (GET, Public), `dividends` (GET, Citizen → `DividendDistributor` `Claimed` events for the address).

**`/api/population/*`** — `census` (GET, Public → `{total, byCountry[], growth[], asOf}`), `timeline` (GET, Public), `geo` (GET, Public → per-city counts + coords), `top-cities` (GET, Public). `total` and mint timeline derive from on-chain supply/`Transfer` events; per-country/city breakdown from self-declared profile fields (labeled self-reported).

**`/api/embassies/*`** — `` (GET Public directory; POST Admin), `:code` (GET Public; PATCH/DELETE Admin), `:code/stats` (GET, Public → live citizen count join), `:code/events` (GET, Public), `proposals` (POST, Citizen → off-chain description tied to a governance proposal).

**`/api/stats/*`** — `summary`, `activity`, `census`, `inductions` (all GET, Public; merged indexed chain events + DB). **`/api/constitution`** (GET, Public). **`/api/health`** (GET, Public).

### 4.9 API/backend security posture

- **Trust boundary.** Nothing money- or identity-critical is trusted from the client. The client builds UI and constructs unsigned transactions; the server independently verifies every claim — SIWE signatures (recovered server-side), wallet ownership before linking, passport possession on-chain before granting Citizen, mint/claim/vote transactions confirmed on-chain before mutating state, and EIP-712 witness signatures. Balances/tallies are read from chain, never accepted from the client.
- **Input validation.** Every handler parses input with Zod at the boundary (`strict`); checksum/normalize addresses (viem `getAddress`); validate `chainId` against an allowlist; cursor-based pagination with capped `limit`.
- **Authorization.** Centralized middleware resolves the session (hash lookup, expiry/revocation), attaching `{userId, role}`. Guards: `requireSession`, `requireCitizen` (session + live on-chain passport check), `requireAdmin`. Object-level checks ensure users touch only their own application, wallets, profile, and dividends. Admin mutations write `AuditLog`.
- **Rate limiting & abuse.** Per-IP and per-account limits on auth, nonce issuance, and mint/attestation endpoints; single-use short-TTL nonces; enumeration-resistant email flows.
- **Secrets.** RPC keys, aggregator keys, `DATABASE_URL`, `SESSION_SECRET`, and email creds live in server env / a secrets manager, never in the client bundle. **The server holds no private keys, seed phrases, or mnemonics** — there is no server-side signer capable of moving funds.
- **Compliance flags (must-resolve before public mainnet):** KYC/AML integration is REQUIRED (carried by `kycStatus`); $CRYPT dividends are likely a regulated security — legal review before enabling `/api/treasury/dividends/*` on mainnet.

---

## 5. Wallet Subsystem (security-critical)

This is the highest-risk surface: it handles key material controlling real funds on real chains. The governing principle — **the server never sees, stores, derives, or transmits any secret** (no seed phrase, private key, plaintext passphrase, or derived symmetric key) — is designed so that a full compromise of the backend/database leaks zero spendable secrets. We state explicitly, per feature, what we do and do not guarantee. All client-only crypto lives under `lib/wallet/` and is never imported into a server component, route handler, or server action (enforced by `import 'client-only'`, `"use client"`, and an ESLint boundary rule).

Two independent, interchangeable wallet modes: the **embedded non-custodial wallet** (browser-generated BIP-39 HD wallet, encrypted under the user's passphrase, stored only in IndexedDB — the default, and what binds to the passport identity) and the **external connected wallet** (MetaMask / WalletConnect via wagmi + viem, authenticated with SIWE).

### 5.1 Mnemonic generation

Library: **`@scure/bip39`** with the English wordlist. Entropy: 128 bits minimum, **256 bits (24 words) default**, from `crypto.getRandomValues` (never `Math.random`, timestamps, or user input). `mnemonic.ts` exports `generateMnemonic(strength)`, `validateMnemonic(phrase)`, `mnemonicToSeed(phrase, passphrase?)`. The optional BIP-39 "25th word" passphrase is reserved (not exposed in v1 UI to avoid confusion with the vault passphrase). The mnemonic exists in JS memory only transiently.

### 5.2 HD derivation paths

`derive.ts` derives one account (index 0) per chain from the BIP-39 seed (multi-account is a fast-follow):

| Chain | Curve | Path | Library |
|---|---|---|---|
| EVM (ETH, Base, Arbitrum, Optimism, Polygon) | secp256k1 | `m/44'/60'/0'/0/0` | `@scure/bip32` → `viem/accounts` `privateKeyToAccount` |
| Solana | ed25519 | `m/44'/501'/0'/0'` (SLIP-0010, all-hardened) | `ed25519-hd-key` → `@solana/web3.js` `Keypair.fromSeed` |
| Bitcoin (native segwit / bech32) | secp256k1 | `m/84'/0'/0'/0/0` | `@scure/bip32` + `@scure/btc-signer` |

All five EVM chains share the same address (same key, same path — matching MetaMask expectations). Solana uses SLIP-0010 ed25519 (Phantom-compatible). Each derive fn returns `{ address, publicKey }` plus a short-lived signer handle — never the raw private key as a long-lived object.

### 5.3 Encryption at rest (the vault)

The seed is never persisted in plaintext; we persist an encrypted vault blob.

- **KDF: Argon2id in WASM** via `hash-wasm`: `memorySize:65536` (64 MiB), `iterations:3`, `parallelism:1`, `hashLength:32`, `outputType:'binary'`, tuned to ~500ms–1s on a mid-range 2023 laptop (revisited before mainnet). Params are pinned in the blob so future upgrades don't brick old vaults. **Fallback:** if WASM cannot load, PBKDF2-SHA512 with 600,000 iterations via WebCrypto `deriveKey`, recording `kdf:"pbkdf2"`.
- **Cipher: AES-256-GCM** via WebCrypto; the KDF output is imported as a non-extractable `CryptoKey`.
- **Salt:** 16 random bytes, unique per vault. **IV/nonce:** 12 random bytes, **fresh for every encryption** (GCM nonce reuse under one key is catastrophic; every re-save mints a new IV). **AAD:** vault version + KDF params, binding the header to the ciphertext.
- **What is encrypted:** the BIP-39 **entropy** (so restore/reveal reproduces the exact phrase). Per-chain public addresses are stored **outside** the ciphertext for fast locked-state display.

Stored `VaultBlob` shape (JSON in IndexedDB):

```jsonc
{
  "v": 1, "kdf": "argon2id",
  "kdfParams": { "memorySize": 65536, "iterations": 3, "parallelism": 1, "hashLength": 32 },
  "cipher": "AES-256-GCM",
  "salt": "<base64,16>", "iv": "<base64,12>", "ct": "<base64, incl 16-byte tag>",
  "addresses": { "evm": "0x…", "solana": "…", "bitcoin": "bc1q…" },   // PUBLIC, cleartext
  "createdAt": "<ISO8601>", "label": "Primary"
}
```

Storage: IndexedDB (via `idb`), db `cryptrepublic`, store `vaults`. The blob contains only ciphertext + public data + non-secret params; nothing in it is ever transmitted to the server.

### 5.4 Unlock / lock lifecycle & in-memory handling

- **Create:** generate mnemonic → derive addresses → prompt for a vault passphrase (strength meter, min length enforced) → Argon2id-derive key → AES-GCM encrypt entropy → write blob → hold seed in memory.
- **Unlock:** read blob → derive key from passphrase + stored salt/params → AES-GCM decrypt with stored IV → recover entropy → derive seed → hold in memory. Wrong passphrase fails the GCM auth-tag check → `WalletUnlockError` ("incorrect passphrase") with no oracle beyond pass/fail.
- **Lock:** drop in-memory seed and signer handles; overwrite secret `Uint8Array` buffers with `.fill(0)`.
- **In-memory key handling.** `session.ts` holds unlocked material in a single module-scoped `WalletSession` — never in React/Redux state, `localStorage`/`sessionStorage`, URLs, or logs. Secrets are `Uint8Array` so they can be overwritten; signing derives a chain signer, signs, and zeroizes the transient private key immediately. **Honest limitation:** JavaScript provides no guaranteed zeroization (immutable strings, GC copies, heap moves); we minimize secret lifetime and surface area but do **not** claim memory-forensic resistance against an attacker with live JS execution or a tab memory dump.
- **Auto-lock:** after 10 minutes of inactivity (configurable), on `visibilitychange` to hidden past a grace period, and on tab close; any signing action while locked forces re-unlock.

### 5.5 Backup / reveal-seed UX

The seed is shown **once at creation** and thereafter only via an explicit "Reveal recovery phrase" flow requiring a fresh passphrase decrypt, behind a full-screen interstitial with non-dismissible warnings: CryptRepublic can never recover the phrase or reset the passphrase; anyone who sees the phrase can take everything; we will never ask for it. The reveal screen blurs until tap-to-reveal, offers copy with ~30s clipboard auto-clear (best-effort), discourages screenshots (best-effort), and requires confirmation of offline backup. **No server-side recovery of any kind** for the embedded vault. (The web-account login passphrase is separate and recoverable via email; the two are never conflated in the UI.)

### 5.6 Passport / identity binding

The embedded EVM address (index 0, `m/44'/60'/0'/0/0`) is the canonical address the passport SBT mints to and that governance reads for 1-citizen-1-vote. Its public address is stored on the profile (public data only). At mint the user may instead choose their connected external address; whichever is chosen becomes the canonical citizen address, and the wallet, passport screen, and governance screen all reference it consistently.

### 5.7 Threat model (explicit)

| Threat | Mitigation | Residual / not guaranteed |
|---|---|---|
| **Server / DB compromise** | No secret ever leaves the browser; server stores only public addresses + Argon2id-hashed *login* password (separate from vault). | None for wallet secrets — the core guarantee. |
| **XSS** | Strict **CSP** (`default-src 'self'`; no inline scripts; nonce-based where needed; `connect-src` pinned to our API + specific RPC/indexer origins; `wasm-unsafe-eval` only for Argon2id WASM; no `unsafe-eval`/`unsafe-inline`); **Trusted Types** where supported; React escaping; no `dangerouslySetInnerHTML` on remote content; secrets never in DOM/state. | XSS executing arbitrary JS **while the wallet is unlocked** can read the in-memory seed. Auto-lock shortens the window; stated plainly. |
| **Malicious dependency (supply chain)** | Minimal audited crypto deps (`@scure/*`, `viem`, `hash-wasm`); lockfile-pinned exact versions; `pnpm --frozen-lockfile` in CI; SRI for any externally-hosted asset (we self-host all); `npm audit`/Socket/Dependabot. | A backdoored pinned dep or a compromise of a core lib remains a systemic ecosystem risk. |
| **Phishing** | SIWE domain binding; embedded wallet never asks for the phrase except in the local reveal flow; consistent "we never ask for your phrase" messaging; domain shown in signing prompts. | Off-platform social engineering — UX mitigations only. |
| **Device / OS compromise (malware, keylogger)** | Encryption at rest; auto-lock; short secret lifetime. | A compromised OS defeats client-side crypto — **not defended**; stated to users. |
| **Physical device theft (locked)** | Argon2id-encrypted vault; strong-passphrase enforcement; auto-lock. | Weak passphrases are brute-forceable offline; memory-hard KDF + minimums mitigate. |
| **GCM nonce reuse** | Fresh 12-byte IV on every encrypt; unit-tested invariant. | None if the invariant holds. |
| **Clickjacking** | `frame-ancestors 'none'`, `X-Frame-Options: DENY`. | — |

**Summary of guarantees:** (a) no wallet secret is ever sent to or stored on our servers; (b) the at-rest vault is strongly encrypted and useless without the passphrase; (c) our code paths never log, transmit, or place secrets in persistent/observable storage. We do **not** guarantee protection against a compromised device/OS, a successful XSS while unlocked, or a user who reveals their phrase — and we surface these limits to users.

### 5.8 External connected wallet

**wagmi v2 + viem + `@tanstack/react-query`.** Connectors: `injected()` (MetaMask and other injected providers), `walletConnect({ projectId })` (WalletConnect v2; `projectId` is a public client id in `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`), and `coinbaseWallet()`. **Ledger** is reachable via MetaMask/WalletConnect in v1 (the mockup's Ledger option maps to WalletConnect/injected; no separate hardware connector wired yet). Chains = the active `evm` set with Base / Base Sepolia primary. **SIWE** uses the `siwe` library with the server-side flow of §4.5 — the client requests a nonce, builds and `personal_sign`s the message, and posts it to `/api/auth/siwe/verify` where the server verifies and issues the session cookie; the terminal-style log pane surfaces the real handshake. Minting can target the embedded or the connected address (user's choice); signing uses wagmi `useSignTypedData` / `useSendTransaction`. Network switching via `useSwitchChain` with `viem` chain defs and `wallet_addEthereumChain` for unknown chains; chain params come from the config registry so a chain swap propagates everywhere.

### 5.9 Multi-chain read / send layer

**EVM.** One viem `PublicClient` per chain; **RPC URLs with API keys are server-side only** — the browser calls the allow-listed proxy `POST /api/rpc/[chain]`, with a public fallback RPC only for non-sensitive reads. Native balance via `getBalance`; ERC-20 via `multicall` (`balanceOf`/`decimals`/`symbol`) across the token registry (`config/tokens.ts`: $CRYPT, WETH, WBTC, USDC per chain + native; user-added tokens a fast-follow). Send is EIP-1559 (`estimateFeesPerGas`, `estimateGas`, pending-nonce): embedded builds/signs with the transient local account and broadcasts via `sendRawTransaction` through the proxy; external uses wagmi `useSendTransaction`. ERC-20 send = encoded `transfer`; pre-send UI shows to/amount/token/fee/chain with explicit confirm. Receive = address + QR (`qrcode`, EIP-681 URI optional). **Tx history via Etherscan API v2 (multichain, single key)** behind `GET /api/history/[chain]` (Alchemy `getAssetTransfers` as fallback) — history is not reconstructed client-side from `getLogs`.

**Solana.** `@solana/web3.js` via `POST /api/rpc/solana`. SOL via `getBalance`; SPL via `getParsedTokenAccountsByOwner` (registry-filtered). Send: SOL via `SystemProgram.transfer`, SPL via `@solana/spl-token` (ATAs, creating recipient ATA when needed), signed by the derived ed25519 `Keypair` (external Solana wallets out of scope v1). Receive = address + QR. History via `getSignaturesForAddress` (rich indexer a fast-follow).

**Bitcoin.** Provider API (mempool.space primary, Blockstream Esplora fallback) behind `GET /api/btc/*`. Native segwit (bech32). Balances (confirmed + mempool) and receive (address + QR) only. **Send is a flagged fast-follow (NOT in v1)** — it requires UTXO selection, sat/vB fee estimation, change outputs, and PSBT construction/signing with `@scure/btc-signer`; the UI shows Bitcoin SEND disabled with a "coming soon" tag.

### 5.10 Swap / Bridge

**Aggregator: LI.FI** (primary; unifies same-chain swaps + cross-chain bridging across the EVM set, with Solana support), **0x Swap API** as an EVM same-chain fallback. **Execution model:** the aggregator returns a route + an unsigned transaction (plus any approval); **the user's own wallet signs and broadcasts** it — we never take custody, sign on the server, or hold an intermediate balance. Any ERC-20 `approve` is a distinct explicit step showing spender + amount. Quotes are fetched through `POST /api/swap/quote` (key server-side); the returned tx is executed client-side. **Testnet limitation (explicit + gated):** on Base Sepolia and other testnets aggregator liquidity is absent/unreliable, so the Swap/Bridge UI is gated behind a clearly marked banner and either disabled or backed by a mock route returning a simulated quote **labeled MOCK** — never executing a real swap. The same chain/env config that drives the rest of the app un-gates this on mainnet.

### 5.11 Passport-linked view in the wallet

`passport/link.ts` reads `CryptRepublicPassport` on Base — `balanceOf` (0/1, soulbound), `tokenURI`, on-chain metadata — for the canonical EVM address, rendering the passport NFT card with a non-transferable badge (SEND disabled; the contract reverts transfers). `$CRYPT` is read via the `CryptToken` registry entry (`balanceOf`/`decimals`) and shown as the primary token; claimable dividends from `DividendDistributor` surface as a "Claimable" figure with a CLAIM action signed by the user (real on Base Sepolia and mainnet). The address in the passport card, governance, and dividends is always the same canonical address; if a user has both wallets, the UI labels which one holds the passport and scopes citizen-only actions to it.

---

## 6. Smart Contracts

All contracts are **Solidity ^0.8.24**, built and tested with **Foundry**, using **OpenZeppelin Contracts v5.x** where a battle-tested implementation exists. Target: **Base** (mainnet) / **Base Sepolia** (testnet). Everything is written mainnet-ready and testnet-validated; the user deploys to mainnet and signs all real-money transactions. **A full third-party audit is REQUIRED before mainnet** (§6.9). Standing legal flag: a dividend-bearing `$CRYPT` is very likely a regulated security — resolve before any mainnet token distribution.

### 6.0 Conventions

Contracts live under `contracts/src/`, tests under `contracts/test/`, deploy scripts under `contracts/script/`. Files: `CryptRepublicPassport.sol`, `CryptToken.sol`, `CryptGovernance.sol`, `CryptTreasury.sol`, `DividendDistributor.sol`, `CryptStaking.sol`, plus `lib/Roles.sol`, `lib/WitnessAttestation.sol`, and `interfaces/`. Roles are `bytes32` constants (`keccak256("ROLE_NAME")`) exposed as `public constant`. All `$CRYPT` math is 18-decimal fixed point.

### 6.1 Access-control roles matrix

Access control uses OZ `AccessControl` on all contracts (minimal on `CryptToken`). `DEFAULT_ADMIN_ROLE` is a **Safe multisig** owned by the user — never an EOA on mainnet.

| Role | Held by | Powers |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | User Safe multisig | Grant/revoke roles, set config, pause |
| `GENESIS_ATTESTOR_ROLE` (Passport) | User Safe (early), revoked after genesis | Bootstrap-mint first citizens without witness sigs |
| `PASSPORT_ADMIN_ROLE` (Passport) | User Safe | Set `requiredWitnesses`, baseURI, burn policy |
| `MINTER_ROLE` (CryptToken) | DividendDistributor, Staking (and optionally Treasury) | Mint `$CRYPT` within cap |
| `PAUSER_ROLE` (CryptToken) | User Safe | Pause/unpause transfers (emergency only) |
| `GOVERNANCE_ROLE` (Treasury) | CryptGovernance contract | Authorize disbursements |
| `FUNDER_ROLE` (DividendDistributor) | Treasury, User Safe | Open/fund dividend epochs |
| `REWARDS_ADMIN_ROLE` (Staking) | User Safe | Set APR, fund reward pool |

All privileged setters emit events and are routed through the multisig timelock (§6.8).

### 6.2 CryptRepublicPassport — soulbound ERC-721

**Purpose.** The identity primitive: a non-transferable ERC-721 where `tokenId` = sequential citizen number. Ownership gates governance voting and per-citizen dividends. Minting requires witness attestations (EIP-712 signatures from existing citizens) or a genesis bootstrap.

**Inheritance.** `ERC721`, `ERC721Burnable`, `AccessControl`, `EIP712`, `Nonces`.

**Key storage.**
```solidity
uint256 private _nextCitizenNumber;   // starts at 1; tokenId = citizen number
uint8   public  requiredWitnesses;    // configurable, e.g. 7 (mockup: "7 Witnesses")
string  private _baseTokenURI;
bool    public  burnEnabled;          // renounce-citizenship toggle

struct Citizen { bytes32 nameHash; bytes32 motto; bytes32 domicile; bool oathAccepted; uint64 mintBlock; }
mapping(uint256 => Citizen) public citizenOf;
mapping(address => bool)    public hasPassport;   // one-per-address

bytes32 public constant WITNESS_TYPEHASH =
  keccak256("Attestation(address applicant,bytes32 nameHash,uint256 nonce,uint256 deadline)");
```
Hashes and flags live on-chain (privacy + gas); full name, motto text, portrait, and rendered image are served via `tokenURI`.

**External functions.** `mintWithWitnesses(nameHash, motto, domicile, oathAccepted, Attestation[] attestations, bytes[] signatures) → tokenId`; `genesisMint(to, nameHash, motto, domicile)` (`onlyRole(GENESIS_ATTESTOR_ROLE)`); `adminMint(...)` (`onlyRole(PASSPORT_ADMIN_ROLE)`, post-genesis operational fallback); `renounce(tokenId)` (self, only if `burnEnabled`); setters `setRequiredWitnesses`, `setBaseURI`, `setBurnEnabled`; views `totalCitizens()` (= `_nextCitizenNumber - 1`), `isCitizen(who)`, `tokenURI(tokenId)`.

**Soulbound enforcement.** Override OZ v5's single transfer hook `_update`:
```solidity
function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
    address from = _ownerOf(tokenId);
    if (from != address(0) && to != address(0)) revert Soulbound();  // allow mint & burn only
    return super._update(to, tokenId, auth);
}
```
Also revert on `approve` / `setApprovalForAll`.

**Witness verification.** In `mintWithWitnesses`: require `attestations.length == signatures.length >= requiredWitnesses`; recover each signer via `ECDSA.recover(_hashTypedDataV4(structHash), sig)`; require `hasPassport[signer]`, `signer != applicant`, `deadline >= block.timestamp`, and no duplicate signers; consume a per-applicant `Nonces` nonce (replay protection); require `hasPassport[msg.sender] == false`.

**Events.** `CitizenMinted(tokenId, citizen, nameHash, mintBlock)`, `CitizenRenounced(tokenId, citizen)`, `WitnessAttested(tokenId, witness)`, `RequiredWitnessesSet(n)`.

**Security notes.** `_update` is the single soulbound chokepoint (OZ v5 removed `_beforeTokenTransfer`). Guard signature replay (nonce + deadline + EIP-712 domain bound to chainId), witness self-attestation, and duplicate witnesses. Full Sybil resistance is a KYC concern (flagged pre-mainnet); `nameHash` is a hash, never raw PII on-chain.

### 6.3 CryptToken — $CRYPT ERC-20

**Purpose.** Staking principal, staking rewards, dividend payouts. **Inheritance.** `ERC20`, `ERC20Permit`, `ERC20Pausable`, `AccessControl`. **Supply model.** Hybrid capped-mint: an initial supply minted at deploy to the Treasury, with a hard `MAX_SUPPLY` cap constraining ongoing mint by authorized contracts.

```solidity
uint256 public immutable MAX_SUPPLY;
bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
constructor(address admin, address treasury, uint256 initialSupply, uint256 maxSupply);
function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE);   // reverts if > MAX_SUPPLY
function pause() / unpause() external onlyRole(PAUSER_ROLE);
```

**Pausability decision.** Include `ERC20Pausable` — a young security-flagged token benefits from an emergency halt; `PAUSER_ROLE` sits in the multisig and is documented as a centralization vector (renounce later via versioned redeploy if regulatory posture demands credible neutrality). No fee-on-transfer, no rebasing (keeps staking/dividend accounting simple). `MINTER_ROLE` → `DividendDistributor` + `CryptStaking` (and optionally `Treasury`).

### 6.4 CryptGovernance — passport-gated 1-citizen-1-vote

**Purpose.** On-chain proposals with **one passport = one vote** (NOT token-weighted), a voting period, quorum as a fraction of citizen count, tallying, and a hybrid execution model. Custom (OZ Governor is token-weighted and unsuitable).

```solidity
IPassport public immutable passport;
uint256 public votingPeriod;   // seconds
uint16  public quorumBps;      // quorum as bps of totalCitizens at proposal creation

enum State { Pending, Active, Defeated, Succeeded, Executed, Cancelled }
enum Vote  { None, For, Against, Abstain }

struct Proposal {
  address proposer; uint64 start; uint64 end; uint256 snapshotCitizens;
  uint256 forVotes; uint256 againstVotes; uint256 abstainVotes;
  bool executed; bool cancelled; bytes32 descriptionHash;
  address target; uint256 value; bytes callData;
}
mapping(uint256 => Proposal) public proposals;
mapping(uint256 => mapping(uint256 => Vote)) public voteByPassport;  // proposalId => tokenId => vote
uint256 public proposalCount;
```

Votes are keyed by **passport `tokenId`**, not address; casting requires `passport.ownerOf(tokenId) == msg.sender` and `voteByPassport[id][tokenId] == None`. Functions: `propose(target, value, callData, descriptionHash)` (requires `isCitizen`), `castVote(proposalId, tokenId, support)`, `state(proposalId)`, `execute(proposalId)`, `cancel(proposalId)`, plus `setVotingPeriod`/`setQuorumBps` (`DEFAULT_ADMIN_ROLE`). **Tally & quorum:** `Succeeded` iff `end` passed AND `forVotes > againstVotes` AND `(forVotes + abstainVotes)*10000 >= snapshotCitizens*quorumBps` (denominator snapshotted at creation). **Execution — hybrid:** proposals may carry an optional on-chain payload executed by Governance (primarily Treasury disbursements, where Governance holds `GOVERNANCE_ROLE`); empty-payload proposals are signalling with an on-chain record (action carried out by the Safe).

**Events.** `ProposalCreated`, `VoteCast(id, tokenId, voter, support)`, `ProposalExecuted`, `ProposalCancelled`. **Security notes.** `ReentrancyGuard` on `execute` (mark `executed` before the external call); bound `callData` targets to an allowlist (Treasury only) so Governance can't become an arbitrary-call proxy; enforce the voting window; snapshot the quorum denominator; passport-based keying makes vote-buying-by-transfer impossible.

### 6.5 CryptTreasury

**Purpose.** Holds the republic's funds (`$CRYPT`, ETH, whitelisted ERC-20s), enforces allocation buckets, and disburses only under Governance authorization.

```solidity
bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");
mapping(bytes32 => uint16) public allocationBps;   // bucket => target bps
mapping(address => bool)   public assetWhitelist;
function disburse(address token, address to, uint256 amount) external onlyRole(GOVERNANCE_ROLE) nonReentrant;
function fundDividends(uint256 amount) external onlyRole(GOVERNANCE_ROLE);
function setAllocation(bytes32 bucket, uint16 bps) external onlyRole(DEFAULT_ADMIN_ROLE);
function setAssetWhitelist(address token, bool ok) external onlyRole(DEFAULT_ADMIN_ROLE);
function balanceOf(address token) external view returns (uint256);
receive() external payable;
```

**Events.** `Disbursed`, `DividendsFunded(amount, epoch)`, `AllocationSet`. **Security notes.** `nonReentrant` + CEI on all outflows; OZ `SafeERC20`; allocation `bps` sum ≤ 10000; ETH via checked low-level `call`; Treasury holds no `MINTER_ROLE` by default.

### 6.6 DividendDistributor

**Purpose.** Equal per-citizen dividends in `$CRYPT` on an epoch (quarter) basis; every passport claims once per epoch; anti-double-claim. **Model:** pull-based, epoch-snapshot — on funding, record `perCitizen = amount / snapshotCitizens`. Equal-per-citizen (not pro-rata) matches the civic "1 citizen = 1 share" model and is Sybil-bounded by the passport.

```solidity
IPassport public immutable passport;  IERC20 public immutable crypt;
struct Epoch { uint256 amount; uint256 snapshotCitizens; uint256 perCitizen; uint64 openedAt; bool open; }
mapping(uint256 => Epoch) public epochs;
mapping(uint256 => mapping(uint256 => bool)) public claimed;   // epochId => tokenId => claimed
uint256 public currentEpoch;
function openEpoch(uint256 amount) external onlyRole(FUNDER_ROLE) returns (uint256 epochId);
function claim(uint256 epochId, uint256 tokenId) external nonReentrant;
function claimMany(uint256 epochId, uint256[] calldata tokenIds) external nonReentrant;
function claimable(uint256 epochId, uint256 tokenId) external view returns (uint256);
```
`claim`: require `passport.ownerOf(tokenId) == msg.sender`, `epochs[epochId].open`, `tokenId <= snapshotCitizens`, `!claimed[epochId][tokenId]`; set `claimed = true` **before** `SafeERC20.safeTransfer`. Funding is preferably a Treasury transfer (avoids inflation) rather than minting. **Events.** `EpochOpened`, `DividendClaimed`. **Security notes.** Anti-double-claim (flag before transfer) + `nonReentrant`; eligibility bounded to `tokenId <= snapshotCitizens`; integer-division dust rolls into the next epoch; guard `snapshotCitizens == 0`.

### 6.7 CryptStaking

**Purpose.** Stake `$CRYPT` to earn rewards at a configurable APR (mockup: validator pool ~11.8%), with unstake and claim. **Reward model:** time-based linear APR accrual, `pending = staked * aprBps * elapsed / (YEAR * 10000)`, settled on every stake/unstake/claim via a per-user `lastUpdate` timestamp (a Synthetix-style `rewardPerToken` accumulator is the alternative if a pool-global rate is later needed).

```solidity
IERC20 public immutable crypt;  uint16 public aprBps;  uint256 public constant YEAR = 365 days;
struct StakeInfo { uint256 amount; uint256 rewardDebt; uint64 lastUpdate; }
mapping(address => StakeInfo) public stakes;  uint256 public totalStaked;  uint256 public rewardPoolRemaining;
function stake(uint256 amount) / unstake(uint256 amount) / claim() external nonReentrant;
function earned(address user) external view returns (uint256);
function setApr(uint16 bps) external onlyRole(REWARDS_ADMIN_ROLE);      // prospective only
function fundRewards(uint256 amount) external onlyRole(REWARDS_ADMIN_ROLE);
```
Each mutator runs `_settle(user)` first; `claim` caps payout at `rewardPoolRemaining`. **Events.** `Staked`, `Unstaked`, `RewardClaimed`, `AprSet`, `RewardsFunded`. **Security notes.** `nonReentrant` + CEI (update state before transfers); settle-before-mutate; payouts bounded by funded rewards; `setApr` applies prospectively; no fee-on-transfer assumption. Staking is not passport-gated by default (a product decision; add an `isCitizen` check if it should be a citizen benefit).

### 6.8 Cross-cutting: upgradeability, timelock, gas, indexing

**Upgradeability — RECOMMEND non-upgradeable + versioned redeploy.** Deploy immutable contracts; change logic via a new version + governance migration. Rationale: immutability maximizes trust for a sovereign identity/finance product, removes proxy-storage footguns, and simplifies audit scope. Exception: if one evolving contract genuinely needs in-place upgrades (candidate: `CryptGovernance` as rules mature), use minimal **UUPS** with `_authorizeUpgrade` gated by the Safe behind a Timelock, an initializer guard, and a storage gap. **Default v1 posture: all six contracts non-upgradeable.**

**Timelock.** Route all privileged config (role grants, APR, quorum, allocations) through an OZ `TimelockController` owned by the Safe (e.g. 48h delay) — the primary defense against a compromised admin key. **Reentrancy/CEI.** All value-moving functions use `ReentrancyGuard` + CEI + `SafeERC20`; state flags set before external calls. **Events for indexing.** Every state transition emits an indexed event; the backend indexer derives all dashboard stats — **citizen count = `CitizenMinted` events / `totalCitizens()`**, treasury balances, dividend history, governance tallies. **Gas.** Pack structs into 256-bit slots; use `calldata`; cap `requiredWitnesses` (≤10) to bound mint gas; no unbounded on-chain loops over all citizens (snapshots + pull patterns). **Chain-config swappability.** No hardcoded chain assumptions; RPC/chainId/addresses live in Foundry env + `contracts/broadcast/` address JSON consumed by the frontend, so redeploying to another EVM chain is config-only.

### 6.9 Deployment plan (Foundry)

1. **Local.** `forge test` (unit + fuzz + invariant: soulbound, one-vote, no-double-claim, reward-pool solvency), `forge coverage` gate.
2. **Base Sepolia (testnet validation).** `script/Deploy.s.sol` deploys in order `CryptToken` → `CryptRepublicPassport` → `CryptGovernance` → `CryptTreasury` → `DividendDistributor` → `CryptStaking`; `script/Configure.s.sol` wires roles (`MINTER_ROLE` → Distributor/Staking, `GOVERNANCE_ROLE` → Governance on Treasury, `FUNDER_ROLE` → Treasury), sets `requiredWitnesses`, and `script/SeedGenesis.s.sol` genesis-mints seed citizens. Run with `--broadcast --verify` for Basescan verification; full end-to-end validation against the running app.
3. **Mainnet (USER-run).** The assistant prepares the mainnet deploy script (identical logic, mainnet params, Safe as admin) but **does NOT execute it**. The user funds a deployer, runs the script signing with their own key/hardware wallet, transfers all admin roles to the Safe + Timelock, revokes `GENESIS_ATTESTOR_ROLE` after seeding, and verifies on Basescan.
4. **Post-deploy.** Publish `broadcast/<chainId>` addresses; the frontend picks them up via config. Confirm Safe + Timelock ownership on every contract.

> **AUDIT GATE.** A full independent security audit (plus an economic/mechanism review of dividend + staking tokenomics) is **REQUIRED before mainnet**. $CRYPT as a dividend-bearing instrument is very likely a **regulated security** — obtain legal clearance and integrate KYC/AML (a v1 non-goal) before any public mainnet launch.

---

## 7. Screens & UI

The existing static mockups are ported into real App Router routes and React Server/Client Components. **The design system is preserved** (see §2.9); porting swaps hardcoded arrays for real data sources without redrawing the UI. The dashboard's `ScreenSwitcher`/`goto(id)` state machine becomes real nested routes; `useTweaks`/`TweaksUI` is dev-only and excluded from production.

**Chrome/chain-label reconciliation (IMPORTANT).** The mockups show a fictional "CryptRepublic L2 · CHAIN ID 7331", "~8s block time", "BFT finality", "128 validators", and a "CR-L2 explorer". Per locked decisions we do not run our own L2. Every such label is remapped to the configured chain from `lib/chains` (Base / Base Sepolia): chain name, chainId, explorer URL (BaseScan), and block number come from `useChainInfo()` reading the active viem public client. Fabricated L2 telemetry never ships.

**Global data plumbing.** `useSession()` → `/api/auth/session` returns `{ user, citizen | null, address }`; `citizen` is `null` until a passport is minted and drives every not-yet-citizen vs. citizen branch. On-chain reads use wagmi hooks (`useReadContract(s)`, `useWatchContractEvent`) against `lib/contracts` addresses; server components use a shared viem `publicClient`. Off-chain content is REST + Prisma. **Every write** flows through a shared `<TxButton>` with four states — **idle → pending (wallet signature) → mining (tx hash + spinner) → success (✓ + BaseScan link, data refresh) / error (revert reason surfaced)** — preceded by embedded-wallet unlock or external-wallet connect + correct-chain check. On testnet, money-moving buttons render a `TESTNET` tag and mocked steps a `SIMULATED` tag.

**Responsive.** Ports `Mobile.html` intent and the `Dashboard.html` breakpoints exactly: **≤1024px** sidebar → slide-in drawer (burger), **≤860px** `.cr-hide-sm` topbar meta hidden, **≤760px** all two-column grids → single column, padding 32→16, hero numerals scale down, right-rail `aside`s stack. The design system is identical across breakpoints.

### 7.1 Marketing Home — `app/page.tsx` (ports `Home.html`)

Components (`components/marketing/`): `SiteHeader`, `HeroPassport3D`, `LiveTicker`, `PillarsGrid`, `HoldingsStrip`, `GovernanceStrip`, `EmbassiesStrip`, `CensusCounter`, `FinalCTA`, `SiteFooter`; `.reveal` scroll-in and `prefers-reduced-motion` preserved. Data (no hardcoded stats): `CensusCounter`/ticker → `CryptRepublicPassport.totalSupply()` (SSR initial, then `LiveNumber` reseeded from `/api/stats/summary` every ~15s); `HoldingsStrip` → `/api/holdings/summary`; `GovernanceStrip` → `CryptGovernance.proposalCount()` + `/api/governance/proposals?status=open`; `EmbassiesStrip` → `/api/embassies`; `LiveTicker` → `/api/stats/activity`. No writes; CTAs route to `/auth?mode=register` and `/auth`. Empty/error → strips fall back to the last cached `/api/stats` snapshot; never a spinner-only screen.

### 7.2 Auth — `app/auth/page.tsx` (ports `Auth.html`)

Components: `AuthCard`, `AuthTabs`, `EmailPassphraseForm`, `WalletConnectList`, `SiweTerminalLog`. `?mode=register` reveals the name field and sets submit to "CREATE RECORD & PROCEED TO MINT →". Sign-in → `POST /api/auth/login`; register → `POST /api/auth/register` → route to `/dashboard/mint`; SIWE connect via the §4.5/§5.8 flow with the terminal log showing the real handshake. **Embedded-wallet creation** occurs here on first register: a "Create your sovereign wallet" panel generates the BIP-39 seed in-browser, encrypts it with the passphrase, and stores ciphertext in IndexedDB before routing to mint. The passphrase never leaves the client except as the login credential. Errors reuse the mockup's `.err`/shake styling and print as red terminal lines.

### 7.3 Dashboard shell & nav — `app/dashboard/layout.tsx`

Components: `Sidebar` (nav ids `home`/`governance`/`treasury`/`population`/`passport`/`holdings`/`embassies`/`wallet`, the "MINT A PASSPORT" button, and the bottom Citizen card), `Topbar` (title/subtitle per route, chain-status pill, quorum/UTC clock, "← Site"), `MobileNavDrawer`. The Citizen card reads `useSession().citizen` (applicant state if `null`); the governance nav badge = open-proposal count; the `$` badge on holdings shows when `DividendDistributor.claimable(address) > 0`; the chain pill and block number come from `useChainInfo()`. `layout.tsx` guards auth (redirect `/auth` if unauthenticated). Not-yet-citizen users can open the shell and read-only screens, but write CTAs are disabled with a "Mint your passport to participate" tag. A global `WalletStatusChip` shows Locked/Unlocked (embedded → `UnlockWalletModal`) or connected address / "Connect wallet" (external); any write while locked/disconnected opens it first.

### 7.4 Mint flow — `app/dashboard/mint/page.tsx` (ports `dash-mint.jsx`)

Components: `MintStepper` (Attest → Oath → Witness → Seal), `MintAttestStep`, `MintOathStep`, `MintWitnessStep` (`WitnessTile` grid), `MintSealStep` (`SealingAnimation`), `MintSealedReceipt`, `MintPassportDraft` (live `PassportPreview`). Step gating preserved. **Attest** — form (name/city/country) → `/api/applications/attest`. **Oath** — constitution/preamble from `/api/constitution`; motto captured; `/api/applications/oath`. **Witness** — real EIP-712 attestations: `/api/applications/witnesses/request` returns typed data; eligible attestors (or the genesis-attestor during bootstrap) sign; collected via `/api/applications/witnesses/submit`; `WitnessTile` shows WAITING → SIGNED; the configured quorum (7) of valid signatures enables Seal. **Seal** — `/api/applications/seal/prepare` bundles calldata + sigs; the user signs `CryptRepublicPassport.mintWithWitnesses(...)` (metadata pinned via `/api/passport/metadata` first); `SealingAnimation` runs during the real pending → mining window; success → `MintSealedReceipt` ("✓ SEALED · BLOCK n", "Citizen №{tokenId}", BaseScan link) and `/api/applications/seal/confirm` records the tx; "ENTER THE REPUBLIC →" revalidates the session. Errors surface the revert reason (`insufficient witnesses`, `already citizen`, user-rejected); an already-minted address short-circuits to "You are already Citizen №x".

### 7.5 Citizen home — `app/dashboard/page.tsx` (ports `dash-home.jsx`)

Components: `Salutation`, `ObligationsList`, `StatRow` (4× `StatTile`), `RepublicLedger`, `PassportRailCard`, `EmbassyEventsCard`, `CensusTickerCard`. Data: salutation from `useSession().citizen` + `useChainInfo()`; obligations from `/api/citizen/obligations` (unvoted open proposals via `CryptGovernance.voteByPassport`, pending witness requests, unclaimed dividends); `StatRow` from vote events, `CryptToken.balanceOf` + `CryptStaking` stake, `/api/stats/activity`, and attestation events; `RepublicLedger` from `/api/stats/activity` (block-sorted); `CensusTickerCard` reseeds `LiveNumber` from `totalSupply()`. Not-yet-citizen: "Welcome, applicant" with a single "Mint your passport" obligation.

### 7.6 Your passport — `app/dashboard/passport/page.tsx`

Components: `PassportDisplay`, `PassportActions`, `PassportFactsGrid`, `WitnessRegistry`. All facts from chain + metadata: citizen number = `tokenId`; ISSUED from the `CitizenMinted` event; VALIDITY "Perpetual" (soulbound); VOTING WEIGHT = 1; name/motto/city from `/api/passport/metadata/{tokenId}`; witnesses from `/api/passport/{tokenId}/witnesses`. "VIEW ON CHAIN ↗" → BaseScan; "SHARE CREDENTIAL" → public `/verify/{tokenId}`. No transfer/burn UI (soulbound). Not-yet-citizen → "You have no passport yet" + "Mint a passport →".

### 7.7 Wallet & chain — `app/dashboard/wallet/page.tsx` (ports `dash-holdings.jsx` WalletScreen)

Components: `WalletHero` (address + copy, balance, SEND/RECEIVE/SWAP/STAKE/BRIDGE), `TokenList`, `ActivityLedger`, `TokenStatCard` ($CRYPT + `Spark`), `NetworkStatusCard`, `ValidatorStakeCard`, plus `SendModal`, `ReceiveModal`, `SwapModal`, `StakeModal`, `BridgeModal`, `ChainSwitcher`, `UnlockWalletModal`. Address = embedded (decrypted seed) or connected external. Balances/tokens are live multi-chain per §5.9; the `CR-PASSPORT` row reads `CryptRepublicPassport.balanceOf` (0/1). Activity from `/api/chain/tx-history`. `NetworkStatusCard` shows real Base stats (chainId, block, gas via `estimateFeesPerGas`, explorer); `ValidatorStakeCard` reads `CryptStaking` stake/earned + APR. Writes via `<TxButton>`: SEND (native/ERC-20/SPL; BTC send disabled "coming soon"), RECEIVE (QR), SWAP/BRIDGE (LI.FI/0x, testnet `SIMULATED`), STAKE (`CryptStaking`). Locked embedded wallet hides balances behind unlock; wrong network → `ChainSwitcher`. Not-yet-citizen may use the wallet (wallet ≠ citizenship).

### 7.8 Constitution & votes — `app/dashboard/governance/page.tsx` (ports `dash-gov-treasury.jsx`)

Components: `AmendmentList`, `AmendmentDetail`, `VoteTally`, `CastVotePanel`, `DissentThread`. List/detail from `CryptGovernance.getProposal`/`proposalCount` + `/api/governance/proposals` (rich text mirrored in DB; tallies always from chain). "VOTED"/`myVote` from `voteByPassport`/`VoteIndex`; `DissentThread` from `/api/governance/proposals/{id}/comments`. Writes: `CastVotePanel` → `CryptGovernance.castVote(proposalId, tokenId, support)` — **passport-gated, weight 1**; success animates the tally and flips to "You voted"; errors surface `already-voted`/`voting-closed`/`not-a-citizen`. Not-yet-citizen can read; vote buttons disabled with a mint nudge.

### 7.9 Treasury — `app/dashboard/treasury/page.tsx` (ports `dash-gov-treasury.jsx`)

Components: `TreasuryHero` (reserve balance + %-change + 30D/Q2/1Y/ALL), `TreasurySparkline`, `AllocationCard`, `MyHoldingsCard`, `DisbursementsLedger`. Reserve from `CryptTreasury` balance reads (native + `CryptToken.balanceOf(treasury)` + stablecoins); series from `/api/treasury/history`; allocations from `/api/treasury/allocations`; `MyHoldingsCard` from `CryptToken.balanceOf`, `CryptStaking` stake, `/api/holdings` grants, and voting weight; `DisbursementsLedger` from `/api/treasury/flows` + on-chain transfer events with EXECUTED/PENDING/PROPOSED state. Writes: "STAKE" → `StakeModal` → `CryptStaking.stake`. No arbitrary treasury spending from the UI (treasury moves only via executed governance proposals).

### 7.10 Sovereign holdings (dividends) — `app/dashboard/holdings/page.tsx` (ports `dash-holdings.jsx`)

Components: `HoldingsHero`, `DividendClaimPanel`, `CompositionCard`, `AssetRegisterTable` (filters All/Real estate/Patents & IP/Equity/Crypto reserves), `DividendHistoryCard`, `DoctrineCard`. The asset catalog is off-chain → `/api/holdings/assets` (the hardcoded `ASSETS` array migrated to `AssetCatalogEntry` + seed); totals/composition computed from it. Per-citizen share uses live `totalSupply()`. Claimable → `DividendDistributor.claimable(address)` (contract accrual, not the mockup's math); history → `/api/holdings/dividends` (`Claimed` events); `DoctrineCard` from `/api/constitution`. Writes: `DividendClaimPanel` "CLAIM DIVIDEND →" → `DividendDistributor.claim()` (disabled when `claimable == 0`). Not-yet-citizen: claim panel replaced by "Mint your passport to receive dividends". **Legal flag surfaced in-UI:** dividends are likely a regulated security.

### 7.11 Population — `app/dashboard/population/page.tsx` (ports `dash-population-embassies.jsx`)

Components: `CensusHero` (`LiveNumber` + 24h delta + stats), `WorldMap`, `TopCitiesCard`, `RecentInductionsCard`. Count from `totalSupply()`; 24h delta from `/api/stats/census`; map pins from `/api/population/geo` (per-city counts + coords; pin radius `sqrt(pop)`-scaled); `TopCitiesCard` from `/api/population/top-cities`; `RecentInductionsCard` from `/api/stats/inductions` (`CitizenMinted` events). Read-only public census; fully viewable by not-yet-citizens.

### 7.12 Embassies — `app/dashboard/embassies/page.tsx` (+ `[code]/page.tsx`)

Components: `EmbassiesHero` ("PROPOSE AN EMBASSY →"), `EmbassyGrid` of `EmbassyCard`. Directory off-chain → `/api/embassies` (the hardcoded `EMB` array migrated to `EmbassyDirectory` + seed); per-embassy citizen count from `/api/embassies/{code}/stats` (join self-declared city with passport supply); events from `/api/embassies/{code}/events`. Writes: "PROPOSE" → `ProposeEmbassyModal` → `CryptGovernance.propose(...)` + `/api/embassies/proposals` for the off-chain description; gated to citizens.

### 7.13 Cross-screen conventions

No hardcoded mock data survives — chain reads for anything trustless; `/api/*` + Prisma for off-chain-by-nature content; live `useChainInfo()` for block/chain/gas/explorer. Every write flows through `<TxButton>`. Universal per-screen state matrix: loading (skeleton `Card`s), empty (in-voice copy), error (per-card retry, never a blank screen), and not-yet-citizen vs. citizen (reads allowed; writes disabled with a mint nudge; passport/dividend/vote screens show mint-first empty states). Testnet honesty via `TESTNET`/`SIMULATED` tags.

---

## 8. Testing, Security, Deployment & Delivery

The governing principle: **build mainnet-ready, prove it on testnet, hand the user the keys** — the assistant never touches private keys, seed phrases, or real funds, and never signs or broadcasts a mainnet transaction.

### 8.1 Testing strategy

**Contracts — Foundry (`contracts/test/`).** Every contract ships unit, fuzz, and (where state accumulates) invariant tests. Coverage gate: **≥95% line / ≥90% branch** on all `src/*.sol`; `forge snapshot --check` guards gas.

| Contract | Unit | Fuzz | Invariant |
|---|---|---|---|
| `CryptRepublicPassport` | mint by role only; tokenURI; all transfer/approval entrypoints revert; one-per-address; burn path | `fuzz_transferAlwaysReverts`; `fuzz_mintOncePerAddress` | **soulbound: transfers == 0 for all time**; `balanceOf <= 1`; `totalSupply == citizenCount` |
| `CryptToken` | mint/burn access; cap; `permit` | `fuzz_transfer`; `fuzz_permit` | `sum(balances) == totalSupply`; `totalSupply <= MAX_SUPPLY` |
| `CryptGovernance` | lifecycle; non-citizen cannot propose/vote; quorum math; execution timelock | `fuzz_voteWeights` (weight always 1); `fuzz_proposalStateTransitions` | **one-citizen-one-vote**; no double vote; tally never exceeds voter count |
| `CryptTreasury` | role-gated withdrawals; only Governance executes spend; reentrancy guard | `fuzz_withdrawWithinBalance` | balance never negative; `sum(outflows) <= sum(inflows)` |
| `DividendDistributor` | epoch funding; per-citizen computation; claim marks-claimed; only holders claim | `fuzz_claimAmounts`; `fuzz_multiEpoch` | **no double-claim**; `sum(claims) <= epochFunding` |
| `CryptStaking` | stake/unstake; accrual over time (`vm.warp`); reward-pool cap | `fuzz_stakeUnstakeRoundtrip`; `fuzz_rewardAccrual` | principal recoverable; `sum(userStakes) == poolTotal`; rewards ≤ reserve |
| Witness lib (EIP-712) | valid citizen sig accepts; non-citizen rejected; replay rejected; genesis path; wrong-domain/chainId rejected | `fuzz_signatureRecovery`; `fuzz_replayProtection` | never mint with < required distinct witnesses; no self-attest |

Fork tests (`--fork-url $BASE_SEPOLIA_RPC`) exercise deployed addresses after each testnet deploy.

**Library units — Vitest (`test/`, `src/lib/**/*.test.ts`).** Wallet encryption round-trip (encrypt → decrypt → identical mnemonic; wrong passphrase throws; non-deterministic ciphertext; KDF params at floor; versioned blob shape); HD derivation against BIP-39 vectors; chain helpers (config resolution per env, unit conversions, address validation/checksum, explorer URLs, Base ↔ other-EVM swap); SIWE message construction/parsing; aggregator adapters against recorded fixtures (testnet-mock path returns flagged mock quotes). DB-touching code (Prisma repositories, API handlers) is tested against a disposable SQLite file (Argon2id verify, session issuance, the citizenship state machine, census/catalog read models).

**End-to-end — Playwright (`e2e/`).** Against a full local stack (Next.js dev + local DB + **Base Sepolia** + a funded test wallet in CI secrets, never a mainnet key). The tagged **critical path** must be green before any release:

> register → set passphrase & create/unlock embedded wallet → apply for citizenship → complete the 4-step mint (Attest → Oath → 7 Witnesses → Seal) → mint passport on Base Sepolia → see passport on Your Passport (citizen count increments) → send test funds from the wallet screen → open a governance proposal and cast a vote → claim a dividend epoch on Sovereign Holdings.

Witnesses are pre-seeded genesis-attestor test signers for determinism. Additional specs: SIWE external-connect (via synpress or a mock connector), auth validation/error states, and mobile-viewport smoke of all 8 screens; testnet-only banners are asserted visible.

**CI wiring.** GitHub Actions: `foundry` (fmt/build/test/coverage/snapshot + slither/solhint), `web` (typecheck, lint, Vitest, Prisma migrate check on Postgres), `e2e` (Playwright on Base Sepolia, nightly + release branches). PRs blocked on foundry + web; e2e required before tagging a release.

### 8.2 Security checklist & threat-model summary

**Auth.** Argon2id only (tuned, salted); no plaintext passwords/seeds/keys stored. Opaque DB-backed httpOnly + Secure + SameSite sessions with rotation and revocation. SIWE: server-issued single-use nonce, domain/chainId/expiry bound, replay rejected. Rate limiting/lockout on auth + nonce + mint endpoints. CSRF double-submit + Origin allowlist. Enumeration-resistant responses.

**Wallet (client-side, non-custodial).** BIP-39 seed via CSPRNG; entropy never logged/sent/stored cleartext. AES-GCM under a memory-hard KDF; fresh salt+IV per encryption; auth-tag verified; blob only in IndexedDB. Static check + review that mnemonic/private key never crosses `fetch`/`XHR`; strict CSP; no third-party analytics on wallet routes. All transactions signed client-side; the server sees only broadcast-ready payloads or read requests. Receive addresses shown with checksum; send flows show human-readable chain/token/amount/destination with explicit confirm and address-poisoning mitigations. Aggregator quotes validated (target allowlist, slippage bounds, deadline) before signing; mainnet-only, testnet-flagged.

**Contracts.** Role-gated mint/attest, treasury spend, distributor funding, token mint; genesis-attestor role time-boxed/renounceable and event-logged. Soulbound integrity tested as an invariant. CEI + `ReentrancyGuard` on all payout paths. Checked math with explicit rounding favoring the protocol. EIP-712 domain includes chainId + verifyingContract; nonces prevent replay; safe `ecrecover`. Prefer immutable; any proxy admin is a timelock/multisig with locked storage layout. Governance execution timelock, quorum, one-citizen-one-vote enforced on-chain; treasury drain requires a passing proposal + timelock. `slither` + `solhint` + Foundry fuzz/invariant in CI; manual review of every external call.

**API/backend.** Zod on every route (reject unknown fields); every dashboard/mutation route checks session AND (where relevant) passport ownership on-chain — no client-trusted `isCitizen`. Prisma parameterized queries only. Secrets server-side only; `NEXT_PUBLIC_*` audited to contain nothing sensitive. DB holds public/profile data only; no seed/key/plaintext-password columns (enforced by the CI grep). Strict CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`; dependency audit in CI. No secrets/PII in logs; structured errors, no stack traces to client.

**Pre-Mainnet Gate (blocking — all must be satisfied):** (1) external contract audit, all High/Critical resolved, report published; (2) ≥4 continuous weeks of Base Sepolia burn-in with the critical path exercised, no unresolved P0/P1; (3) full test suite green on the exact deploy commit; (4) slither/solhint clean or triaged; (5) bug bounty open before large treasury/dividend funding; (6) legal sign-off (§10); (7) key-custody plan — treasury/admin/genesis-attestor roles behind a Safe + timelock, with rotation/incident-response runbook; (8) frozen mainnet config/addresses/env with a documented rollback/pause plan.

### 8.3 Mainnet Runbook — steps ONLY the user performs

> **Hard boundary.** The assistant produces mainnet-ready code, deploy scripts, config templates, and this runbook, and validates everything on Base Sepolia. It **never** holds or requests keys/seeds, deploys to mainnet, funds treasury/distributor/staking with real money, or signs/broadcasts a real-value transaction. Every step below is executed by the user (or their authorized signers/multisig), on their own machines, with their own keys.

**Prerequisites (user):** Pre-Mainnet Gate fully satisfied (audit + written legal sign-off); a hardware-wallet/Safe multisig for admin, treasury, and genesis-attestor roles; a Base mainnet RPC + explorer API key.

1. **Obtain funds.** Acquire ETH on Base mainnet in the deployer/signer accounts for gas + initial operations.
2. **Prepare config.** Copy `.env.mainnet.example` → `.env.mainnet`; set `NEXT_PUBLIC_CHAIN_ENV=mainnet`, Base mainnet RPC + explorer key. Never place a private key in a repo file — use a hardware wallet, `cast wallet`, or a keystore reference. Confirm no testnet addresses remain.
3. **Deploy contracts.** Run the Foundry deploy script against Base mainnet, signing with the hardware wallet/multisig: `forge script script/Deploy.s.sol --rpc-url $BASE_MAINNET_RPC --broadcast --verify --ledger` (or `--account <keystore>`), in the order `CryptToken` → `CryptRepublicPassport` → `CryptGovernance` → `CryptTreasury` → `DividendDistributor` → `CryptStaking`, then `Configure.s.sol`.
4. **Verify contracts** on Basescan (`--verify` or `forge verify-contract`); confirm source + constructor args; publish addresses.
5. **Transfer/renounce roles.** Move admin/minter/attestor/treasury roles to the multisig + timelock; renounce deployer EOA powers; confirm the genesis-attestor is time-boxed; verify no single EOA can drain treasury or mint passports.
6. **Set app config to mainnet.** Paste verified mainnet addresses into `config/addresses.mainnet.ts`, set `NEXT_PUBLIC_CHAIN_ENV=mainnet`, deploy the web app, confirm the UI reads live mainnet state and testnet banners are gone.
7. **Fund treasury / distributor / staking.** After legal sign-off, transfer real funds/$CRYPT into `CryptTreasury`, `DividendDistributor` (per-epoch), and the `CryptStaking` reward reserve via the multisig with explicit confirmation.
8. **Smoke & monitor.** Perform one real end-to-end pass (apply → mint → small transfer → vote → claim); set monitoring/alerting on treasury and role events; keep the pause/rollback and incident-response plan at hand.

At every step the assistant may prepare, explain, and dry-run commands against testnet and review the user's outputs — but the mainnet execution and all signatures are the user's.

---

## 9. Phased Delivery

Eight cumulative waves; each lists its deliverable and the acceptance criteria that make it "done." Regression suites from prior waves stay green.

| Wave | Deliverable | Acceptance criteria |
|---|---|---|
| **1 — Scaffold + Design System** | Next.js (App Router) + TS repo (`app/`, `lib/`, `contracts/`, `e2e/`); Prisma init (SQLite dev); design tokens & primitives ported (Archivo + IBM Plex Mono, navy/blue/gold/paper, radius 0, octagonal CR seal, uppercase headings, mono data labels); marketing Home ported as real components; CI (foundry+web+e2e) skeleton. | App builds & typechecks; Home renders pixel-close to `Home.html` desktop + mobile; tokens documented; lint/format clean; CI runs; Vitest + Playwright + Foundry harnesses execute a smoke test. |
| **2 — Auth + DB** | Email+passphrase (Argon2id, opaque DB-backed httpOnly sessions) + SIWE; Prisma schema for `User`/`Session`/`SiweNonce`/`CitizenshipApplication` + `CitizenProfile`; Auth screen wired; rate limiting + CSRF. | Register/login/logout work; sessions httpOnly/secure, revocable; SIWE nonce single-use & verified server-side; Vitest covers Argon2id verify, session issuance, SIWE parse/validate; register routes to mint; enumeration & lockout tests pass. |
| **3 — Wallets + Multichain** | Embedded wallet (BIP-39 gen, WebCrypto AES-GCM + Argon2id KDF, IndexedDB, passphrase unlock); external connect (wagmi/viem, MetaMask/WalletConnect); chain-config registry (EVM: ETH/Base/Arb/OP/Polygon; Solana; Bitcoin); balance reads (EVM native+ERC-20, Solana, BTC); keyed RPC proxies. | Vitest wallet round-trip + HD vectors + chain helpers pass; wrong passphrase never decrypts; seed never leaves client (verified); Base↔other-EVM swap works; balances render for a funded testnet wallet; external connect + SIWE handshake works. |
| **4 — Contracts + Tests + Testnet Deploy** | Foundry project: all six contracts + EIP-712 witness lib + genesis-attestor; full test suite; deploy/configure/seed scripts; **local anvil deploy dry-run (assistant scope)**; Base Sepolia deploy/verify is a documented USER step (§8.3 + `contracts/docs/DEPLOY_RUNBOOK.md`). | Coverage gate met; all invariants pass (soulbound, one-vote, no-double-claim, treasury non-negative, reward solvency); slither/solhint clean or triaged; **local anvil deploy + configure + seed dry-run green (assistant scope)**. Base Sepolia deploy + Basescan verification + fork tests against live addresses are a documented USER step (see `contracts/docs/DEPLOY_RUNBOOK.md`) requiring faucet ETH + RPC/explorer keys — NOT executed by the assistant. |
| **5 — Citizenship + Mint** | Application flow + 4-step mint wired end-to-end to `CryptRepublicPassport` on Base Sepolia; genesis-attestor bootstrap; Your Passport shows the real NFT. | User applies and mints a soulbound passport on testnet; witness EIP-712 sigs verified on-chain; citizen count = passports minted; minted passport non-transferable in UI + chain; Playwright covers register→unlock→apply→mint→see-passport. |
| **6 — Wallet Screen** | Full Wallet & Chain screen on real chain data: $CRYPT + WETH/WBTC/USDC + passport NFT; SEND/RECEIVE(QR)/SWAP/STAKE/BRIDGE; tx history; staking via `CryptStaking`; bridges; swap/bridge via LI.FI/0x (testnet limited/mocked & marked). | Real testnet balances & history; send test funds confirms on Base Sepolia; receive shows checksummed address + QR; stake/unstake against `CryptStaking`; swap/bridge show flagged testnet-mock; all sends require explicit confirm. |
| **7 — Remaining Screens Wired** | Citizen home, Governance, Treasury, Population, Sovereign Holdings (dividends via `DividendDistributor`), Embassies — all wired to real contracts + backend/DB (asset catalogs, embassy directory, census, constitution) + live chain stats. | No hardcoded mock data on any of the 8 screens; vote cast on-chain (one-citizen-one-vote enforced); dividend claim works with no double-claim; treasury/holdings/population reflect live chain + DB; off-chain catalogs served from Postgres/SQLite via Prisma. |
| **8 — Polish + Tests + Docs + Runbook** | Responsive/mobile polish (match `Mobile.html`), a11y + performance pass, error/empty/loading states, hardening; complete test suites; docs (architecture, chain-config swap, env); the Mainnet Runbook + Pre-Mainnet Gate finalized; `// LEGAL:` flags surfaced. | Full Foundry+Vitest+Playwright green incl. critical path; a11y/perf audit passes thresholds; mobile matches design; all legal flags documented; runbook reviewed & reproducible on a testnet dry-run; testnet burn-in started; release tag cut for the user's mainnet handoff. |

> **Wave 4 deploy boundary (§8.3).** The assistant's Wave 4 scope is a green suite + coverage gate + slither/solhint triaged + a **local anvil deploy/configure/seed dry-run** — it never holds keys, funds contracts, or broadcasts a real-value transaction. "Deployed & verified on Base Sepolia" and "fork tests green against live addresses" (and all mainnet steps) are USER-run follow-ups documented in `contracts/docs/DEPLOY_RUNBOOK.md`, executed with the user's own keys/faucet ETH/RPC + explorer keys.

---

## 10. Risks, Legal Flags & Open Questions

### 10.1 Legal / compliance flags (not legal advice; blocking items in the Pre-Mainnet Gate)

These are flags for the user and their counsel. Do not fund the distributor/treasury or open public mainnet until resolved with a qualified securities/fintech attorney in every relevant jurisdiction. The assistant surfaces them in code (`// LEGAL:` markers at the token, treasury, dividend, and KYC boundaries) and in docs; it cannot clear them.

- **$CRYPT is very likely a regulated security.** A token conferring claimable dividends has strong indicia of an investment contract (Howey-type and analogous regimes). Offering/selling it may require registration or an exemption, disclosures, and transfer restrictions. **Resolve token characterization before any public distribution.**
- **KYC/AML & sanctions.** Citizenship, wallet provisioning, and especially treasury/dividend outflows may trigger KYC/AML and sanctions-screening obligations. v1 has no KYC/AML provider (explicit non-goal); integrating one is **REQUIRED before public mainnet** (carried by `CitizenshipApplication.kycStatus`).
- **Money transmission / MSB.** Facilitating value transfer (send/swap/bridge, payouts, dividends) can implicate money-transmitter / MSB / e-money licensing. Confirm the non-custodial design keeps CryptRepublic out of scope and document the basis.
- **Dividends & tax.** Distributions raise tax reporting/withholding questions for the entity and citizens before funding.
- **Securities-law disclosures & marketing.** "Holdings," "dividends," and "sovereign wealth" copy may constitute an offer/solicitation; review with counsel.
- **Entity, terms, privacy.** A legal entity, Terms of Service, Privacy Policy, and risk disclosures must be in place before public launch.
- **"Network state" framing** is a product metaphor with no legal statehood implications; ensure marketing does not imply governmental status, legal tender, or guaranteed returns.

### 10.2 Security & technical risks

- **XSS while wallet is unlocked** is the residual worst case for the embedded wallet — mitigated by strict CSP, Trusted Types, no `dangerouslySetInnerHTML` on remote content, secrets never in DOM/state, and auto-lock, but not eliminated.
- **Supply-chain compromise** of a pinned crypto dependency — mitigated by minimal audited deps, exact-version lockfiles, `--frozen-lockfile`, SRI, and Dependabot/Socket, but a systemic ecosystem risk.
- **Device/OS compromise** defeats client-side crypto and is explicitly not defended; surfaced to users.
- **Contract exploit** before audit — mitigated by the blocking audit gate, invariant/fuzz testing, timelock + multisig, and pausable $CRYPT.
- **Testnet vs. mainnet drift** — mitigated by the single config switch, CI running the Postgres path, and fork tests against live testnet addresses.

### 10.3 Open questions

1. **Token legal status:** final characterization of $CRYPT and the resulting distribution/transfer-restriction design — blocks Wave 7 dividend funding and mainnet.
2. **KYC/AML provider & scope:** which provider, at which step (application vs. first payout), which jurisdictions — blocks public mainnet.
3. **Key custody model:** exact Safe threshold and timelock delays for admin/treasury/attestor; genesis-attestor sunset policy.
4. **Witness model on-chain:** are the "7 witnesses" a fixed on-chain quorum, configurable, or partly off-chain — confirm before Wave 4 freezes the signature schema. (Current decision: configurable `requiredWitnesses` defaulting to 7, verified on-chain, with a genesis path.)
5. **Passport revocation:** is loss of citizenship (burn) in scope, and what governance action triggers it? (Current decision: `burnEnabled` toggle + self-`renounce`; governance-triggered revocation deferred.)
6. **Dividend source & cadence:** where treasury revenue originates and the epoch schedule for `DividendDistributor` (default: quarterly).
7. **Bitcoin send fast-follow:** timeline and PSBT signing approach for the flagged BTC send.
8. **Swap/bridge aggregator:** LI.FI vs. 0x per chain and testnet-mock fidelity (current decision: LI.FI primary, 0x fallback).
9. **Audit firm, bug-bounty platform/budget, and burn-in duration** (≥4 weeks baseline — confirm).
10. **Data residency / privacy regime** for the Postgres profile/census data (GDPR/CCPA applicability).
