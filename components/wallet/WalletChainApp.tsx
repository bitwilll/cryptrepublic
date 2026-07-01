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

type View = "loading" | "create" | "locked" | "unlocked";

/**
 * Wallet & Chain screen orchestrator (client island). Resolves the active chain,
 * loads the portfolio + chain stats + staking position + passport + history, and
 * renders the hero + token list + chain stats. All read failures degrade
 * gracefully (empty/unavailable states, never a thrown render — finding #14).
 * Writes are unlock-gated: a locked wallet opens the UnlockWalletModal.
 *
 * Modals (Send/Receive/Swap/Bridge) and the stake panel / passport card /
 * activity ledger are wired in later Wave 6 tasks; the action buttons already
 * open the unlock flow when locked.
 */
export function WalletChainApp() {
  const chainId = activeChain().primaryChainId;
  const [view, setView] = useState<View>("loading");
  const [accounts, setAccounts] = useState<WalletAccounts | null>(null);
  const [showUnlock, setShowUnlock] = useState(false);
  const [pendingAction, setPendingAction] = useState<WalletAction | null>(null);

  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [stats, setStats] = useState<ChainStats | null>(null);
  const [stake, setStake] = useState<StakePosition | null>(null);
  // `passport` + `history` are read now (proving graceful degradation) and consumed
  // by the PassportAssetCard / ActivityLedger wired in Task 10 — only the setters
  // are bound here to avoid unused-var churn before those cards land.
  const [, setPassport] = useState<PassportStatus | null>(null);
  const [, setHistory] = useState<TxRow[]>([]);

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

  // Load on-chain data once we know the address. Each read degrades gracefully.
  const evmAddress = accounts?.evm ?? null;
  useEffect(() => {
    if (!evmAddress) return;
    let mounted = true;
    const addr = evmAddress as `0x${string}`;

    readChainStats(chainId)
      .then((s) => mounted && setStats(s))
      .catch(() => mounted && setStats(null));

    loadPortfolio(chainId, addr)
      .then((p) => mounted && setPortfolio(p))
      .catch(() => mounted && setPortfolio({ assets: [], totalUsd: 0 }));

    readPassportStatus(chainId, addr)
      .then((s) => mounted && setPassport(s))
      .catch(() => mounted && setPassport(null));

    evmHistory(chainId, addr)
      .then((rows) => mounted && setHistory(rows))
      .catch(() => mounted && setHistory([]));

    if (stakeEnabled) {
      readStakePosition(chainId, addr)
        .then((p) => mounted && setStake(p))
        .catch(() => mounted && setStake(null));
    }
    return () => {
      mounted = false;
    };
  }, [evmAddress, chainId, stakeEnabled]);

  const onAction = useCallback((action: WalletAction) => {
    if (!isUnlocked()) {
      setPendingAction(action);
      setShowUnlock(true);
      return;
    }
    // Modal wiring for each action lands in later Wave 6 tasks.
    setPendingAction(action);
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
          {/* PassportAssetCard + ActivityLedger land in Task 10. */}
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ChainStatsPanel stats={stats} />
          {/* StakePanel lands in Task 9 (uses `stake` + `stakeEnabled`). */}
          {stakeEnabled && stake && (
            <article className="pillar" style={{ padding: 22 }} data-testid="stake-summary">
              <div
                style={{
                  fontSize: 10,
                  color: "var(--muted)",
                  letterSpacing: "0.12em",
                  fontWeight: 700,
                }}
              >
                YOUR STAKE
              </div>
              <div style={{ marginTop: 8, fontSize: 12, fontFamily: "var(--mono)" }}>
                {(stake.aprBps / 100).toFixed(2)}% APR
              </div>
            </article>
          )}
        </aside>
      </div>

      {showUnlock && (
        <UnlockWalletModal
          onUnlock={onUnlock}
          onCancel={() => {
            setShowUnlock(false);
            setPendingAction(null);
          }}
        />
      )}
      {/* pendingAction is consumed by the modals wired in later tasks. */}
      <span hidden data-testid="pending-action">
        {pendingAction ?? ""}
      </span>
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
