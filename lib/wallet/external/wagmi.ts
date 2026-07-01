import "client-only";
import { createConfig, http, type Config, type CreateConnectorFn } from "wagmi";
import type { Chain } from "viem";
import { injected, walletConnect } from "wagmi/connectors";
import { activeChain } from "@/lib/config/chain";

/**
 * wagmi config for EXTERNAL wallet connect. Chains come from the active EVM set;
 * every transport posts to the `/api/rpc/<chainId>` proxy (no keyed RPC in the
 * browser). WalletConnect uses the PUBLIC project id.
 *
 * DEVIATIONS FROM PLAN:
 * - wagmi pinned to v2 (2.19.5). The unpinned install resolved to wagmi 3.x,
 *   whose `@wagmi/core` "tempo" module fails to build under Next/webpack
 *   ("Can't resolve 'accounts'"). v2 is the plan's target and builds cleanly.
 *   viem stays 2.54.1.
 * - The `coinbaseWallet` connector is INTENTIONALLY OMITTED. Coinbase Wallet SDK
 *   v4 injects an inline `<script>` (Client Analytics) at init AND beacons a
 *   deviceId to `cca-lite.coinbase.com` (Amplitude). That violates the strict
 *   `script-src` (no `unsafe-inline`), the pinned `connect-src`, and the privacy
 *   posture (no third-party telemetry). `injected()` already surfaces the
 *   Coinbase Wallet browser extension; mobile Coinbase Wallet is reachable via
 *   WalletConnect. Re-adding Coinbase natively requires an SDK build that does
 *   not inject inline telemetry, or CSP allowances we won't grant.
 */
export function makeWagmiConfig(): Config {
  const profile = activeChain();
  const chains = profile.evm.map((e) => e.viemChain) as [Chain, ...Chain[]];
  const transports = Object.fromEntries(
    profile.evm.map((e) => [e.chainId, http(`/api/rpc/${e.chainId}`)]),
  );

  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";
  const connectors: CreateConnectorFn[] = [
    injected(),
    ...(projectId ? [walletConnect({ projectId })] : []),
  ];

  return createConfig({ chains, connectors, transports });
}
