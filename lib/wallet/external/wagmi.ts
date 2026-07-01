import "client-only";
import { createConfig, http, type Config } from "wagmi";
import type { Chain } from "viem";
import { injected, walletConnect, coinbaseWallet } from "wagmi/connectors";
import { activeChain } from "@/lib/config/chain";

/**
 * wagmi config for EXTERNAL wallet connect. Chains come from the active EVM set;
 * every transport posts to the `/api/rpc/<chainId>` proxy (no keyed RPC in the
 * browser). WalletConnect uses the PUBLIC project id.
 *
 * DEVIATION: the plan targeted wagmi v2; the resolved install is wagmi 3.x
 * (createConfig/WagmiProvider/connectors API is compatible; viem stays 2.54.1).
 */
export function makeWagmiConfig(): Config {
  const profile = activeChain();
  const chains = profile.evm.map((e) => e.viemChain) as [Chain, ...Chain[]];
  const transports = Object.fromEntries(
    profile.evm.map((e) => [e.chainId, http(`/api/rpc/${e.chainId}`)]),
  );

  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";
  const connectors = [
    injected(),
    coinbaseWallet({ appName: "CryptRepublic" }),
    ...(projectId ? [walletConnect({ projectId })] : []),
  ];

  return createConfig({ chains, connectors, transports });
}
