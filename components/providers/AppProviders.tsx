"use client";
import { QueryProvider } from "./QueryProvider";
import { WagmiProvider } from "./WagmiProvider";

/**
 * Client provider tree for interactive wallet subtrees. Order matters: wagmi
 * depends on react-query, so QueryProvider wraps WagmiProvider. Mount this only
 * where the wallet UI lives — never around the whole app.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <WagmiProvider>{children}</WagmiProvider>
    </QueryProvider>
  );
}
