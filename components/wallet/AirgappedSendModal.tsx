"use client";
import { useMemo, useState } from "react";
import { getAddress, parseUnits, type Address } from "viem";
import type { EvmSendRequest } from "@/lib/wallet/services/call";
import { buildUnsignedTx } from "@/lib/wallet/airgapped/build";
import { broadcastSignedRaw } from "@/lib/wallet/airgapped/broadcast";
import {
  encodeUnsigned,
  encodeUnsignedToQr,
  decodeSigned,
  type UnsignedEnvelope,
} from "@/lib/wallet/airgapped/codec";
import { publicClientFor } from "@/lib/wallet/services/evmClients";
import {
  sendableTokens,
  toSendConfirmVM,
  type SendConfirmVM,
} from "@/lib/wallet/services/sendView";
import { evmEntry } from "@/config/chains.config";
import { QrScanner } from "./QrScanner";
import { WatchOnlyBadge } from "./WatchOnlyBadge";

const NATIVE = "native" as const;

type Phase =
  | { step: "compose" }
  | { step: "toolarge"; message: string }
  | { step: "unsigned"; env: UnsignedEnvelope; qr: string; text: string; vm: SendConfirmVM }
  | { step: "scan"; env: UnsignedEnvelope }
  | { step: "broadcasting"; hash: `0x${string}` | null }
  | { step: "sent"; hash: `0x${string}` };

/**
 * WATCH-ONLY air-gapped SEND (Wave 11 C4) — a strict honest state machine:
 * compose → UNSIGNED QR (this device holds no key) → scan the SIGNED raw tx
 * from the offline signer → broadcast → receipt. "Sent" is claimed ONLY on a
 * confirmed receipt; garbage scans, reverts, and broadcast errors surface
 * honestly and are retryable.
 */
export function AirgappedSendModal({
  chainId,
  from,
  onClose,
}: {
  chainId: number;
  from: Address;
  onClose: () => void;
}) {
  const nativeMeta = evmEntry(chainId).viemChain.nativeCurrency;
  const tokens = useMemo(() => sendableTokens(chainId), [chainId]);

  const [phase, setPhase] = useState<Phase>({ step: "compose" });
  const [selected, setSelected] = useState<string>(NATIVE);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const recipientValid = (() => {
    try {
      getAddress(to);
      return true;
    } catch {
      return false;
    }
  })();

  async function buildUnsigned() {
    setError(null);
    let token: Address | undefined;
    let decimals = nativeMeta.decimals;
    if (selected !== NATIVE) {
      const t = tokens.find((x) => x.address?.toLowerCase() === selected.toLowerCase());
      if (!t?.address) {
        setError("Unknown token selection.");
        return;
      }
      token = t.address;
      decimals = t.decimals;
    }
    let amountWei: bigint;
    try {
      amountWei = parseUnits(amount, decimals);
      if (amountWei <= 0n) throw new Error("zero");
    } catch {
      setError("Enter a valid amount.");
      return;
    }
    setBusy(true);
    try {
      const req: EvmSendRequest = {
        chainId,
        to: getAddress(to) as Address,
        amount: amountWei,
        token,
      };
      const env = await buildUnsignedTx(req, from);
      const text = encodeUnsigned(env);
      const qr = await encodeUnsignedToQr(env);
      const vm = toSendConfirmVM({
        to: req.to,
        amount: req.amount.toString(),
        token: req.token ?? "native",
        chainId,
        feeEstimate: (env.tx.gas * env.tx.maxFeePerGas).toString(),
      });
      setPhase({ step: "unsigned", env, qr, text, vm });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not build the transaction.";
      if (/too large for one QR/i.test(message)) {
        setPhase({ step: "toolarge", message });
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onScanned(env: UnsignedEnvelope, text: string) {
    // Validate BEFORE any network call — garbage never reaches broadcast and
    // never produces a fake "signed" state.
    let signedRaw: string;
    try {
      signedRaw = decodeSigned(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That is not a signed transaction.");
      return;
    }
    setError(null);
    setPhase({ step: "broadcasting", hash: null });
    try {
      const hash = await broadcastSignedRaw(chainId, signedRaw);
      setPhase({ step: "broadcasting", hash });
      const receipt = await publicClientFor(chainId).waitForTransactionReceipt({ hash });
      if (receipt.status === "success") {
        setPhase({ step: "sent", hash });
      } else {
        setError("Transaction reverted on chain.");
        setPhase({ step: "scan", env });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Broadcast failed.");
      setPhase({ step: "scan", env });
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Air-gapped send"
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Air-gapped send</h2>
          <WatchOnlyBadge />
        </div>

        {phase.step === "compose" && (
          <div style={{ marginTop: 14 }} data-testid="airgapped-compose">
            <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 0 }}>
              This device builds an UNSIGNED transaction and shows it as a QR code. Your offline
              signer signs it; you scan the signed code back here to broadcast.
            </p>
            <label style={{ display: "block", fontSize: 12, marginBottom: 6 }}>
              Token
              <select
                data-testid="ag-token-picker"
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
                <option value={NATIVE}>{nativeMeta.symbol} (native)</option>
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
                data-testid="ag-recipient"
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
              <p role="alert" style={{ color: "#b00020", fontSize: 12, marginTop: 4 }}>
                Invalid recipient address.
              </p>
            )}
            <label style={{ display: "block", fontSize: 12, marginTop: 12, marginBottom: 6 }}>
              Amount
              <input
                data-testid="ag-amount"
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
              <p role="alert" style={{ color: "#b00020", marginTop: 10 }}>
                {error}
              </p>
            )}
            <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
              <button
                className="btn btn-primary"
                type="button"
                data-testid="ag-build"
                disabled={!recipientValid || busy}
                onClick={buildUnsigned}
              >
                {busy ? "Building…" : "Build unsigned transaction"}
              </button>
              <button className="btn" type="button" onClick={onClose} disabled={busy}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {phase.step === "toolarge" && (
          <div style={{ marginTop: 14 }} data-testid="ag-toolarge">
            <p role="alert" style={{ color: "#b00020" }}>
              {phase.message}
            </p>
            <p style={{ color: "var(--muted)", fontSize: 12 }}>
              Multi-part QR (BC-UR) is planned follow-up work; until then, keep the transaction
              small enough for a single code.
            </p>
            <button
              className="btn"
              type="button"
              onClick={() => setPhase({ step: "compose" })}
              style={{ marginTop: 8 }}
            >
              Back
            </button>
          </div>
        )}

        {phase.step === "unsigned" && (
          <div style={{ marginTop: 14 }} data-testid="ag-unsigned">
            <dl style={{ fontSize: 14, lineHeight: 1.8, margin: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <dt style={{ color: "var(--muted)" }}>To</dt>
                <dd
                  data-testid="ag-summary-to"
                  style={{ margin: 0, fontFamily: "var(--mono, monospace)", fontSize: 12 }}
                >
                  {phase.vm.to}
                </dd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <dt style={{ color: "var(--muted)" }}>Amount</dt>
                <dd data-testid="ag-summary-amount" style={{ margin: 0 }}>
                  {phase.vm.amountDisplay} {phase.vm.tokenSymbol}
                </dd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <dt style={{ color: "var(--muted)" }}>Est. fee</dt>
                <dd style={{ margin: 0 }}>
                  {phase.vm.feeDisplay} {phase.vm.feeSymbol}
                </dd>
              </div>
            </dl>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              data-testid="ag-unsigned-qr"
              src={phase.qr}
              alt="Unsigned transaction QR code — scan with the offline signer"
              width={260}
              style={{ display: "block", marginTop: 12 }}
            />
            <details style={{ marginTop: 10 }}>
              <summary style={{ fontSize: 12, cursor: "pointer" }}>
                Copy as text (for a paste-based signer)
              </summary>
              <textarea
                readOnly
                value={phase.text}
                rows={4}
                data-testid="ag-unsigned-text"
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
            <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
              <button
                className="btn btn-primary"
                type="button"
                data-testid="ag-have-signed"
                onClick={() => setPhase({ step: "scan", env: phase.env })}
              >
                I have the signed code — scan it
              </button>
              <button className="btn" type="button" onClick={() => setPhase({ step: "compose" })}>
                Back
              </button>
            </div>
          </div>
        )}

        {phase.step === "scan" && (
          <div style={{ marginTop: 14 }} data-testid="ag-scan">
            {error && (
              <p role="alert" style={{ color: "#b00020", marginBottom: 10 }}>
                {error}
              </p>
            )}
            <QrScanner
              label="Scan the SIGNED transaction code from your offline signer (or paste it)."
              onResult={(text) => void onScanned(phase.env, text)}
              onCancel={onClose}
            />
          </div>
        )}

        {phase.step === "broadcasting" && (
          <div style={{ marginTop: 14 }} data-testid="ag-broadcasting">
            <p>
              {phase.hash
                ? "Broadcast — waiting for the chain to confirm…"
                : "Broadcasting the signed transaction…"}
            </p>
            {phase.hash && (
              <p
                style={{
                  fontFamily: "var(--mono, monospace)",
                  fontSize: 12,
                  overflowWrap: "anywhere",
                }}
              >
                {phase.hash}
              </p>
            )}
          </div>
        )}

        {phase.step === "sent" && (
          <div style={{ marginTop: 14 }} data-testid="ag-sent">
            <p>Confirmed on chain ✓</p>
            <p
              data-testid="ag-sent-hash"
              style={{
                fontFamily: "var(--mono, monospace)",
                fontSize: 12,
                overflowWrap: "anywhere",
              }}
            >
              {phase.hash}
            </p>
            <button className="btn btn-primary" type="button" onClick={onClose}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
