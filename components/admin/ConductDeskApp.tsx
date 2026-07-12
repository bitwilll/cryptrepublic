"use client";
import { useCallback, useEffect, useState } from "react";
import { Skeleton, CardError } from "./bits";
import { Ledger } from "@/components/ui/Ledger";
import { formatDate } from "@/lib/store/format";
import {
  PENAL_GRADES,
  REPORT_CATEGORIES,
  REPORT_CATEGORY_LABELS,
  type PenalGrade,
  type ReportCategory,
} from "@/lib/gov/types";
import { DecideReportForm, type DecidePayload } from "@/components/reports/DecideReportForm";
import styles from "./ConductDeskApp.module.css";

/**
 * Conduct desk (Wave 17): three panels —
 *  1. Submitted queue: conduct reports awaiting a decision (admins see
 *     everything, including the reporter's email — unlike the officer
 *     tribunal, where the reporter is withheld). Decisions run through the
 *     shared band-validated two-step form and POST to
 *     /api/reports/[id]/decide (the officer route's admin path — no separate
 *     admin endpoint).
 *  2. Verified ledger: the newest 50 verified charges with grade pill,
 *     penalty, decider + office, note — and the OFFICES FORFEITED tag where
 *     the Grade-V forfeiture revoked seats.
 *  3. Dismissed ledger: the newest 50 dismissals.
 * Every decision is audit-logged by the API in the same transaction.
 */

interface Person {
  id: string;
  email: string | null;
  name: string | null;
}
interface Subject extends Person {
  civicId: string | null;
}
interface BaseReport extends Record<string, unknown> {
  id: string;
  category: string;
  status: string;
  body: string;
  grade: string | null;
  penalty: number | null;
  note: string | null;
  deciderOffice: string | null;
  createdAt: string;
  decidedAt: string | null;
  reporter: Person;
  subject: Subject;
  subjectDisplay: string;
}
interface VerifiedReport extends BaseReport {
  deciderLabel: string | null;
  forfeitedSeats: number;
  officesForfeited: boolean;
}
interface DismissedReport extends BaseReport {
  deciderLabel: string | null;
}
interface Desk {
  submitted: BaseReport[];
  verified: VerifiedReport[];
  dismissed: DismissedReport[];
}

type Load<T> = { status: "loading" } | { status: "ok"; data: T } | { status: "error" };

function categoryLabel(category: string): string {
  return REPORT_CATEGORY_LABELS[category as ReportCategory] ?? category;
}

function suggestedGradeOf(category: string): PenalGrade | undefined {
  const i = (REPORT_CATEGORIES as readonly string[]).indexOf(category);
  return i === -1 ? undefined : PENAL_GRADES[i];
}

function subjectLine(r: BaseReport): string {
  return `${r.subjectDisplay}${r.subject.civicId ? ` — ${r.subject.civicId}` : ""}`;
}

function GradePill({
  grade,
  officesForfeited,
}: {
  grade: string | null;
  officesForfeited: boolean;
}) {
  if (!grade) return <span className={`${styles.pill} ${styles.pillMuted}`}>—</span>;
  const cls =
    grade === "V"
      ? `${styles.pill} ${styles.gradeV}`
      : grade === "III" || grade === "IV"
        ? `${styles.pill} ${styles.gradeHigh}`
        : `${styles.pill} ${styles.gradeLow}`;
  return (
    <span className={styles.gradeCell}>
      <span className={cls}>Grade {grade}</span>
      {officesForfeited && (
        <span className={`${styles.pill} ${styles.gradeV}`} data-testid="forfeited-tag">
          OFFICES FORFEITED
        </span>
      )}
    </span>
  );
}

export function ConductDeskApp() {
  const [desk, setDesk] = useState<Load<Desk>>({ status: "loading" });
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [decideError, setDecideError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState("");

  const load = useCallback(() => {
    setDesk({ status: "loading" });
    fetch("/api/admin/reports")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: Desk) => setDesk({ status: "ok", data: d }))
      .catch(() => setDesk({ status: "error" }));
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
    <div className={`wrap ${styles.app}`} data-testid="conduct-desk">
      <div className="kicker">CONDUCT DESK</div>

      <div className={styles.notice}>
        <span className={styles.noticeLabel}>Due process</span>
        Officers&rsquo; tribunal decisions and desk decisions share one endpoint and one audit
        trail. The officer docket withholds the reporter; this desk sees everything. Sitting
        Protectors decide at <span className={styles.mono}>/dashboard/tribunal</span>.
      </div>

      <p aria-live="polite" role="status" className={styles.status} data-testid="desk-status">
        {statusMsg}
      </p>

      {desk.status === "loading" && <Skeleton lines={4} />}
      {desk.status === "error" && <CardError onRetry={load} testid="desk-load-error" />}

      {desk.status === "ok" && (
        <>
          {/* ── Panel 1: submitted queue ─────────────────────────────── */}
          <article className={styles.panel} data-testid="panel-submitted">
            <h2 className={styles.panelTitle}>Submitted queue</h2>
            <p className={styles.panelNote}>
              Conduct reports awaiting a decision, in filing order. Verification requires a Penal
              Code grade, a penalty inside the grade&rsquo;s band, and a note; Grade V forfeits
              every office the subject holds.
            </p>
            {desk.data.submitted.length === 0 && (
              <div className="empty-state" style={{ marginTop: 16 }} data-testid="submitted-empty">
                The queue is clear — no reports await a decision.
              </div>
            )}
            <div className={styles.queue}>
              {desk.data.submitted.map((r) => (
                <section
                  key={r.id}
                  className={styles.queueCard}
                  data-testid={`submitted-${r.id}`}
                  aria-label={`Conduct report against ${r.subjectDisplay}`}
                >
                  <div className={styles.queueHead}>
                    <h3 className={styles.queueTitle}>{categoryLabel(r.category)}</h3>
                    <span className={`${styles.pill} ${styles.pillGold}`}>{r.status}</span>
                  </div>
                  <div className={styles.queueMeta}>
                    <span className={styles.mono}>Subject: {subjectLine(r)}</span>
                    <span className={styles.mono}>
                      Reporter: {r.reporter.email ?? r.reporter.id}
                    </span>
                    <span>Filed {formatDate(r.createdAt)}</span>
                  </div>
                  <p className={styles.complaint}>{r.body}</p>
                  {openId === r.id ? (
                    <DecideReportForm
                      idPrefix={`desk-${r.id}`}
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
                </section>
              ))}
            </div>
          </article>

          {/* ── Panel 2: verified ledger ─────────────────────────────── */}
          <article className={styles.panel} data-testid="panel-verified">
            <h2 className={styles.panelTitle}>Verified ledger</h2>
            <p className={styles.panelNote}>
              The fifty most recent verified charges. Each penalty already counts against the
              subject&rsquo;s trust score.
            </p>
            <Ledger<VerifiedReport>
              columns={[
                {
                  key: "subject",
                  label: "Subject",
                  render: (r) => <span className={styles.mono}>{subjectLine(r)}</span>,
                },
                {
                  key: "grade",
                  label: "Grade",
                  render: (r) => (
                    <GradePill grade={r.grade} officesForfeited={r.officesForfeited} />
                  ),
                },
                {
                  key: "penalty",
                  label: "Penalty",
                  align: "right",
                  render: (r) => (
                    <span className={styles.mono} data-testid={`penalty-${r.id}`}>
                      {r.penalty}
                    </span>
                  ),
                },
                {
                  key: "decider",
                  label: "Decider",
                  render: (r) => (
                    <span className={styles.mono}>
                      {r.deciderLabel ?? "—"}
                      {r.deciderOffice && <span className={styles.rowNote}>{r.deciderOffice}</span>}
                    </span>
                  ),
                },
                {
                  key: "note",
                  label: "Note",
                  render: (r) => <span className={styles.rowNote}>{r.note}</span>,
                },
                {
                  key: "decidedAt",
                  label: "Decided",
                  render: (r) => (r.decidedAt ? formatDate(r.decidedAt) : "—"),
                },
              ]}
              rows={desk.data.verified}
              getRowKey={(r) => r.id}
              empty="No verified charges on the record."
              scrollLabel="Verified conduct reports (scrolls horizontally on narrow screens)"
            />
          </article>

          {/* ── Panel 3: dismissed ledger ────────────────────────────── */}
          <article className={styles.panel} data-testid="panel-dismissed">
            <h2 className={styles.panelTitle}>Dismissed ledger</h2>
            <p className={styles.panelNote}>The fifty most recent dismissals.</p>
            <Ledger<DismissedReport>
              columns={[
                {
                  key: "subject",
                  label: "Subject",
                  render: (r) => <span className={styles.mono}>{subjectLine(r)}</span>,
                },
                { key: "category", label: "Category", render: (r) => categoryLabel(r.category) },
                {
                  key: "decider",
                  label: "Decider",
                  render: (r) => (
                    <span className={styles.mono}>
                      {r.deciderLabel ?? "—"}
                      {r.deciderOffice && <span className={styles.rowNote}>{r.deciderOffice}</span>}
                    </span>
                  ),
                },
                {
                  key: "note",
                  label: "Note",
                  render: (r) => <span className={styles.rowNote}>{r.note ?? "—"}</span>,
                },
                {
                  key: "decidedAt",
                  label: "Decided",
                  render: (r) => (r.decidedAt ? formatDate(r.decidedAt) : "—"),
                },
              ]}
              rows={desk.data.dismissed}
              getRowKey={(r) => r.id}
              empty="No dismissals on the record."
              scrollLabel="Dismissed conduct reports (scrolls horizontally on narrow screens)"
            />
          </article>

          <p className={styles.footer} data-testid="desk-footer">
            Verified penalties enter the subject&rsquo;s trust score under the Penal Code. Every
            decision is audit-logged.
          </p>
        </>
      )}
    </div>
  );
}
