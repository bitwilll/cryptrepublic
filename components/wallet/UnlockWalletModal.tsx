"use client";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
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
    <Modal title="Unlock wallet" onClose={onCancel}>
      <form onSubmit={submit}>
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
          <p role="alert" style={{ color: "#8b3a3a", marginTop: 12 }}>
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
    </Modal>
  );
}
