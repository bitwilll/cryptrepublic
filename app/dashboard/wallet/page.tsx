import type { Metadata } from "next";
import { AppProviders } from "@/components/providers/AppProviders";
import { WalletChainApp } from "@/components/wallet/WalletChainApp";

export const metadata: Metadata = {
  title: "Wallet & Chain — CryptRepublic",
  description:
    "Non-custodial wallet: real balances, staking, and honest chain stats. Your keys never leave this device.",
};

/**
 * Server shell for the full Wallet & Chain screen. Mounts the client island
 * inside the wagmi/react-query provider tree. This page is a Server Component and
 * does NOT import lib/wallet (the client-only boundary). It inherits the
 * dashboard layout's session guard automatically (wallet ≠ citizenship — a
 * logged-in non-citizen may use the wallet, per spec §7.7).
 */
export default function DashboardWalletPage() {
  return (
    <AppProviders>
      <WalletChainApp />
    </AppProviders>
  );
}
