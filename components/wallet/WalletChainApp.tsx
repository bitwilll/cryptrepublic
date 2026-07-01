"use client";
import { useCallback, useEffect, useState } from "react";
import { activeChain } from "@/lib/config/chain";
import {
  isUnlocked,
  loadPublicAccounts,
  unlock,
  startAutoLock,
  type WalletAccounts,
} from "@/lib/wallet/embedded/session";
import { hasVault } from "@/lib/wallet/embedded/storage";
import { loadPortfolio, type Portfolio } from "@/lib/wallet/services/portfolio";
import { readChainStats, type ChainStats } from "@/lib/wallet/services/chainStats";
import {
  stakingAvailable,
  readStakePosition,
  type StakePosition,
} from "@/lib/wallet/services/staking";
import { readPassportStatus, type PassportStatus } from "@/lib/passport/client";
import { evmHistory, type TxRow } from "@/lib/wallet/services/history";
import { UnlockWalletModal } from "./UnlockWalletModal";
import { PortfolioHeader, type WalletAction } from "./PortfolioHeader";
import { TokenList } from "./TokenList";
import { ChainStatsPanel } from "./ChainStatsPanel";
import { StakePanel } from "./StakePanel";
import { PassportAssetCard } from "./PassportAssetCard";
import { ActivityLedger } from "./ActivityLedger";
import { ReceiveModal } from "./ReceiveModal";
import { SendModal } from "./SendModal";
import { SwapBridgeModal } from "./SwapBridgeModal";

type View = "loading" | "create" | "locked" | "unlocked";

/**
 * Wallet & Chain screen orchestrator (client island). Resolves the active chain,
 * loads the portfolio + chain stats + staking position + passport + history, and
 * renders the hero + token list + passport card + activity ledger (left) and the
 * chain-stats + stake panels (right rail). All read failures degrade gracefully
 * (empty/unavailable states, never a thrown render — finding #14). Writes are
 * unlock-gated: a locked wallet opens the UnlockWalletModal.
 */
export function WalletChainApp() {
  const chainId = activeChain().primaryChainId;
  const [view, setView] = useState<View>("loading");
  const [accounts, setAccounts] = useState<WalletAccounts | null>(null);
  const [showUnlock, setShowUnlock] = useState(false);
  const [modal, setModal] = useState<null | "send" | "receive" | "swap" | "bridge">(null);

  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [stats, setStats] = useState<ChainStats | null>(null);
  const [stake, setStake] = useState<StakePosition | null>(null);
  const [passport, setPassport] = useState<PassportStatus | null>(null);
  const [passportError, setPassportError] = useState(false);
  const [history, setHistory] = useState<TxRow[]>([]);

  const stakeEnabled = safeStakingAvailable(chainId);

  // Initial view + auto-lock.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const exists = await hasVault();
      if (!mounted) return;
      if (exists) {
        setAccounts(await loadPublicAccounts());
        setView(isUnlocked() ? "unlocked" : "locked");
      } else {
        setView("create");
      }
    })();
    const teardown = startAutoLock();
    return () => {
      mounted = false;
      teardown();
    };
  }, []);

  const evmAddress = accounts?.evm ?? null;

  // Load all on-chain data. Each read degrades gracefully (never a thrown render).
  const loadAll = useCallback(
    (addr: `0x${string}`, alive: () => boolean) => {
      readChainStats(chainId)
        .then((s) => alive() && setStats(s))
        .catch(() => alive() && setStats(null));

      loadPortfolio(chainId, addr)
        .then((p) => alive() && setPortfolio(p))
        .catch(() => alive() && setPortfolio({ assets: [], totalUsd: 0 }));

      readPassportStatus(chainId, addr)
        .then((s) => {
          if (!alive()) return;
          setPassport(s);
          setPassportError(false);
        })
        .catch(() => {
          if (!alive()) return;
          setPassport(null);
          setPassportError(true);
        });

      evmHistory(chainId, addr)
        .then((rows) => alive() && setHistory(rows))
        .catch(() => alive() && setHistory([]));

      if (stakeEnabled) {
        readStakePosition(chainId, addr)
          .then((p) => alive() && setStake(p))
          .catch(() => alive() && setStake(null));
      }
    },
    [chainId, stakeEnabled],
  );

  useEffect(() => {
    if (!evmAddress) return;
    let alive = true;
    loadAll(evmAddress as `0x${string}`, () => alive);
    return () => {
      alive = false;
    };
  }, [evmAddress, loadAll]);

  /** Re-run all reads (e.g. after a write). */
  const refresh = useCallback(() => {
    if (evmAddress) loadAll(evmAddress as `0x${string}`, () => true);
  }, [evmAddress, loadAll]);

  /** Unlock gate for writes: true when unlocked; opens the unlock modal otherwise. */
  const requireUnlock = useCallback((): boolean => {
    if (isUnlocked()) return true;
    setShowUnlock(true);
    return false;
  }, []);

  const onAction = useCallback((action: WalletAction) => {
    switch (action) {
      case "RECEIVE":
        setModal("receive"); // public address — no unlock needed to view
        return;
      case "SEND":
        setModal("send");
        return;
      case "SWAP":
        setModal("swap");
        return;
      case "BRIDGE":
        setModal("bridge");
        return;
      case "STAKE": {
        document.getElementById("stake-panel-anchor")?.scrollIntoView({ behavior: "smooth" });
        return;
      }
    }
  }, []);

  const onUnlock = useCallback(async (pass: string) => {
    const acc = await unlock(pass);
    setAccounts(acc);
    setShowUnlock(false);
    setView("unlocked");
  }, []);

  if (view === "loading") {
    return (
      <div className="wrap" style={{ padding: "32px 0" }}>
        <p>Loading…</p>
      </div>
    );
  }

  if (view === "create") {
    return (
      <div className="wrap" style={{ padding: "32px 0" }}>
        <div className="kicker">SOVEREIGN WALLET</div>
        <h1 style={{ marginTop: 12 }}>No wallet yet</h1>
        <p style={{ color: "var(--muted)", marginTop: 12 }}>
          Create your embedded wallet first, then return here to manage tokens, staking, and chain
          activity.
        </p>
        <a
          className="btn btn-primary"
          href="/wallet"
          style={{ marginTop: 20, display: "inline-flex" }}
        >
          Create wallet
        </a>
      </div>
    );
  }

  const total = portfolio?.totalUsd ?? 0;
  const assets = portfolio?.assets ?? [];

  return (
    <div className="wrap" style={{ padding: "32px 0" }}>
      <div className="kicker">WALLET &amp; CHAIN</div>
      {view === "locked" && (
        <div
          role="status"
          style={{
            margin: "16px 0",
            padding: "12px 16px",
            background: "var(--paper)",
            border: "1px solid var(--line)",
            fontSize: 13,
            color: "var(--muted)",
          }}
        >
          Wallet is locked — unlock to send, stake, or claim.{" "}
          <button
            className="btn"
            type="button"
            onClick={() => setShowUnlock(true)}
            style={{ marginLeft: 8 }}
          >
            Unlock
          </button>
        </div>
      )}

      <div
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "1fr 360px",
          gap: 24,
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          <PortfolioHeader
            totalUsd={total}
            evmAddress={evmAddress ?? ""}
            chainName={stats?.chainName ?? null}
            blockNumber={stats?.blockNumber ?? null}
            stakingEnabled={stakeEnabled}
            onAction={onAction}
          />
          <TokenList assets={assets} />
          <PassportAssetCard passport={passport} unavailable={passportError} />
          <ActivityLedger rows={history} explorerBase={stats?.explorerBase ?? null} />
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ChainStatsPanel stats={stats} />
          <div id="stake-panel-anchor">
            <StakePanel
              chainId={chainId}
              available={stakeEnabled}
              position={stake}
              requireUnlock={requireUnlock}
              onChanged={refresh}
            />
          </div>
        </aside>
      </div>

      {modal === "receive" && evmAddress && (
        <ReceiveModal address={evmAddress} onClose={() => setModal(null)} />
      )}
      {modal === "send" && evmAddress && (
        <SendModal
          chainId={chainId}
          from={evmAddress as `0x${string}`}
          requireUnlock={requireUnlock}
          onClose={() => {
            setModal(null);
            refresh();
          }}
        />
      )}
      {(modal === "swap" || modal === "bridge") && (
        <SwapBridgeModal mode={modal} onClose={() => setModal(null)} />
      )}

      {showUnlock && (
        <UnlockWalletModal onUnlock={onUnlock} onCancel={() => setShowUnlock(false)} />
      )}
    </div>
  );
}

/** stakingAvailable but never throws in render. */
function safeStakingAvailable(chainId: number): boolean {
  try {
    return stakingAvailable(chainId);
  } catch {
    return false;
  }
}
