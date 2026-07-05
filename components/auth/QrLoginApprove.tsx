"use client";
import { useState } from "react";
import { SiweMessage } from "siwe";
import { getAddress } from "viem";
import { getAccounts, withEvmSigner } from "@/lib/wallet/embedded/session";
import { decodeQrLogin, type QrLoginEnvelope } from "@/lib/auth/qrLogin/codec";
import { QrScanner } from "@/components/wallet/QrScanner";

type Phase = "scan" | "confirm" | "busy" | "done" | "error";

/**
 * Device B (holds the wallet): scan a sign-in code shown on another device,
 * confirm the matchCode + domain, then SIGN a SIWE message LOCALLY with the
 * unlocked embedded wallet and POST it to approve. The key never leaves the
 * device; this device receives NO session (only the scanning device's poll
 * does). `requireUnlock` gates on the vault being unlocked (mirrors
 * VerifyWalletCard) — it returns false and prompts an unlock if locked.
 */
export function QrLoginApprove({ requireUnlock }: { requireUnlock: () => boolean }) {
  const [phase, setPhase] = useState<Phase>("scan");
  const [env, setEnv] = useState<QrLoginEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onScan(text: string) {
    setError(null);
    try {
      setEnv(decodeQrLogin(text));
      setPhase("confirm");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Not a CryptRepublic sign-in code.");
      setPhase("error");
    }
  }

  async function approve() {
    if (!env) return;
    if (!requireUnlock()) return;
    setPhase("busy");
    setError(null);
    try {
      const accounts = getAccounts();
      if (!accounts?.evm) throw new Error("No wallet on this device to approve with.");
      const address = getAddress(accounts.evm);
      const message = new SiweMessage({
        domain: env.domain,
        address,
        statement: "Approve a CryptRepublic wallet-QR login.",
        uri: env.uri,
        version: "1",
        chainId: env.chainId,
        nonce: env.nonce,
        issuedAt: new Date().toISOString(),
      }).prepareMessage();
      const signature = await withEvmSigner(async (account) => {
        if (!account.signMessage) throw new Error("Signer cannot sign messages.");
        return account.signMessage({ message });
      });
      const res = await fetch("/api/auth/qr/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ challengeId: env.challengeId, message, signature }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Approval failed.");
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approval failed.");
      setPhase("error");
    }
  }

  function reset() {
    setEnv(null);
    setError(null);
    setPhase("scan");
  }

  return (
    <div data-testid="qr-approve">
      {phase === "scan" && (
        <QrScanner label="Scan the sign-in code shown on your other device" onResult={onScan} />
      )}

      {phase === "confirm" && env && (
        <div className="pillar" style={{ padding: "16px 20px" }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Approve this sign-in?</h3>
          <div style={{ marginTop: 12, display: "flex", gap: 20, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: "0.1em", color: "var(--muted)" }}>
                CODE
              </div>
              <div
                data-testid="qr-approve-matchcode"
                style={{
                  fontFamily: "var(--mono, monospace)",
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: "0.18em",
                }}
              >
                {env.matchCode}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, letterSpacing: "0.1em", color: "var(--muted)" }}>SITE</div>
              <div data-testid="qr-approve-domain" style={{ fontSize: 15, fontWeight: 600 }}>
                {env.domain}
              </div>
            </div>
          </div>
          <p style={{ color: "var(--muted)", marginTop: 12, fontSize: 12, maxWidth: 420 }}>
            Only approve a sign-in <b>you</b> started, and only if this code matches the one on your
            other screen. Approving signs that device in to your account.
          </p>
          <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
            <button
              className="btn btn-primary"
              type="button"
              data-testid="qr-approve-confirm"
              onClick={() => void approve()}
            >
              Approve sign-in
            </button>
            <button className="btn" type="button" onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {phase === "busy" && <p style={{ fontSize: 13 }}>Signing locally…</p>}

      {phase === "done" && (
        <p data-testid="qr-approve-done" style={{ color: "var(--gold, #c8a96a)", fontSize: 14 }}>
          Approved ✓ — return to your other device; it will sign in.
        </p>
      )}

      {phase === "error" && (
        <div>
          <p role="alert" data-testid="qr-approve-error" style={{ color: "#b00020", fontSize: 13 }}>
            {error}
          </p>
          <button className="btn" type="button" onClick={reset} style={{ marginTop: 8 }}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
