"use client";
import { useState } from "react";
import { formatUnits } from "viem";
import {
  decodeUnsigned,
  decodeEnvelopeForDisplay,
  encodeSigned,
  encodeSignedToQr,
  type UnsignedEnvelope,
  type DecodedEnvelope,
} from "@/lib/wallet/airgapped/codec";
import { signUnsignedEnvelope } from "@/lib/wallet/airgapped/sign";
import { sendableTokens } from "@/lib/wallet/services/sendView";
import { evmEntry } from "@/config/chains.config";
import { QrScanner } from "./QrScanner";

type Phase =
  | { step: "scan" }
  | { step: "review"; env: UnsignedEnvelope; view: ReviewView }
  | { step: "signed"; qr: string; text: string };

interface ReviewView {
  recipient: string;
  amountDisplay: string;
  tokenSymbol: string;
  tokenContract?: string;
  chainName: string;
  feeDisplay: string;
  nativeSymbol: string;
}

/**
 * OFFLINE SIGNER (Wave 11 C5) — for an UNLOCKED embedded wallet on an
 * air-gapped device: scan (or paste) an unsigned envelope, review the
 * HONESTLY-DECODED transaction, sign locally, and show the signed QR.
 *
 * ERC-20 HONESTY (the whole point of air-gapped review): the envelope's raw
 * `tx.to` for an ERC-20 send is the TOKEN CONTRACT and `tx.value` is 0 — the
 * true recipient + amount are decoded from the transfer calldata
 * (decodeEnvelopeForDisplay); the token contract is ALSO surfaced so the
 * signer can verify what it is signing. NO broadcast affordance exists here —
 * this device never touches the network for transactions.
 */
export function OfflineSignModal({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>({ step: "scan" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function buildReview(env: UnsignedEnvelope, decoded: DecodedEnvelope): ReviewView {
    const entry = evmEntry(env.chainId);
    const native = entry.viemChain.nativeCurrency;
    let tokenSymbol = native.symbol;
    let decimals = native.decimals;
    if (decoded.isErc20) {
      const meta = sendableTokens(env.chainId).find(
        (t) => t.address?.toLowerCase() === decoded.tokenContract?.toLowerCase(),
      );
      tokenSymbol = meta?.symbol ?? "UNKNOWN TOKEN";
      decimals = meta?.decimals ?? 18;
    }
    return {
      recipient: decoded.recipient,
      amountDisplay: formatUnits(decoded.amount, decimals),
      tokenSymbol,
      tokenContract: decoded.tokenContract,
      chainName: entry.viemChain.name,
      feeDisplay: formatUnits(env.tx.gas * env.tx.maxFeePerGas, native.decimals),
      nativeSymbol: native.symbol,
    };
  }

  function onScanned(text: string) {
    try {
      const env = decodeUnsigned(text);
      const decoded = decodeEnvelopeForDisplay(env);
      setError(null);
      setPhase({ step: "review", env, view: buildReview(env, decoded) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That is not an unsigned transaction request.");
    }
  }

  async function sign(env: UnsignedEnvelope) {
    setBusy(true);
    setError(null);
    try {
      const signed = await signUnsignedEnvelope(env);
      const text = encodeSigned(signed);
      const qr = await encodeSignedToQr(signed);
      setPhase({ step: "signed", qr, text });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Signing failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sign a transaction request"
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
          width: "min(560px, 94vw)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <h2 style={{ margin: 0 }}>Sign a transaction request</h2>
        <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>
          This device signs OFFLINE and never broadcasts — the signed code travels back by QR.
        </p>

        {phase.step === "scan" && (
          <div style={{ marginTop: 14 }} data-testid="offline-scan">
            {error && (
              <p role="alert" style={{ color: "#b00020", marginBottom: 10 }}>
                {error}
              </p>
            )}
            <QrScanner
              label="Scan the UNSIGNED transaction code from the watch-only device (or paste it)."
              onResult={onScanned}
              onCancel={onClose}
            />
          </div>
        )}

        {phase.step === "review" && (
          <div style={{ marginTop: 14 }} data-testid="offline-review">
            <dl style={{ fontSize: 14, lineHeight: 1.9, margin: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <dt style={{ color: "var(--muted)" }}>Recipient</dt>
                <dd
                  data-testid="offline-recipient"
                  style={{
                    margin: 0,
                    fontFamily: "var(--mono, monospace)",
                    fontSize: 12,
                    overflowWrap: "anywhere",
                  }}
                >
                  {phase.view.recipient}
                </dd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <dt style={{ color: "var(--muted)" }}>Amount</dt>
                <dd data-testid="offline-amount" style={{ margin: 0 }}>
                  {phase.view.amountDisplay} {phase.view.tokenSymbol}
                </dd>
              </div>
              {phase.view.tokenContract && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <dt style={{ color: "var(--muted)" }}>Token contract</dt>
                  <dd
                    data-testid="offline-token-contract"
                    style={{
                      margin: 0,
                      fontFamily: "var(--mono, monospace)",
                      fontSize: 12,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {phase.view.tokenContract}
                  </dd>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <dt style={{ color: "var(--muted)" }}>Chain</dt>
                <dd data-testid="offline-chain" style={{ margin: 0 }}>
                  {phase.view.chainName}
                </dd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <dt style={{ color: "var(--muted)" }}>Max fee</dt>
                <dd style={{ margin: 0 }}>
                  {phase.view.feeDisplay} {phase.view.nativeSymbol}
                </dd>
              </div>
            </dl>
            {error && (
              <p role="alert" style={{ color: "#b00020", marginTop: 10 }}>
                {error}
              </p>
            )}
            <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
              <button
                className="btn btn-primary"
                type="button"
                data-testid="offline-sign-confirm"
                disabled={busy}
                onClick={() => void sign(phase.env)}
              >
                {busy ? "Signing…" : "Sign this transaction"}
              </button>
              <button
                className="btn"
                type="button"
                disabled={busy}
                onClick={() => setPhase({ step: "scan" })}
              >
                Back
              </button>
              <button className="btn" type="button" disabled={busy} onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {phase.step === "signed" && (
          <div style={{ marginTop: 14 }} data-testid="offline-signed">
            <p style={{ margin: 0 }}>
              Signed ✓ — scan this code with the watch-only device to broadcast.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              data-testid="offline-signed-qr"
              src={phase.qr}
              alt="Signed transaction QR code — scan with the watch-only device"
              width={260}
              style={{ display: "block", marginTop: 12 }}
            />
            <details style={{ marginTop: 10 }}>
              <summary style={{ fontSize: 12, cursor: "pointer" }}>Copy as text</summary>
              <textarea
                readOnly
                value={phase.text}
                rows={4}
                data-testid="offline-signed-text"
                style={{
                  width: "100%",
                  marginTop: 8,
                  padding: 10,
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  fontFamily: "var(--mono, monospace)",
                  fontSize: 11,
                }}
              />
            </details>
            <button
              className="btn btn-primary"
              type="button"
              onClick={onClose}
              style={{ marginTop: 14 }}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
