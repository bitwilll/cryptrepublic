"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/store/format";
import styles from "./referrals.module.css";

/**
 * Referral links card (Wave 17). Renders GET /api/referral-links: LOCKED when
 * the caller's standing sits at or below the 65 gate (with the exact score and
 * a pointer to the trust ledger), otherwise the create form (optional label)
 * and the link registry — each row shows the shareable /auth?ref= URL, its
 * uses, the issue date, a COPY LINK action, and a two-step revoke. Revocation
 * only stops FUTURE signups; existing referral edges remain.
 */

interface LinkRow {
  id: string;
  code: string;
  label: string | null;
  createdAt: string;
  revokedAt: string | null;
  uses: number;
}
interface LinksPayload {
  gate: { unlocked: boolean; finalScore: number; threshold: number };
  maxActive: number;
  links: LinkRow[];
}
type Load = { status: "loading" } | { status: "ok"; data: LinksPayload } | { status: "error" };

function linkUrl(origin: string, code: string): string {
  return `${origin}/auth?ref=${code}`;
}

export function ReferralLinksCard(): React.ReactElement {
  const [state, setState] = useState<Load>({ status: "loading" });
  const [label, setLabel] = useState("");
  const [labelTouched, setLabelTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const load = useCallback(() => {
    setState({ status: "loading" });
    fetch("/api/referral-links", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: LinksPayload) => setState({ status: "ok", data: d }))
      .catch(() => setState({ status: "error" }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const labelError = label.trim().length > 60 ? "Label cannot exceed 60 characters." : null;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setLabelTouched(true);
    if (labelError || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const trimmed = label.trim();
      const res = await fetch("/api/referral-links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(trimmed ? { label: trimmed } : {}),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not issue the link.");
      setLabel("");
      setLabelTouched(false);
      setNotice({ tone: "ok", text: "Link issued." });
      load();
    } catch (err) {
      setNotice({
        tone: "err",
        text: err instanceof Error ? err.message : "Could not issue the link.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(linkId: string) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/referral-links/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ linkId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not revoke the link.");
      setNotice({ tone: "ok", text: "Link revoked — future signups no longer bind to it." });
      load();
    } catch (err) {
      setNotice({
        tone: "err",
        text: err instanceof Error ? err.message : "Could not revoke the link.",
      });
    } finally {
      setConfirmingId(null);
      setBusy(false);
    }
  }

  async function copy(link: LinkRow) {
    const url = linkUrl(window.location.origin, link.code);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(link.id);
      window.setTimeout(() => setCopiedId((cur) => (cur === link.id ? null : cur)), 2000);
    } catch {
      setNotice({ tone: "err", text: `Copy failed — the link is ${url}` });
    }
  }

  if (state.status === "loading") {
    return (
      <section className={styles.card} data-testid="reflinks-loading" aria-busy="true">
        <h2 className={styles.microLabel}>Referral links</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
        </div>
      </section>
    );
  }
  if (state.status === "error") {
    return (
      <section className={styles.card} data-testid="reflinks-error">
        <h2 className={styles.microLabel}>Referral links</h2>
        <p className={styles.error} role="alert">
          Could not load your referral links.
        </p>
        <button type="button" className={styles.retry} onClick={load}>
          Retry
        </button>
      </section>
    );
  }

  const d = state.data;

  if (!d.gate.unlocked) {
    return (
      <section className={styles.card} data-testid="reflinks-card">
        <h2 className={styles.microLabel}>Referral links</h2>
        <p className={styles.lede}>
          Shareable signup links that bind every registration made through them to you as a referral
          — reserved for citizens of high standing.
        </p>
        <div className={styles.lockedBox} data-testid="reflinks-locked">
          <p className={styles.lockedLine}>
            Unlocks above {d.gate.threshold} — your standing: {d.gate.finalScore}
          </p>
          <p className={styles.lockedHint}>
            Raise your standing to mint shareable links. See{" "}
            <Link href="/dashboard/trust">your trust ledger</Link> for exactly what counts.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.card} data-testid="reflinks-card">
      <h2 className={styles.microLabel}>Referral links</h2>
      <p className={styles.lede}>
        Anyone who registers through one of these links is recorded as referred by you. Up to{" "}
        {d.maxActive} active links; revoking stops future signups without touching past referrals.
      </p>

      <form onSubmit={create} className={styles.form} noValidate data-testid="reflinks-create-form">
        <div className={styles.formRow}>
          <div className={styles.field}>
            <label htmlFor="reflink-label" className={styles.label}>
              Label (optional)
            </label>
            <input
              id="reflink-label"
              className={styles.input}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={() => setLabelTouched(true)}
              maxLength={80}
              placeholder="e.g. Printed on my card"
              aria-invalid={Boolean(labelTouched && labelError)}
              aria-describedby="reflink-label-error"
              data-testid="reflink-label-input"
            />
          </div>
          <button
            type="submit"
            className={`btn btn-primary ${styles.submitBtn}`}
            disabled={busy}
            data-testid="reflink-create"
          >
            {busy ? "Issuing…" : "Issue a link"}
          </button>
        </div>
        <div id="reflink-label-error" aria-live="polite">
          {labelTouched && labelError && <p className={styles.fieldError}>{labelError}</p>}
        </div>
      </form>

      <p className={styles.status} aria-live="polite" data-testid="reflinks-status">
        {notice && (
          <span className={notice.tone === "ok" ? styles.statusOk : styles.statusErr}>
            {notice.text}
          </span>
        )}
      </p>

      {d.links.length === 0 ? (
        <p className="empty-state" style={{ marginTop: 16 }} data-testid="reflinks-empty">
          No referral links issued yet — mint one above and hand out the URL.
        </p>
      ) : (
        <ul className={styles.linkList} data-testid="reflinks-list">
          {d.links.map((l) => {
            const revoked = Boolean(l.revokedAt);
            return (
              <li key={l.id} className={styles.linkRow} data-testid="reflink-row">
                <div className={styles.linkHead}>
                  <span className={styles.linkLabel}>{l.label ?? "Unlabelled link"}</span>
                  <span
                    className={`${styles.pill} ${revoked ? styles.pillRevoked : styles.pillActive}`}
                    data-testid="reflink-pill"
                  >
                    {revoked ? "Revoked" : "Active"}
                  </span>
                </div>
                <p className={styles.linkUrl} data-testid="reflink-url">
                  {linkUrl(origin, l.code)}
                </p>
                <p className={styles.linkMeta}>
                  {l.uses} {l.uses === 1 ? "use" : "uses"} · issued {formatDate(l.createdAt)}
                  {l.revokedAt ? ` · revoked ${formatDate(l.revokedAt)}` : ""}
                </p>
                {!revoked && (
                  <div className={styles.linkActions}>
                    <button
                      type="button"
                      className={`btn btn-ghost ${styles.actionBtn}`}
                      aria-live="polite"
                      onClick={() => copy(l)}
                      data-testid="reflink-copy"
                    >
                      {copiedId === l.id ? "Copied ✓" : "Copy link"}
                    </button>
                    {confirmingId === l.id ? (
                      <>
                        <button
                          type="button"
                          className={`btn btn-primary ${styles.actionBtn}`}
                          onClick={() => revoke(l.id)}
                          disabled={busy}
                          data-testid="reflink-revoke-confirm"
                        >
                          Confirm revoke
                        </button>
                        <button
                          type="button"
                          className={`btn btn-ghost ${styles.actionBtn}`}
                          onClick={() => setConfirmingId(null)}
                          disabled={busy}
                          data-testid="reflink-revoke-cancel"
                        >
                          Keep it
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className={`btn btn-ghost ${styles.actionBtn}`}
                        onClick={() => setConfirmingId(l.id)}
                        disabled={busy}
                        data-testid="reflink-revoke"
                      >
                        Revoke…
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
