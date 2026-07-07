"use client";
import { useCallback, useEffect, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";

interface Passkey {
  id: string;
  label: string | null;
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

/**
 * Manage passkeys for the logged-in account (Wave 14): list / enroll / delete
 * + the require-passkey toggle. Client island (may call navigator.credentials
 * via @simplewebauthn/browser). Everything shown is PUBLIC metadata; the
 * credential's private half never leaves the authenticator.
 */
export function PasskeysSurface(): React.ReactElement {
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [required, setRequired] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/webauthn/credentials", { credentials: "same-origin" });
      if (!res.ok) throw new Error("Could not load your passkeys.");
      const data = (await res.json()) as { credentials: Passkey[]; passkey2faEnabled: boolean };
      setPasskeys(data.credentials);
      setRequired(data.passkey2faEnabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your passkeys.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function enroll() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const optRes = await fetch("/api/auth/webauthn/register/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: "{}",
      });
      if (!optRes.ok) throw new Error("Could not start passkey enrollment.");
      const { options } = (await optRes.json()) as {
        options: Parameters<typeof startRegistration>[0]["optionsJSON"];
      };
      const attestation = await startRegistration({ optionsJSON: options });
      const verRes = await fetch("/api/auth/webauthn/register/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ response: attestation, label: label.trim() || undefined }),
      });
      const data = (await verRes.json().catch(() => ({}))) as { error?: string };
      if (!verRes.ok) throw new Error(data.error ?? "Passkey enrollment failed.");
      setLabel("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Passkey enrollment was cancelled.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/webauthn/credentials/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ credentialId: id }),
      });
      if (!res.ok) throw new Error("Could not remove that passkey.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove that passkey.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleRequired(next: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/webauthn/2fa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ enabled: next }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        passkey2faEnabled?: boolean;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not change that setting.");
      setRequired(Boolean(data.passkey2faEnabled));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change that setting.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="passkeys-surface">
      {error && (
        <p role="alert" style={{ color: "#8b3a3a", fontSize: 13 }}>
          {error}
        </p>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={{ fontSize: 12 }}>
          <span style={{ display: "block", color: "var(--muted)", marginBottom: 4 }}>
            Name (optional)
          </span>
          <input
            data-testid="passkey-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. MacBook Touch ID"
            maxLength={64}
            style={{ padding: 8, border: "1px solid var(--line)", borderRadius: 8, fontSize: 13 }}
          />
        </label>
        <button
          className="btn btn-primary"
          type="button"
          data-testid="passkey-enroll"
          disabled={busy}
          onClick={enroll}
        >
          {busy ? "Working…" : "Add a passkey"}
        </button>
      </div>

      <ul data-testid="passkey-list" style={{ listStyle: "none", padding: 0, marginTop: 18 }}>
        {loaded && passkeys.length === 0 && (
          <li data-testid="passkey-empty" style={{ color: "var(--muted)", fontSize: 13 }}>
            No passkeys yet. Add one to sign in without a password.
          </li>
        )}
        {passkeys.map((k) => (
          <li
            key={k.id}
            data-testid="passkey-row"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              padding: "10px 0",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <span>
              <b style={{ fontSize: 14 }}>{k.label || "Passkey"}</b>
              <span style={{ display: "block", color: "var(--muted)", fontSize: 11 }}>
                {k.deviceType === "multiDevice" ? "Synced" : "Single-device"}
                {k.backedUp ? " · backed up" : ""} · added{" "}
                {new Date(k.createdAt).toISOString().slice(0, 10)}
              </span>
            </span>
            <button
              className="btn"
              type="button"
              data-testid="passkey-delete"
              disabled={busy}
              onClick={() => remove(k.id)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <label
        style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 20, fontSize: 13 }}
      >
        <input
          type="checkbox"
          data-testid="passkey-2fa-toggle"
          checked={required}
          disabled={busy || passkeys.length === 0}
          onChange={(e) => void toggleRequired(e.target.checked)}
        />
        <span>
          <b>Require a passkey to sign in</b>
          <span style={{ display: "block", color: "var(--muted)", fontSize: 12 }}>
            Your passkey approves every password sign-in. Removing your last passkey turns this off
            automatically — you can never be locked out.
          </span>
        </span>
      </label>
    </div>
  );
}
