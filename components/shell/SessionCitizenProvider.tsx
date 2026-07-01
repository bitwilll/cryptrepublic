"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { activeChain } from "@/lib/config/chain";
import { loadPublicAccounts } from "@/lib/wallet/embedded/session";
import { readPassportStatus } from "@/lib/passport/client";

/**
 * Resolves the signed-in citizen's on-chain standing for the whole dashboard
 * shell: the embedded EVM address (from the public account blob — no unlock
 * needed to read a public address), whether they hold a passport, and their
 * resolved passport `tokenId` (required for votes/claims — a passport is NOT
 * enumerable, so the tokenId is resolved via the `CitizenMinted` log in
 * `readPassportStatus`). Every read is wrapped so an unregistered chain (whose
 * `passportAddress` accessor throws) yields `{ isCitizen:false, tokenId:null }`
 * rather than crashing the shell (constraint #11).
 */
export interface CitizenContext {
  address: `0x${string}` | null; // embedded/external EVM address (null: no wallet)
  isCitizen: boolean;
  tokenId: bigint | null; // resolved passport tokenId (for votes/claims) — null if not a citizen
  loading: boolean;
  refresh: () => void;
}

const Ctx = createContext<CitizenContext | null>(null);

export function useCitizen(): CitizenContext {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useCitizen must be used within a SessionCitizenProvider");
  }
  return ctx;
}

export function SessionCitizenProvider({ children }: { children: React.ReactNode }) {
  const chainId = activeChain().primaryChainId;
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [isCitizen, setIsCitizen] = useState(false);
  const [tokenId, setTokenId] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      let addr: `0x${string}` | null = null;
      try {
        const acc = await loadPublicAccounts();
        addr = (acc?.evm as `0x${string}` | undefined) ?? null;
      } catch {
        addr = null;
      }
      if (!alive) return;
      setAddress(addr);

      if (!addr) {
        setIsCitizen(false);
        setTokenId(null);
        setLoading(false);
        return;
      }

      try {
        const status = await readPassportStatus(chainId, addr);
        if (!alive) return;
        setIsCitizen(status.isCitizen);
        setTokenId(status.isCitizen ? (status.tokenId ?? null) : null);
      } catch {
        // Unregistered chain / RPC down — degrade to applicant, never throw.
        if (!alive) return;
        setIsCitizen(false);
        setTokenId(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [chainId, tick]);

  return (
    <Ctx.Provider value={{ address, isCitizen, tokenId, loading, refresh }}>
      {children}
    </Ctx.Provider>
  );
}
