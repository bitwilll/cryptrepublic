"use client";
import { useState } from "react";
import { WagmiProvider as BaseWagmiProvider, type Config } from "wagmi";
import { makeWagmiConfig } from "@/lib/wallet/external/wagmi";

/** wagmi provider (config built once per tree). */
export function WagmiProvider({ children }: { children: React.ReactNode }) {
  const [config] = useState<Config>(() => makeWagmiConfig());
  return <BaseWagmiProvider config={config}>{children}</BaseWagmiProvider>;
}
