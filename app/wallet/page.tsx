import type { Metadata } from "next";
import { AppProviders } from "@/components/providers/AppProviders";
import { WalletApp } from "@/components/wallet/WalletApp";

export const metadata: Metadata = {
  title: "Sovereign Wallet — CryptRepublic",
  description: "Non-custodial embedded wallet. Your keys never leave this device.",
};

/**
 * Server shell for the minimal wallet exerciser. The interactive wallet UI is a
 * client island mounted inside the wagmi/react-query provider tree. This page is
 * a Server Component and does NOT import lib/wallet (the client-only boundary).
 */
export default function WalletPage() {
  return (
    <AppProviders>
      {/* <main> landmark (Wave 8 A2) — this exerciser page had none. */}
      <main>
        <WalletApp />
      </main>
    </AppProviders>
  );
}
