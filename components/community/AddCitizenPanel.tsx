"use client";
import { useState } from "react";
import { CIVIC_ID_INPUT_RE, normalizeCivicIdInput } from "./bits";
import styles from "./community.module.css";

/**
 * ADD CITIZEN register (Wave 17): file a friend/family request addressed by
 * the target's Civic ID — the big mono input auto-uppercases as you type.
 * Client-side validation mirrors the server (CR-XXXX-XXXX); the server
 * re-validates regardless and never reveals who holds an ID beyond
 * "filed" / "no citizen holds that Civic ID".
 */

const KINDS = [
  ["FRIEND", "Friend"],
  ["FAMILY", "Family"],
] as const;

export function AddCitizenPanel({ onFiled }: { onFiled: () => void }) {
  const [civicId, setCivicId] = useState("");
  const [kind, setKind] = useState<string>("FRIEND");
  const [greeting, setGreeting] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const idError = !CIVIC_ID_INPUT_RE.test(civicId)
    ? "Enter a Civic ID in the form CR-XXXX-XXXX."
    : null;
  const greetingError = greeting.length > 280 ? "The greeting cannot exceed 280 characters." : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    setStatus(null);
    if (idError || greetingError) return;
    setBusy(true);
    try {
      const res = await fetch("/api/community/connections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          civicId,
          kind,
          ...(greeting.trim() ? { greeting: greeting.trim() } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };
      if (!res.ok) throw new Error(data.error ?? "The request was refused.");
      setStatus({
        ok: true,
        text: `Request filed to ${civicId}. It now awaits that citizen's answer.`,
      });
      setCivicId("");
      setGreeting("");
      setTouched(false);
      onFiled();
    } catch (err) {
      setStatus({
        ok: false,
        text: err instanceof Error ? err.message : "The request was refused.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Add a citizen</h2>
        <p className={styles.hint} style={{ fontSize: 13.5, lineHeight: 1.6 }}>
          Ask a citizen for their Civic ID — it is on their passport. The Republic never lists
          citizens for browsing.
        </p>
      </div>

      <form onSubmit={submit} className={styles.form} noValidate data-testid="add-citizen-form">
        <div className={styles.field}>
          <label htmlFor="add-civic-id" className={styles.microLabel}>
            Civic ID
          </label>
          <input
            id="add-civic-id"
            className={`${styles.input} ${styles.civicInput}`}
            value={civicId}
            onChange={(e) => setCivicId(normalizeCivicIdInput(e.target.value))}
            onBlur={() => setTouched(true)}
            placeholder="CR-XXXX-XXXX"
            maxLength={12}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(touched && idError)}
            aria-describedby="add-civic-id-error"
            data-testid="civic-id-input"
          />
          <div id="add-civic-id-error" aria-live="polite">
            {touched && idError && <p className={styles.fieldError}>{idError}</p>}
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="add-kind" className={styles.microLabel}>
            Connection
          </label>
          <select
            id="add-kind"
            className={styles.select}
            style={{ maxWidth: 200 }}
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            data-testid="kind-select"
          >
            {KINDS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="add-greeting" className={styles.microLabel}>
            Greeting (optional, up to 280 characters)
          </label>
          <textarea
            id="add-greeting"
            className={styles.textarea}
            value={greeting}
            maxLength={280}
            onChange={(e) => setGreeting(e.target.value)}
            aria-invalid={Boolean(greetingError)}
            aria-describedby="add-greeting-error"
            data-testid="greeting-input"
          />
          <div id="add-greeting-error" aria-live="polite">
            {greetingError && <p className={styles.fieldError}>{greetingError}</p>}
          </div>
        </div>

        <div aria-live="polite" className={styles.statusLine} data-testid="add-citizen-status">
          {status &&
            (status.ok ? (
              <span className={styles.successText}>{status.text}</span>
            ) : (
              <div className={styles.errorBox}>{status.text}</div>
            ))}
        </div>

        <div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy}
            data-testid="add-citizen-submit"
          >
            {busy ? "Filing…" : "File the request"}
          </button>
        </div>
      </form>
    </div>
  );
}
