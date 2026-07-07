"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { encodeQrLoginToDataUrl, type QrLoginEnvelope } from "@/lib/auth/qrLogin/codec";

type Phase = "loading" | "waiting" | "approved" | "expired" | "error";

const POLL_MS = 2000;

/**
 * Device A (the browser signing IN): opens a cross-device wallet-QR login,
 * renders the QR + a matchCode, and polls for approval. The QR envelope is
 * PUBLIC only (no secret). The session cookie is set by the server on THIS
 * device's status poll — approval on the other device never carries it here.
 */
export function QrLoginPanel() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [qr, setQr] = useState<string | null>(null);
  const [matchCode, setMatchCode] = useState("");
  const challengeRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const poll = useCallback(async () => {
    const id = challengeRef.current;
    if (!id) return;
    try {
      const res = await fetch(`/api/auth/qr/status?challengeId=${encodeURIComponent(id)}`, {
        credentials: "same-origin",
      });
      const data = (await res.json()) as { status: string; next?: string };
      if (data.status === "approved") {
        clearPoll();
        setPhase("approved");
        router.push(data.next ?? "/dashboard");
      } else if (data.status === "expired") {
        clearPoll();
        setPhase("expired");
      }
      // pending → keep polling
    } catch {
      /* transient network blip — keep polling */
    }
  }, [clearPoll, router]);

  const start = useCallback(async () => {
    clearPoll();
    challengeRef.current = null;
    setPhase("loading");
    setQr(null);
    try {
      const res = await fetch("/api/auth/qr/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
      });
      if (!res.ok) {
        setPhase("error");
        return;
      }
      const d = (await res.json()) as {
        challengeId: string;
        nonce: string;
        matchCode: string;
        domain: string;
        uri: string;
        chainId: number;
      };
      const envelope: QrLoginEnvelope = {
        v: 1,
        t: "cr-wallet-login",
        challengeId: d.challengeId,
        nonce: d.nonce,
        matchCode: d.matchCode,
        domain: d.domain,
        uri: d.uri,
        chainId: d.chainId,
      };
      const dataUrl = await encodeQrLoginToDataUrl(envelope);
      challengeRef.current = d.challengeId;
      setMatchCode(d.matchCode);
      setQr(dataUrl);
      setPhase("waiting");
      pollRef.current = setInterval(() => void poll(), POLL_MS);
      void poll(); // kick an immediate check (no 2s dead-time)
    } catch {
      setPhase("error");
    }
  }, [clearPoll, poll]);

  useEffect(() => {
    void start();
    return clearPoll;
  }, [start, clearPoll]);

  return (
    <div data-testid="qr-login-panel" style={{ marginTop: 4 }}>
      {phase === "loading" && (
        <p style={{ color: "var(--muted)", fontSize: 13 }}>Preparing a secure sign-in code…</p>
      )}

      {phase === "waiting" && qr && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- data: URL QR, not a remote asset */}
          <img
            data-testid="qr-login-image"
            src={qr}
            alt="Wallet-QR sign-in code"
            width={220}
            height={220}
            style={{ width: 220, height: 220, imageRendering: "pixelated" }}
          />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, letterSpacing: "0.1em", color: "var(--muted)" }}>
              CONFIRMATION CODE
            </div>
            <div
              data-testid="qr-login-matchcode"
              style={{
                fontFamily: "var(--mono, monospace)",
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: "0.18em",
                color: "var(--navy, #0a1929)",
              }}
            >
              {matchCode}
            </div>
          </div>
          <p style={{ color: "var(--muted)", fontSize: 12, maxWidth: 340, textAlign: "center" }}>
            On a device where your wallet is unlocked, open <b>Wallet → Approve a sign-in</b> and
            scan this code. Approve only if the code there matches <b>{matchCode}</b>.
          </p>
        </div>
      )}

      {phase === "approved" && (
        <p style={{ color: "var(--success)", fontSize: 13 }}>Approved ✓ — signing you in…</p>
      )}

      {(phase === "expired" || phase === "error") && (
        <div style={{ textAlign: "center" }}>
          <p data-testid="qr-login-expired" style={{ color: "var(--muted)", fontSize: 13 }}>
            {phase === "expired" ? "This sign-in code expired." : "Couldn’t start a QR sign-in."}
          </p>
          <button
            className="btn btn-primary"
            type="button"
            data-testid="qr-login-refresh"
            onClick={() => void start()}
            style={{ marginTop: 8 }}
          >
            Show a new code
          </button>
        </div>
      )}
    </div>
  );
}
