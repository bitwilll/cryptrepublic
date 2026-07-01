"use client";
import { useEffect, useState } from "react";
import { getAddress } from "viem";
import { receiveQrDataUrl } from "@/lib/wallet/receive";

/**
 * RECEIVE modal — shows the checksummed EVM address, a COPY button, and a QR
 * image (a `data:` URL, covered by CSP `img-src 'self' data:`). NO send
 * affordance (receive-only).
 */
export function ReceiveModal({ address, onClose }: { address: string; onClose: () => void }) {
  const checksummed = safeChecksum(address);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let mounted = true;
    receiveQrDataUrl(checksummed)
      .then((d) => mounted && setQr(d))
      .catch(() => mounted && setQr(null));
    return () => {
      mounted = false;
    };
  }, [checksummed]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(checksummed);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Receive"
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
          width: "min(420px, 94vw)",
          textAlign: "center",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Receive</h2>
        {qr && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            data-testid="receive-qr"
            src={qr}
            alt="Receive address QR code"
            width={220}
            height={220}
            style={{ margin: "8px auto" }}
          />
        )}
        <p
          data-testid="receive-address"
          style={{
            fontFamily: "var(--mono)",
            fontSize: 12,
            wordBreak: "break-all",
            marginTop: 12,
          }}
        >
          {checksummed}
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 16, justifyContent: "center" }}>
          <button className="btn btn-primary" type="button" onClick={copy}>
            {copied ? "Copied ✓" : "Copy address"}
          </button>
          <button className="btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/** getAddress but never throws in render. */
function safeChecksum(addr: string): string {
  try {
    return getAddress(addr);
  } catch {
    return addr;
  }
}
