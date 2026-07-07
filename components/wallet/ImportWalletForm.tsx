"use client";
import { useEffect, useState } from "react";
import { importWallet, type WalletAccounts } from "@/lib/wallet/embedded/session";
import { hasVault } from "@/lib/wallet/embedded/storage";

const MIN_PASSPHRASE = 12;

/**
 * Import an existing BIP-39 wallet (Wave 11 A2). The phrase is validated by
 * importWallet BEFORE any derivation; a pre-existing vault surfaces an
 * explicit OVERWRITE confirmation (checkbox gates the submit — never a silent
 * clobber). The phrase is never rendered back and the textarea is cleared on
 * success.
 */
export function ImportWalletForm({
  onImported,
}: {
  onImported: (accounts: WalletAccounts) => void;
}) {
  const [phrase, setPhrase] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [vaultExists, setVaultExists] = useState(false);
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    hasVault()
      .then((v) => mounted && setVaultExists(v))
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (passphrase.length < MIN_PASSPHRASE) {
      setError(`Passphrase must be at least ${MIN_PASSPHRASE} characters.`);
      return;
    }
    setBusy(true);
    try {
      const { accounts } = await importWallet(passphrase, phrase, "Primary", overwriteConfirmed);
      setPhrase("");
      setPassphrase("");
      onImported(accounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ marginTop: 24 }}>
      <label htmlFor="import-phrase" style={{ display: "block", marginBottom: 8 }}>
        Recovery phrase (12 or 24 words)
      </label>
      <textarea
        id="import-phrase"
        value={phrase}
        onChange={(e) => setPhrase(e.target.value)}
        rows={3}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        style={{
          width: "100%",
          maxWidth: 560,
          padding: 10,
          border: "1px solid var(--line)",
          borderRadius: 8,
          fontFamily: "var(--font-plex-mono), monospace",
          fontSize: 13,
        }}
      />
      <label htmlFor="import-pass" style={{ display: "block", marginTop: 16, marginBottom: 8 }}>
        New vault passphrase (min {MIN_PASSPHRASE} characters)
      </label>
      <input
        id="import-pass"
        type="password"
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        autoComplete="off"
        style={{
          width: "100%",
          maxWidth: 420,
          padding: 10,
          border: "1px solid var(--line)",
          borderRadius: 8,
        }}
      />
      {vaultExists && (
        <label
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
            marginTop: 16,
            color: "#8b3a3a",
            maxWidth: 560,
          }}
        >
          <input
            type="checkbox"
            checked={overwriteConfirmed}
            onChange={(e) => setOverwriteConfirmed(e.target.checked)}
            data-testid="overwrite-confirm"
          />
          I understand this REPLACES my existing wallet on this device. Without its own backup
          words, the replaced wallet cannot be restored.
        </label>
      )}
      {error && (
        <p role="alert" style={{ color: "#8b3a3a", marginTop: 12 }}>
          {error}
        </p>
      )}
      <div style={{ marginTop: 20 }}>
        <button
          className="btn btn-primary"
          type="submit"
          data-testid="import-submit"
          disabled={busy || (vaultExists && !overwriteConfirmed)}
        >
          {busy ? "Importing…" : "Import wallet"}
        </button>
      </div>
    </form>
  );
}
