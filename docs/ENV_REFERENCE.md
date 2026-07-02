# CryptRepublic — Environment Variable Reference

Every variable the app reads (built from a `grep -rn 'process.env'` sweep of
`app/`, `lib/`, `config/`, `scripts/`, `middleware.ts`, `prisma/`, test configs —
not just `.env.example`). Templates: [.env.example](../.env.example) (dev/testnet)
and [.env.mainnet.example](../.env.mainnet.example) (mainnet placeholders).

**There is NO server-side signing key anywhere in this list, by design.** The
server never holds keys and never signs — see
[ARCHITECTURE.md](ARCHITECTURE.md) §5. If you ever find yourself adding a
`PRIVATE_KEY`-shaped variable, stop: that breaks the app's core security model.

`.env*` files are git-ignored (verified with `git check-ignore` for `.env`,
`.env.local`, `.env.production`, `.env.testnet`, `.env.mainnet`); only the two
placeholder templates `.env.example` and `.env.mainnet.example` are committable
(re-included via `!` negations in [.gitignore](../.gitignore)).

## Public variables (`NEXT_PUBLIC_*` — inlined into the client bundle at BUILD time)

| Variable | Purpose | Consumers | Required when | Default |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_CHAIN_ENV` | **The single switch** that flips the whole app between chain profiles: `testnet` / `mainnet` / `local` (local anvil, integration tests) | `lib/config/chain.ts:10` (registry key), `app/auth/AuthForm.tsx:16` + `lib/auth/siwe.ts:10` (SIWE chainId) | Always set it explicitly per environment | unset → `testnet` |
| `NEXT_PUBLIC_APP_URL` | The app origin: bound into SIWE messages, checked by the CSRF Origin allowlist, base for absolute proxy URLs | `lib/auth/csrf.ts:13`, `lib/auth/siwe.ts:14`, `lib/wallet/external/siwe.ts:19`, `lib/wallet/services/evmClients.ts:17`, `lib/wallet/services/send.ts:129` | Any non-localhost deployment (SIWE + CSRF break on a wrong origin) | `http://localhost:3000` |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect v2 project id — a **public client id**, safe to expose | `lib/wallet/external/wagmi.ts:33` | Only for external-wallet connect via WalletConnect | `""` (WalletConnect connector unavailable) |

## Server-only variables (never `NEXT_PUBLIC_`; never reach the browser)

| Variable | Purpose | Consumers | Required when | Default |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | Prisma database URL. SQLite file in dev/CI; on Vercel it is the **pooled Postgres** URL consumed by the mirrored deploy schema (`prisma/postgres/schema.prisma` — see [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md)) | `prisma/schema.prisma:7`, `prisma/postgres/schema.prisma`, `vitest.config.ts:27` | Always | none (dev template: `file:./dev.db`) |
| `DATABASE_URL_UNPOOLED` | **Direct (non-pooled) Postgres URL** — the `directUrl` of `prisma/postgres/schema.prisma`, used ONLY by Prisma CLI commands (`migrate deploy` in `vercel-build`; `prisma validate` also resolves it). Never read by the app at runtime. The Neon/Vercel integration sets it automatically; plain-Postgres deployments may set it equal to `DATABASE_URL` | `prisma/postgres/schema.prisma` | Postgres deployments only (never local SQLite dev) | none |
| `RPC_BASE_SEPOLIA` | Keyed RPC, Base Sepolia (84532) — **primary chain of the `testnet` profile** | resolved dynamically: `config/chains.config.ts` `serverRpcEnv` → `lib/rpc/allowlist.ts:65` | `testnet` profile reads | none (proxy 500s for that chain) |
| `RPC_BASE` | Keyed RPC, Base mainnet (8453) — **primary chain of the `mainnet` profile** | same dynamic resolution | `mainnet` profile reads | none |
| `RPC_ETHEREUM` | Keyed RPC — Sepolia under `testnet`, Ethereum mainnet under `mainnet` (same var name, profile decides the network) | same | reads on that chain | none |
| `RPC_ARBITRUM` | Keyed RPC — Arbitrum Sepolia / Arbitrum One per profile | same | reads on that chain | none |
| `RPC_OPTIMISM` | Keyed RPC — OP Sepolia / OP Mainnet per profile | same | reads on that chain | none |
| `RPC_POLYGON` | Keyed RPC — Polygon Amoy / Polygon PoS per profile | same | reads on that chain | none |
| `RPC_ANVIL` | Local anvil RPC for the `local` (31337) profile | `lib/rpc/allowlist.ts:69–72` | never required | `http://127.0.0.1:8545` |
| `RPC_SOLANA` | Keyed Solana RPC, proxied via `/api/rpc/solana` | `lib/rpc/allowlist.ts:80` | Solana balance reads | none (Solana reads unavailable) |
| `ETHERSCAN_API_KEY` | Etherscan API v2 key (multichain, one key) for the tx-history proxy | `app/api/history/[chain]/route.ts:29` | tx-history reads | none (history route answers "History provider not configured") |
| `APP_URL` | **Server-side fallback** for the CSRF Origin allowlist host, used only when `NEXT_PUBLIC_APP_URL` is unset | `lib/auth/csrf.ts:13` | never (set `NEXT_PUBLIC_APP_URL` instead; this fallback exists for server-only overrides) | falls through to `NEXT_PUBLIC_APP_URL` → `http://localhost:3000` |

## Runtime/CI variables (set by tooling, not in `.env` templates)

| Variable | Purpose | Consumers |
| --- | --- | --- |
| `NODE_ENV` | `production` enables Secure cookies (`lib/auth/session.ts:55`, `lib/http/responses.ts:35`), HSTS (`middleware.ts:26`), and disables the Prisma dev-client cache (`lib/db.ts:8`). Set by Next.js. | session/cookies, middleware, db |
| `CI` | Playwright: `reuseExistingServer: !CI` (`playwright.config.ts:11`); also flips Next lint to error-on-warning in the gate (`CI=true pnpm lint`) | test tooling |
| `NEXT_TELEMETRY_DISABLED` | Disables Next.js telemetry in CI (`.github/workflows/*.yml`) | Next.js itself |

The integration suites (`test/integration/*.test.ts`) set their own env
in-process (`NEXT_PUBLIC_CHAIN_ENV=local`, `NEXT_PUBLIC_APP_URL`, `RPC_ANVIL`) —
they are hardwired to a throwaway local anvil and cannot be pointed at a live
network.

## Vercel deployment (testnet build)

Which of the above to set in Vercel (Production, and Preview where sensible),
per the operator runbook [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md):

- **Public (build-time-inlined):** `NEXT_PUBLIC_CHAIN_ENV=testnet`,
  `NEXT_PUBLIC_APP_URL=https://cryptrepublic.com`,
  `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (optional). Changing any of these
  requires a redeploy.
- **Server-only:** `DATABASE_URL` (pooled Postgres) + `DATABASE_URL_UNPOOLED`
  (direct — both injected by the Neon integration), `RPC_BASE_SEPOLIA`
  (required for chain reads), `ETHERSCAN_API_KEY` (optional), further `RPC_*`
  (optional). `APP_URL` stays unset.
- The build itself runs the `vercel-build` script (Postgres client generate →
  `migrate deploy` → `next build`); local dev and the test suite keep SQLite —
  the two schemas are held identical by `prisma/schema-drift.test.ts`.

## Chain-swap procedure (testnet ↔ mainnet)

1. Set `NEXT_PUBLIC_CHAIN_ENV` (`testnet` | `mainnet`) — this flips the entire
   registry: chainIds, explorers, Solana cluster, and which `RPC_*` vars are
   read ([ARCHITECTURE.md](ARCHITECTURE.md) §2).
2. Provide the keyed RPC vars for the target profile (`RPC_BASE_SEPOLIA` for
   testnet; `RPC_BASE` for mainnet; the shared `RPC_ETHEREUM`/`RPC_ARBITRUM`/
   `RPC_OPTIMISM`/`RPC_POLYGON` names point at the profile's networks).
3. Ensure the contract addresses for the target chain are registered in
   `CONTRACTS[84532]` / `CONTRACTS[8453]` in `config/contracts.ts` (a USER step
   after a real deploy — [MAINNET_HANDOFF.md](MAINNET_HANDOFF.md) step 6).
   Unregistered contracts degrade gracefully to empty/unavailable states.
4. **Rebuild.** `NEXT_PUBLIC_*` values are inlined at build time — a running
   server cannot be flipped by changing env alone (`pnpm build && pnpm start`).

For mainnet, start from [.env.mainnet.example](../.env.mainnet.example)
(placeholders only — **never put a private key in any repo file**) and follow
[MAINNET_HANDOFF.md](MAINNET_HANDOFF.md).
