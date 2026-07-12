"use client";
import { useCallback, useEffect, useState } from "react";
import { Skeleton, CardError, Field, type Load } from "./bits";
import { Modal } from "@/components/ui/Modal";
import { Ledger } from "@/components/ui/Ledger";
import { formatCoin, formatDate } from "@/lib/store/format";
import {
  COMMUNITY_BACKED_THRESHOLD,
  PROJECT_CATEGORY_LABELS,
  type FundraisingStatus,
  type ProjectCategory,
} from "@/lib/gov/types";
import styles from "./FundraisingDeskApp.module.css";

/**
 * Fundraising desk (Wave 16): three panels —
 *  1. Submitted queue: citizen project proposals awaiting a decision, each
 *     with its endorsement tally (7 = community-backed). Approve activates;
 *     a decline REQUIRES a review note (two-step).
 *  2. Active register: live projects with their pledge tallies; Close is a
 *     two-step decision.
 *  3. Decided ledger: declined / closed / withdrawn history with notes.
 * Every decision is audit-logged by the API in the same transaction.
 * REGISTRY ROWS ONLY — pledges are recorded commitments; settlement is
 * wallet-to-wallet; the Republic never holds funds.
 */

interface Creator {
  id: string;
  email: string | null;
  name: string | null;
}
interface BaseProject extends Record<string, unknown> {
  id: string;
  title: string;
  summary: string;
  category: string;
  goalCoin: string;
  status: FundraisingStatus;
  reviewNote: string | null;
  createdAt: string;
  creator: Creator;
  creatorDisplay: string;
}
interface SubmittedProject extends BaseProject {
  endorsementCount: number;
  communityBacked: boolean;
}
interface ActiveProject extends BaseProject {
  pledgeCount: number;
  pledgedTotalCoin: string;
}
interface Desk {
  submitted: SubmittedProject[];
  active: ActiveProject[];
  decided: BaseProject[];
}

type Dialog =
  | { kind: "decline"; project: SubmittedProject }
  | { kind: "close"; project: ActiveProject }
  | null;

const STATUS_CHIP: Record<FundraisingStatus, string> = {
  SUBMITTED: `${styles.chip} ${styles.chipPending}`,
  ACTIVE: `${styles.chip} ${styles.chipActive}`,
  DECLINED: `${styles.chip} ${styles.chipDeclined}`,
  CLOSED: styles.chip,
  WITHDRAWN: styles.chip,
};

function creatorLine(p: BaseProject): string {
  return `${p.creatorDisplay} — ${p.creator.email ?? p.creator.id}`;
}

export function FundraisingDeskApp() {
  const [desk, setDesk] = useState<Load<Desk>>({ status: "loading" });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dialogNote, setDialogNote] = useState("");
  const [mutError, setMutError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState("");

  const load = useCallback(() => {
    setDesk({ status: "loading" });
    fetch("/api/admin/fundraising")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: Desk) => setDesk({ status: "ok", data: d }))
      .catch(() => setDesk({ status: "error" }));
  }, []);

  useEffect(() => load(), [load]);

  async function decide(id: string, body: unknown, done: string): Promise<void> {
    setMutError(null);
    setStatusMsg("");
    try {
      const res = await fetch(`/api/admin/fundraising/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setMutError(d.error ?? "The request failed.");
        return;
      }
      setStatusMsg(done);
      setDialog(null);
      setDialogNote("");
      load();
    } catch {
      setMutError("The request failed.");
    }
  }

  function openDialog(d: Dialog) {
    setMutError(null);
    setDialogNote("");
    setDialog(d);
  }

  return (
    <div className={`wrap ${styles.app}`} data-testid="fundraising-desk">
      <div className="kicker">FUNDRAISING DESK</div>

      <div className={styles.notice}>
        <span className={styles.noticeLabel}>Non-custodial registry</span>
        Pledges are recorded commitments — settlement is wallet-to-wallet; the Republic never holds
        funds.
      </div>

      <p aria-live="polite" role="status" className={styles.status} data-testid="desk-status">
        {statusMsg}
      </p>
      {mutError && !dialog && (
        <p role="alert" className={styles.error} data-testid="desk-error">
          {mutError}
        </p>
      )}

      {desk.status === "loading" && <Skeleton lines={4} />}
      {desk.status === "error" && <CardError onRetry={load} testid="desk-load-error" />}

      {desk.status === "ok" && (
        <>
          {/* ── Panel 1: submitted queue ─────────────────────────────── */}
          <article className={styles.panel} data-testid="panel-submitted">
            <h2 className={styles.panelTitle}>Submitted queue</h2>
            <p className={styles.panelNote}>
              Citizen proposals awaiting a decision, in filing order. Seven citizen endorsements
              mark a proposal community-backed. A decline requires a review note; every decision is
              audit-logged.
            </p>
            {desk.data.submitted.length === 0 && (
              <div className="empty-state" style={{ marginTop: 16 }}>
                The queue is clear — no proposals await a decision.
              </div>
            )}
            <div className={styles.queue}>
              {desk.data.submitted.map((p) => (
                <section
                  key={p.id}
                  className={styles.queueCard}
                  data-testid={`submitted-${p.id}`}
                  aria-label={`Proposal: ${p.title}`}
                >
                  <div className={styles.queueHead}>
                    <h3 className={styles.queueTitle}>{p.title}</h3>
                    <span className={STATUS_CHIP[p.status]}>{p.status}</span>
                  </div>
                  <div className={styles.queueMeta}>
                    <span className={styles.mono}>{creatorLine(p)}</span>
                    <span>
                      {PROJECT_CATEGORY_LABELS[p.category as ProjectCategory] ?? p.category}
                    </span>
                    <span>
                      Goal <b>{formatCoin(p.goalCoin)}</b>
                    </span>
                    <span>Filed {formatDate(p.createdAt)}</span>
                  </div>
                  <p className={styles.summary}>{p.summary}</p>
                  <div className={styles.endorseRow}>
                    <span data-testid={`endorsements-${p.id}`}>
                      {p.endorsementCount} / {COMMUNITY_BACKED_THRESHOLD} community endorsements
                    </span>
                    {p.communityBacked && (
                      <span
                        className={`${styles.chip} ${styles.chipPending}`}
                        data-testid={`community-backed-${p.id}`}
                      >
                        COMMUNITY-BACKED
                      </span>
                    )}
                  </div>
                  <div className={styles.queueActions}>
                    <button
                      className={`btn btn-primary ${styles.primaryAction}`}
                      type="button"
                      data-testid={`approve-${p.id}`}
                      onClick={() =>
                        void decide(p.id, { action: "approve" }, "Project approved and activated.")
                      }
                    >
                      Approve
                    </button>
                    <button
                      className={styles.dangerBtn}
                      type="button"
                      data-testid={`decline-${p.id}`}
                      onClick={() => openDialog({ kind: "decline", project: p })}
                    >
                      Decline
                    </button>
                  </div>
                </section>
              ))}
            </div>
          </article>

          {/* ── Panel 2: active register ─────────────────────────────── */}
          <article className={styles.panel} data-testid="panel-active">
            <h2 className={styles.panelTitle}>Active register</h2>
            <p className={styles.panelNote}>
              Live projects and their pledge tallies. Pledged totals are recorded commitments — the
              Republic never holds or moves the funds.
            </p>
            <Ledger<ActiveProject>
              columns={[
                { key: "title", label: "Title" },
                {
                  key: "creator",
                  label: "Creator",
                  render: (p) => <span className={styles.mono}>{creatorLine(p)}</span>,
                },
                {
                  key: "goalCoin",
                  label: "Goal",
                  align: "right",
                  render: (p) => <span className={styles.mono}>{formatCoin(p.goalCoin)}</span>,
                },
                {
                  key: "pledgedTotalCoin",
                  label: "Pledged",
                  align: "right",
                  render: (p) => (
                    <span className={styles.mono} data-testid={`pledged-${p.id}`}>
                      {formatCoin(p.pledgedTotalCoin)}
                    </span>
                  ),
                },
                {
                  key: "pledgeCount",
                  label: "Pledges",
                  align: "right",
                  render: (p) => <span className={styles.mono}>{p.pledgeCount}</span>,
                },
                {
                  key: "actions",
                  label: "Action",
                  render: (p) => (
                    <button
                      className="btn btn-ghost"
                      type="button"
                      style={{ padding: "6px 12px", fontSize: 12 }}
                      data-testid={`close-${p.id}`}
                      onClick={() => openDialog({ kind: "close", project: p })}
                    >
                      Close
                    </button>
                  ),
                },
              ]}
              rows={desk.data.active}
              getRowKey={(p) => p.id}
              empty="No active projects on the register."
              scrollLabel="Active fundraising projects (scrolls horizontally on narrow screens)"
            />
          </article>

          {/* ── Panel 3: decided ledger ──────────────────────────────── */}
          <article className={styles.panel} data-testid="panel-decided">
            <h2 className={styles.panelTitle}>Decided ledger</h2>
            <p className={styles.panelNote}>
              Declined, closed, and withdrawn projects — the fifty most recent decisions.
            </p>
            <Ledger<BaseProject>
              columns={[
                { key: "title", label: "Title" },
                {
                  key: "creator",
                  label: "Creator",
                  render: (p) => <span className={styles.mono}>{creatorLine(p)}</span>,
                },
                {
                  key: "goalCoin",
                  label: "Goal",
                  align: "right",
                  render: (p) => <span className={styles.mono}>{formatCoin(p.goalCoin)}</span>,
                },
                {
                  key: "status",
                  label: "Status",
                  render: (p) => (
                    <>
                      <span className={STATUS_CHIP[p.status]}>{p.status}</span>
                      {p.reviewNote && <span className={styles.rowNote}>{p.reviewNote}</span>}
                    </>
                  ),
                },
              ]}
              rows={desk.data.decided}
              getRowKey={(p) => p.id}
              empty="No decisions on record yet."
              scrollLabel="Decided fundraising projects (scrolls horizontally on narrow screens)"
            />
          </article>
        </>
      )}

      {/* ── Dialogs ──────────────────────────────────────────────────── */}
      {dialog?.kind === "decline" && (
        <Modal title="Decline proposal" onClose={() => setDialog(null)}>
          <p className={styles.dialogText}>
            Decline <b>{dialog.project.title}</b> by {creatorLine(dialog.project)}. A review note is
            required and will be entered in the record.
          </p>
          <Field id="decline-note" label="Review note (required)">
            <textarea
              id="decline-note"
              className={styles.noteArea}
              value={dialogNote}
              onChange={(e) => setDialogNote(e.target.value)}
              minLength={3}
              maxLength={500}
              required
            />
          </Field>
          {mutError && (
            <p role="alert" className={styles.error}>
              {mutError}
            </p>
          )}
          <div className={styles.dialogActions}>
            <button
              className={styles.dangerBtn}
              type="button"
              data-testid="decline-confirm"
              disabled={dialogNote.trim().length < 3}
              onClick={() =>
                void decide(
                  dialog.project.id,
                  { action: "decline", note: dialogNote.trim() },
                  "Proposal declined.",
                )
              }
            >
              Decline proposal
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setDialog(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {dialog?.kind === "close" && (
        <Modal title="Close project" onClose={() => setDialog(null)}>
          <p className={styles.dialogText}>
            Close <b>{dialog.project.title}</b>? The project leaves the active register; its{" "}
            {dialog.project.pledgeCount} pledged commitment
            {dialog.project.pledgeCount === 1 ? "" : "s"} remain on record. No funds move — the
            Republic never holds them.
          </p>
          <Field id="close-note" label="Closing note (optional)">
            <textarea
              id="close-note"
              className={styles.noteArea}
              value={dialogNote}
              onChange={(e) => setDialogNote(e.target.value)}
              maxLength={500}
            />
          </Field>
          {mutError && (
            <p role="alert" className={styles.error}>
              {mutError}
            </p>
          )}
          <div className={styles.dialogActions}>
            <button
              className={`btn btn-primary ${styles.primaryAction}`}
              type="button"
              data-testid="close-confirm"
              onClick={() =>
                void decide(
                  dialog.project.id,
                  {
                    action: "close",
                    ...(dialogNote.trim().length >= 3 ? { note: dialogNote.trim() } : {}),
                  },
                  "Project closed.",
                )
              }
            >
              Close project
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setDialog(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
