"use client";
import { useMemo, useState } from "react";
import { getAddress, parseUnits, type Address } from "viem";
import { previewEvmSend, sendEvm, type EvmSendRequest } from "@/lib/wallet/services/send";
import {
  sendableTokens,
  toSendConfirmVM,
  type SendConfirmVM,
} from "@/lib/wallet/services/sendView";
import { evmEntry } from "@/config/chains.config";

/**
 * SEND modal — two phases.
 *
 * FORM: token picker built from `sendableTokens(chainId)` — native + resolvable
 * ERC-20s INCLUDING $CRYPT (from contractEntry(chainId).token), NEVER the
 * passport (soulbound). Recipient is validated + checksummed via `getAddress`
 * BEFORE "Review" is enabled. If $CRYPT is unregistered on the chain,
 * `sendableTokens` simply omits it (graceful — finding #14).
 *
 * CONFIRM: renders the human-readable `SendConfirmVM` (checksummed to, amount +
 * symbol, chain name, fee + native symbol) — NEVER raw base-unit strings. Only
 * the explicit "Confirm & sign" calls `sendEvm` (unlock-gated).
 */

const NATIVE = "native" as const;

export function SendModal({
  chainId,
  from,
  requireUnlock,
  onClose,
}: {
  chainId: number;
  from: Address;
  requireUnlock: () => boolean;
  onClose: () => void;
}) {
  const nativeSymbol = evmEntry(chainId).viemChain.nativeCurrency.symbol;
  const nativeDecimals = evmEntry(chainId).viemChain.nativeCurrency.decimals;
  const tokens = useMemo(() => sendableTokens(chainId), [chainId]);

  const [selected, setSelected] = useState<string>(NATIVE); // "native" or an address
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [vm, setVm] = useState<SendConfirmVM | null>(null);
  const [req, setReq] = useState<EvmSendRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  const recipientValid = (() => {
    try {
      getAddress(to);
      return true;
    } catch {
      return false;
    }
  })();

  function selectedMeta(): { symbol: string; decimals: number; token?: Address } {
    if (selected === NATIVE) return { symbol: nativeSymbol, decimals: nativeDecimals };
    const t = tokens.find((x) => x.address?.toLowerCase() === selected.toLowerCase());
    if (!t || !t.address) throw new Error("Unknown token selection.");
    return { symbol: t.symbol, decimals: t.decimals, token: t.address };
  }

  async function review() {
    setError(null);
    if (!recipientValid) {
      setError("Enter a valid recipient address.");
      return;
    }
    let amountWei: bigint;
    let meta: { symbol: string; decimals: number; token?: Address };
    try {
      meta = selectedMeta();
      amountWei = parseUnits(amount, meta.decimals);
      if (amountWei <= 0n) throw new Error("zero");
    } catch {
      setError("Enter a valid amount.");
      return;
    }
    setBusy(true);
    try {
      const request: EvmSendRequest = {
        chainId,
        to: getAddress(to) as Address,
        amount: amountWei,
        token: meta.token,
      };
      const preview = await previewEvmSend(request, from);
      const confirmVm = toSendConfirmVM(preview);
      setReq(request);
      setVm(confirmVm);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build the send preview.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!req) return;
    if (!requireUnlock()) return;
    setBusy(true);
    setError(null);
    try {
      const hash = await sendEvm(req);
      setTxHash(hash);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Send"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,31,51,0.6)",
        display: "grid",
        placeItems: "center",
        zIndex: 50,
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#fff",
          border: "1px solid var(--line)",
          borderRadius: 12,
          padding: 24,
          width: "min(480px, 94vw)",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Send</h2>

        {txHash ? (
          <div>
            <p data-testid="send-tx">
              Submitted:{" "}
              <span style={{ fontFamily: "var(--mono, monospace)", wordBreak: "break-all" }}>
                {txHash}
              </span>
            </p>
            <div style={{ marginTop: 16 }}>
              <button className="btn btn-primary" type="button" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : vm ? (
          // CONFIRM — human-readable, never raw wei.
          <div data-testid="send-confirm">
            <dl style={{ fontSize: 14, lineHeight: 1.8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <dt style={{ color: "var(--muted)" }}>To</dt>
                <dd
                  data-testid="confirm-to"
                  style={{ margin: 0, fontFamily: "var(--mono, monospace)", fontSize: 12 }}
                >
                  {vm.to}
                </dd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <dt style={{ color: "var(--muted)" }}>Amount</dt>
                <dd data-testid="confirm-amount" style={{ margin: 0 }}>
                  {vm.amountDisplay} {vm.tokenSymbol}
                </dd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <dt style={{ color: "var(--muted)" }}>Chain</dt>
                <dd data-testid="confirm-chain" style={{ margin: 0 }}>
                  {vm.chainName}
                </dd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <dt style={{ color: "var(--muted)" }}>Est. fee</dt>
                <dd data-testid="confirm-fee" style={{ margin: 0 }}>
                  {vm.feeDisplay} {vm.feeSymbol}
                </dd>
              </div>
            </dl>
            {error && (
              <p role="alert" style={{ color: "#8b3a3a", marginTop: 12 }}>
                {error}
              </p>
            )}
            <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
              <button
                className="btn btn-primary"
                type="button"
                disabled={busy}
                onClick={confirm}
                data-testid="confirm-sign"
              >
                {busy ? "Signing…" : "Confirm & sign"}
              </button>
              <button className="btn" type="button" disabled={busy} onClick={() => setVm(null)}>
                Back
              </button>
            </div>
          </div>
        ) : (
          // FORM
          <div>
            <label style={{ display: "block", fontSize: 12, marginBottom: 6 }}>
              Token
              <select
                data-testid="token-picker"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                style={{
                  width: "100%",
                  marginTop: 6,
                  padding: 10,
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                }}
              >
                <option value={NATIVE}>{nativeSymbol} (native)</option>
                {tokens.map((t) => (
                  <option key={t.address} value={t.address}>
                    {t.symbol}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "block", fontSize: 12, marginTop: 12, marginBottom: 6 }}>
              Recipient
              <input
                data-testid="recipient-input"
                type="text"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="0x…"
                style={{
                  width: "100%",
                  marginTop: 6,
                  padding: 10,
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                }}
              />
            </label>
            {to.length > 0 && !recipientValid && (
              <p role="alert" style={{ color: "#8b3a3a", fontSize: 12, marginTop: 4 }}>
                Invalid recipient address.
              </p>
            )}

            <label style={{ display: "block", fontSize: 12, marginTop: 12, marginBottom: 6 }}>
              Amount
              <input
                data-testid="amount-input"
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

            {error && (
              <p role="alert" style={{ color: "#8b3a3a", marginTop: 12 }}>
                {error}
              </p>
            )}

            <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
              <button
                className="btn btn-primary"
                type="button"
                disabled={!recipientValid || busy}
                onClick={review}
                data-testid="review-send"
              >
                {busy ? "Reviewing…" : "Review"}
              </button>
              <button className="btn" type="button" onClick={onClose} disabled={busy}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
