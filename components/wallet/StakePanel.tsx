"use client";
import { useState } from "react";
import { formatUnits, getAddress, parseUnits } from "viem";
import {
  approveCryptEmbedded,
  claimEmbedded,
  readCryptAllowance,
  stakeEmbedded,
  unstakeEmbedded,
  type StakePosition,
} from "@/lib/wallet/services/staking";
import { getAccounts } from "@/lib/wallet/embedded/session";

/**
 * STAKE / UNSTAKE / CLAIM panel (right rail). Renders a graceful "unavailable"
 * state when staking is unavailable (probe caught upstream — finding #14). $CRYPT
 * is 18 decimals.
 *
 * STAKE ordering (findings #5/#6): read allowance; if it covers the amount, SKIP
 * approve; else approve the EXACT amount (spender = staking) → `approveCryptEmbedded`
 * (which AWAITS its receipt) MUST FULLY RESOLVE before the stake step simulates or
 * sends — stake's on-chain simulate reverts on a stale allowance (TOCTOU). Max-
 * approve is an explicit opt-in, default OFF.
 *
 * CLAIM confirm states the payout is "up to earned, capped by the reward pool" —
 * it never promises the full `earned` figure (the contract caps at
 * rewardPoolRemaining).
 */

const CRYPT_DECIMALS = 18;
const MAX_UINT = 2n ** 256n - 1n;

type Flow = null | "stake" | "unstake" | "claim";

function fmt(v: bigint): string {
  return Number(formatUnits(v, CRYPT_DECIMALS)).toLocaleString("en-US", {
    maximumFractionDigits: 6,
  });
}

export function StakePanel({
  chainId,
  available,
  position,
  requireUnlock,
  onChanged,
}: {
  chainId: number;
  available: boolean;
  position: StakePosition | null;
  requireUnlock: () => boolean;
  onChanged: () => void;
}) {
  const [flow, setFlow] = useState<Flow>(null);
  const [amount, setAmount] = useState("");
  const [maxApprove, setMaxApprove] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  if (!available) {
    return (
      <article className="pillar" style={{ padding: 22 }} data-testid="stake-panel">
        <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.12em", fontWeight: 700 }}>
          VALIDATOR STAKE
        </div>
        <p data-testid="stake-unavailable" style={{ marginTop: 12, color: "var(--muted)", fontSize: 13 }}>
          Staking is unavailable on this network.
        </p>
      </article>
    );
  }

  function reset() {
    setFlow(null);
    setAmount("");
    setError(null);
    setBusy(null);
    setTxHash(null);
    setMaxApprove(false);
  }

  function ownerAddress() {
    const evm = getAccounts()?.evm;
    if (!evm) throw new Error("No wallet address.");
    return getAddress(evm);
  }

  async function runStake() {
    setError(null);
    setTxHash(null);
    let amountWei: bigint;
    try {
      amountWei = parseUnits(amount, CRYPT_DECIMALS);
      if (amountWei <= 0n) throw new Error("zero");
    } catch {
      setError("Enter a valid amount.");
      return;
    }
    if (!requireUnlock()) return;

    try {
      const owner = ownerAddress();
      const allowance = await readCryptAllowance(chainId, owner);
      // Approve ONLY if the current allowance does not cover the amount.
      if (allowance < amountWei) {
        setBusy("approve");
        const approveAmount = maxApprove ? MAX_UINT : amountWei;
        // AWAIT the approve to full confirmation (writeEmbedded waits for the
        // receipt) BEFORE the stake simulates — otherwise stake reverts on the
        // stale on-chain allowance (TOCTOU — finding #6).
        await approveCryptEmbedded(chainId, approveAmount);
      }
      setBusy("stake");
      const hash = await stakeEmbedded(chainId, amountWei);
      setTxHash(hash);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stake failed.");
    } finally {
      setBusy(null);
    }
  }

  async function runUnstake() {
    setError(null);
    setTxHash(null);
    let amountWei: bigint;
    try {
      amountWei = parseUnits(amount, CRYPT_DECIMALS);
      if (amountWei <= 0n) throw new Error("zero");
    } catch {
      setError("Enter a valid amount.");
      return;
    }
    if (!requireUnlock()) return;
    try {
      setBusy("unstake");
      const hash = await unstakeEmbedded(chainId, amountWei);
      setTxHash(hash);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unstake failed.");
    } finally {
      setBusy(null);
    }
  }

  async function runClaim() {
    setError(null);
    setTxHash(null);
    if (!requireUnlock()) return;
    try {
      setBusy("claim");
      const hash = await claimEmbedded(chainId);
      setTxHash(hash);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Claim failed.");
    } finally {
      setBusy(null);
    }
  }

  const aprPct = position ? (position.aprBps / 100).toString() : "—";

  return (
    <article className="pillar" style={{ padding: 22 }} data-testid="stake-panel">
      <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.12em", fontWeight: 700 }}>
        VALIDATOR STAKE
      </div>

      <div style={{ marginTop: 10 }}>
        <div
          data-testid="staked-amount"
          style={{ fontSize: 26, fontWeight: 800, color: "var(--gold)", letterSpacing: "-0.02em" }}
        >
          {position ? fmt(position.staked) : "—"} $CRYPT
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono, monospace)" }}>
          <span data-testid="apr">{aprPct}%</span> APR ·{" "}
          <span data-testid="earned">{position ? fmt(position.earned) : "—"}</span> earned · TVL{" "}
          <span data-testid="tvl">{position ? fmt(position.totalStaked) : "—"}</span>
        </div>
      </div>

      {flow === null && (
        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-primary" type="button" onClick={() => setFlow("stake")}>
            Stake
          </button>
          <button className="btn" type="button" onClick={() => setFlow("unstake")}>
            Unstake
          </button>
          <button className="btn" type="button" onClick={() => setFlow("claim")}>
            Claim
          </button>
        </div>
      )}

      {(flow === "stake" || flow === "unstake") && (
        <div style={{ marginTop: 14 }}>
          <label style={{ display: "block", fontSize: 12, marginBottom: 6 }}>
            Amount ($CRYPT)
            <input
              data-testid="stake-amount-input"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{
                width: "100%",
                marginTop: 6,
                padding: 10,
                border: "1px solid var(--line)",
                borderRadius: 8,
              }}
            />
          </label>

          {flow === "stake" && (
            <>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, marginTop: 8 }}>
                <input
                  data-testid="max-approve-toggle"
                  type="checkbox"
                  checked={maxApprove}
                  onChange={(e) => setMaxApprove(e.target.checked)}
                />
                Approve unlimited (opt-in — approves the exact amount by default)
              </label>
              <p style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
                Staking may require a one-time approve of the exact amount to the staking contract
                first. Approve confirms fully before the stake is sent.
              </p>
            </>
          )}

          {error && (
            <p role="alert" style={{ color: "#b00020", marginTop: 10, fontSize: 12 }}>
              {error}
            </p>
          )}
          {txHash && (
            <p data-testid="stake-tx" style={{ marginTop: 10, fontSize: 12 }}>
              Submitted: <span style={{ fontFamily: "var(--mono, monospace)" }}>{txHash}</span>
            </p>
          )}

          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy !== null}
              onClick={flow === "stake" ? runStake : runUnstake}
              data-testid={`confirm-${flow}`}
            >
              {busy === "approve"
                ? "Approving…"
                : busy === flow
                  ? `${flow === "stake" ? "Staking" : "Unstaking"}…`
                  : `Confirm ${flow}`}
            </button>
            <button className="btn" type="button" onClick={reset} disabled={busy !== null}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {flow === "claim" && (
        <div style={{ marginTop: 14 }}>
          <p data-testid="claim-cap-note" style={{ fontSize: 12, color: "var(--muted)" }}>
            You will receive up to your earned rewards ({position ? fmt(position.earned) : "—"}{" "}
            $CRYPT), capped by the reward pool ({position ? fmt(position.rewardPoolRemaining) : "—"}{" "}
            $CRYPT remaining). The payout may be less than earned if the pool is short.
          </p>
          {error && (
            <p role="alert" style={{ color: "#b00020", marginTop: 10, fontSize: 12 }}>
              {error}
            </p>
          )}
          {txHash && (
            <p data-testid="stake-tx" style={{ marginTop: 10, fontSize: 12 }}>
              Submitted: <span style={{ fontFamily: "var(--mono, monospace)" }}>{txHash}</span>
            </p>
          )}
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy !== null}
              onClick={runClaim}
              data-testid="confirm-claim"
            >
              {busy === "claim" ? "Claiming…" : "Confirm claim"}
            </button>
            <button className="btn" type="button" onClick={reset} disabled={busy !== null}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
