"use client";
import { useState } from "react";
import { WalletUnlockError } from "@/lib/wallet/embedded/vault";

/**
 * Unlock prompt. A wrong passphrase shows a single inline "incorrect passphrase"
 * error and stays locked — NO oracle beyond pass/fail (the vault never returns
 * decrypted plaintext on a wrong passphrase).
 */
export function UnlockWalletModal({
  onUnlock,
  onCancel,
}: {
  onUnlock: (passphrase: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onUnlock(passphrase);
    } catch (err) {
      setError(
        err instanceof WalletUnlockError ? "Incorrect passphrase." : "Unlock failed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Unlock wallet"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,31,51,0.6)",
        display: "grid",
        placeItems: "center",
        zIndex: 50,
      }}
    >
      <form
        onSubmit={submit}
        style={{
          background: "#fff",
          border: "1px solid var(--line)",
          borderRadius: 12,
          padding: 24,
          width: "min(420px, 92vw)",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Unlock wallet</h2>
        <label htmlFor="unlock-pass" style={{ display: "block", marginBottom: 8 }}>
          Vault passphrase
        </label>
        <input
          id="unlock-pass"
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          autoComplete="off"
          style={{ width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 8 }}
        />
        {error && (
          <p role="alert" style={{ color: "#b00020", marginTop: 12 }}>
            {error}
          </p>
        )}
        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Unlocking…" : "Unlock"}
          </button>
          <button className="btn" type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
