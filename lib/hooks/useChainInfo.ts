"use client";
import { useEffect, useState } from "react";
import { activeChain, evmEntry } from "@/lib/config/chain";
import { readChainStats } from "@/lib/wallet/services/chainStats";

/**
 * Live chain telemetry for the dashboard shell. Every field is REAL — derived
 * from the honest `readChainStats` reader — and replaces the mockup's fabricated
 * L2 chrome (`CR-L2` / `7331` / validators / TPS / "block 21 408 932"). The hook
 * polls every ~12s and degrades gracefully: a failed read yields
 * `{ online:false, blockNumber:null }` and NEVER throws in render (constraint
 * #11 — an unregistered/offline chain must not crash the shell).
 */
export interface ChainInfo {
  chainId: number;
  chainName: string; // evmEntry(chainId).viemChain.name — NOT "CR-L2"/"7331"
  blockNumber: bigint | null;
  gasMaxFeePerGasWei: bigint | null;
  explorerBase: string | null;
  online: boolean; // false when the read fails (renders "chain offline")
}

const POLL_MS = 12_000;

/** Best-effort registry chain name (never throws — used for the offline fallback). */
function safeChainName(chainId: number): string {
  try {
    return evmEntry(chainId).viemChain.name;
  } catch {
    return `Chain ${chainId}`;
  }
}

export function useChainInfo(): ChainInfo {
  const chainId = activeChain().primaryChainId;
  const [info, setInfo] = useState<ChainInfo>({
    chainId,
    chainName: safeChainName(chainId),
    blockNumber: null,
    gasMaxFeePerGasWei: null,
    explorerBase: null,
    online: false,
  });

  useEffect(() => {
    let alive = true;
    const poll = () => {
      readChainStats(chainId)
        .then((s) => {
          if (!alive) return;
          setInfo({
            chainId: s.chainId,
            chainName: s.chainName,
            blockNumber: s.blockNumber,
            gasMaxFeePerGasWei: s.gasMaxFeePerGasWei,
            explorerBase: s.explorerBase,
            online: true,
          });
        })
        .catch(() => {
          if (!alive) return;
          setInfo((prev) => ({
            ...prev,
            chainId,
            chainName: safeChainName(chainId),
            blockNumber: null,
            online: false,
          }));
        });
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [chainId]);

  return info;
}
