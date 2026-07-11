"use client";
import { useCallback, useEffect, useState } from "react";
import {
  OFFICE_LABELS,
  PENAL_GRADES,
  REPORT_CATEGORIES,
  REPORT_CATEGORY_LABELS,
  type CivicOffice,
  type PenalGrade,
  type ReportCategory,
} from "@/lib/gov/types";
import { formatDate } from "@/lib/store/format";
import { DecideReportForm, type DecidePayload } from "./DecideReportForm";
import styles from "./reports.module.css";

/**
 * The Tribunal docket (Wave 17) — the officer island for
 * /dashboard/tribunal. Fetches the verification queue; a 403 renders the
 * reserved notice (the docket is the bureaucracy's first delegated power —
 * sitting Protectors and the Chief of Protectors only). Each SUBMITTED report
 * card shows the complaint body, the subject (Civic ID + public display), and
 * the category with its Penal Code grade hint; the reporter is withheld.
 * Decisions run through the shared band-validated two-step form and POST to
 * /api/reports/[id]/decide.
 */

interface QueueItem {
  id: string;
  category: string;
  body: string;
  createdAt: string;
  subjectCivicId: string;
  subjectDisplay: string;
  reporterDisplay: string;
}

type Docket =
  | { status: "loading" }
  | { status: "error" }
  | { status: "forbidden" }
  | { status: "ok"; office: CivicOffice; queue: QueueItem[] };

function categoryLabel(category: string): string {
  return REPORT_CATEGORY_LABELS[category as ReportCategory] ?? category;
}

/** The category's grade hint (categories mirror the Penal Code grades 1:1). */
function suggestedGradeOf(category: string): PenalGrade | undefined {
  const i = (REPORT_CATEGORIES as readonly string[]).indexOf(category);
  return i === -1 ? undefined : PENAL_GRADES[i];
}

export function TribunalApp() {
  const [docket, setDocket] = useState<Docket>({ status: "loading" });
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [decideError, setDecideError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState("");

  const load = useCallback(() => {
    setDocket({ status: "loading" });
    fetch("/api/reports/queue", { credentials: "same-origin" })
      .then(async (r) => {
        if (r.status === 403) {
          setDocket({ status: "forbidden" });
          return;
        }
        if (!r.ok) throw new Error("failed");
        const d = (await r.json()) as { office: CivicOffice; queue: QueueItem[] };
        setDocket({ status: "ok", office: d.office, queue: d.queue });
      })
      .catch(() => setDocket({ status: "error" }));
  }, []);

  useEffect(() => load(), [load]);

  async function decide(id: string, payload: DecidePayload): Promise<void> {
    setBusy(true);
    setDecideError(null);
    setStatusMsg("");
    try {
      const res = await fetch(`/api/reports/${id}/decide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setDecideError(d.error ?? "The decision was refused.");
        return;
      }
      setStatusMsg(
        payload.action === "verify"
          ? "Verification entered on the record."
          : "Dismissal entered on the record.",
      );
      setOpenId(null);
      load();
    } catch {
      setDecideError("The decision was refused.");
    } finally {
      setBusy(false);
    }
  }

  function openForm(id: string) {
    setDecideError(null);
    setStatusMsg("");
    setOpenId((cur) => (cur === id ? null : id));
  }

  return (
    <>
      <p aria-live="polite" role="status" className={styles.status} data-testid="tribunal-status">
        {statusMsg}
      </p>

      {docket.status === "loading" && (
        <section className={styles.card} aria-busy="true" data-testid="tribunal-loading">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className={styles.skeleton} />
            ))}
          </div>
        </section>
      )}

      {docket.status === "error" && (
        <section className={styles.card} data-testid="tribunal-error">
          <p className={styles.error}>Could not load the docket.</p>
          <button type="button" className={styles.retry} onClick={load}>
            Retry
          </button>
        </section>
      )}

      {docket.status === "forbidden" && (
        <section className={styles.card} data-testid="tribunal-forbidden">
          <span className={styles.microLabel}>Restricted docket</span>
          <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.6 }}>
            Reserved for sitting Protectors and the Chief of Protectors.
          </p>
          <p className={styles.cardNote}>
            Verification of conduct reports is the bureaucracy&rsquo;s first delegated power. If you
            hold a verifier office, your appointment letter names this docket.
          </p>
        </section>
      )}

      {docket.status === "ok" && (
        <section className={styles.card} data-testid="tribunal-docket">
          <div className={styles.queueHead}>
            <h2 className={styles.cardTitle}>Verification docket</h2>
            <span className={`${styles.pill} ${styles.pillGold}`} data-testid="tribunal-office">
              Deciding as {OFFICE_LABELS[docket.office]}
            </span>
          </div>
          <p className={styles.cardNote}>
            Submitted conduct reports in filing order. The reporter is withheld — weigh the
            complaint on its content. Verification requires a Penal Code grade, a penalty inside the
            grade&rsquo;s band, and a note; every decision is audit-logged. Reports you filed, or
            that name you, never appear here.
          </p>

          {docket.queue.length === 0 && (
            <div className="empty-state" style={{ marginTop: 16 }} data-testid="tribunal-empty">
              The docket is clear — no reports await verification.
            </div>
          )}

          <div className={styles.queue}>
            {docket.queue.map((r) => (
              <article
                key={r.id}
                className={styles.queueCard}
                aria-label={`Conduct report against ${r.subjectDisplay}`}
                data-testid={`docket-${r.id}`}
              >
                <div className={styles.queueHead}>
                  <h3 className={styles.queueTitle}>{categoryLabel(r.category)}</h3>
                  <span className={`${styles.pill} ${styles.pillGold}`}>SUBMITTED</span>
                </div>
                <div className={styles.queueMeta}>
                  <span className={styles.mono}>
                    Subject: {r.subjectDisplay} — {r.subjectCivicId}
                  </span>
                  <span>Filed by {r.reporterDisplay}</span>
                  <span>Filed {formatDate(r.createdAt)}</span>
                </div>
                <p className={styles.complaint}>{r.body}</p>
                {openId === r.id ? (
                  <DecideReportForm
                    idPrefix={`docket-${r.id}`}
                    suggestedGrade={suggestedGradeOf(r.category)}
                    busy={busy}
                    error={decideError}
                    onSubmit={(payload) => void decide(r.id, payload)}
                    onCancel={() => setOpenId(null)}
                  />
                ) : (
                  <div className={styles.queueActions}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => openForm(r.id)}
                      data-testid={`open-decide-${r.id}`}
                    >
                      Open decision form
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
