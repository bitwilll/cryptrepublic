"use client";
import { useState } from "react";
import {
  PENAL_GRADES,
  PENAL_GRADE_BANDS,
  OFFICE_FORFEITURE_GRADE,
  type PenalGrade,
} from "@/lib/gov/types";
import styles from "./reports.module.css";

/**
 * The verify/dismiss decision form (Wave 17) — shared by the officer tribunal
 * and the admin Conduct desk. Client-side validation MIRRORS
 * lib/validation/reports.ts exactly: verify needs a grade, a penalty INSIDE
 * the grade's Penal Code band (validated live), and a note; dismiss takes an
 * optional note. Two-step: a valid submission first ARMS the decision — a
 * separate confirm enters it on the record. The server re-validates
 * regardless.
 */

export interface DecidePayload {
  action: "verify" | "dismiss";
  grade?: PenalGrade;
  penalty?: number;
  note?: string;
}

function bandLabel(grade: PenalGrade): string {
  const band = PENAL_GRADE_BANDS[grade];
  return `${band.min} to ${band.max}`;
}

export function DecideReportForm({
  idPrefix,
  suggestedGrade,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  /** Unique prefix for input ids (one form per report card). */
  idPrefix: string;
  /** Preselects the grade hinted by the report's category. */
  suggestedGrade?: PenalGrade;
  busy: boolean;
  /** Server-side error, rendered in the form's alert slot. */
  error: string | null;
  onSubmit: (payload: DecidePayload) => void;
  onCancel?: () => void;
}) {
  const [mode, setMode] = useState<"verify" | "dismiss">("verify");
  const [grade, setGrade] = useState<PenalGrade>(suggestedGrade ?? "I");
  const [penaltyRaw, setPenaltyRaw] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [armed, setArmed] = useState(false);

  const band = PENAL_GRADE_BANDS[grade];
  const penalty = /^-?\d+$/.test(penaltyRaw.trim()) ? Number(penaltyRaw.trim()) : null;
  const penaltyError =
    mode === "verify" && (penalty === null || penalty < band.min || penalty > band.max)
      ? `Grade ${grade} penalties must be between ${band.min} and ${band.max}.`
      : null;
  const noteError =
    mode === "verify" && note.trim().length === 0 ? "Verification requires a note." : null;
  const valid = mode === "dismiss" || (!penaltyError && !noteError);

  function touch(name: string) {
    setTouched((t) => ({ ...t, [name]: true }));
  }

  /** Any edit disarms a pending confirmation. */
  function disarm() {
    setArmed(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (armed) return; // the confirm button handles the armed state
    setTouched({ penalty: true, note: true });
    if (!valid) return;
    setArmed(true);
  }

  function confirm() {
    if (mode === "verify") {
      onSubmit({ action: "verify", grade, penalty: penalty!, note: note.trim() });
    } else {
      const trimmed = note.trim();
      onSubmit({ action: "dismiss", ...(trimmed ? { note: trimmed } : {}) });
    }
  }

  return (
    <form
      className={styles.form}
      onSubmit={submit}
      noValidate
      data-testid={`${idPrefix}-decide-form`}
    >
      <fieldset className={styles.modeGroup}>
        <legend>Decision</legend>
        <label className={styles.modeOption} htmlFor={`${idPrefix}-mode-verify`}>
          <input
            id={`${idPrefix}-mode-verify`}
            type="radio"
            name={`${idPrefix}-mode`}
            checked={mode === "verify"}
            onChange={() => {
              setMode("verify");
              disarm();
            }}
            data-testid={`${idPrefix}-mode-verify`}
          />
          Verify
        </label>
        <label className={styles.modeOption} htmlFor={`${idPrefix}-mode-dismiss`}>
          <input
            id={`${idPrefix}-mode-dismiss`}
            type="radio"
            name={`${idPrefix}-mode`}
            checked={mode === "dismiss"}
            onChange={() => {
              setMode("dismiss");
              disarm();
            }}
            data-testid={`${idPrefix}-mode-dismiss`}
          />
          Dismiss
        </label>
      </fieldset>

      {mode === "verify" && (
        <>
          <div className={styles.field}>
            <label htmlFor={`${idPrefix}-grade`} className={styles.microLabel}>
              Penal Code grade
            </label>
            <select
              id={`${idPrefix}-grade`}
              className={styles.select}
              style={{ maxWidth: 320 }}
              value={grade}
              onChange={(e) => {
                setGrade(e.target.value as PenalGrade);
                disarm();
              }}
              data-testid={`${idPrefix}-grade-select`}
            >
              {PENAL_GRADES.map((g) => (
                <option key={g} value={g}>
                  Grade {g} (band {bandLabel(g)})
                </option>
              ))}
            </select>
            {grade === OFFICE_FORFEITURE_GRADE && (
              <p className={styles.forfeitWarning} data-testid={`${idPrefix}-forfeit-warning`}>
                Grade V verification forfeits every office the subject holds — the Penal Code
                revokes each active appointment with the decision.
              </p>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor={`${idPrefix}-penalty`} className={styles.microLabel}>
              Penalty (band {bandLabel(grade)})
            </label>
            <input
              id={`${idPrefix}-penalty`}
              className={styles.input}
              style={{ maxWidth: 160 }}
              inputMode="numeric"
              value={penaltyRaw}
              onChange={(e) => {
                setPenaltyRaw(e.target.value);
                disarm();
              }}
              onBlur={() => touch("penalty")}
              placeholder={String(band.max)}
              aria-invalid={Boolean(touched.penalty && penaltyError)}
              aria-describedby={`${idPrefix}-penalty-error`}
              data-testid={`${idPrefix}-penalty-input`}
            />
            <div id={`${idPrefix}-penalty-error`} aria-live="polite">
              {touched.penalty && penaltyError && (
                <p className={styles.fieldError}>{penaltyError}</p>
              )}
            </div>
          </div>
        </>
      )}

      <div className={styles.field}>
        <label htmlFor={`${idPrefix}-note`} className={styles.microLabel}>
          {mode === "verify" ? "Decision note (required)" : "Decision note (optional)"}
        </label>
        <textarea
          id={`${idPrefix}-note`}
          className={styles.textarea}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            disarm();
          }}
          onBlur={() => touch("note")}
          maxLength={500}
          aria-invalid={Boolean(touched.note && noteError)}
          aria-describedby={`${idPrefix}-note-error`}
          data-testid={`${idPrefix}-note-input`}
        />
        <div id={`${idPrefix}-note-error`} aria-live="polite">
          {touched.note && noteError && <p className={styles.fieldError}>{noteError}</p>}
        </div>
      </div>

      <div aria-live="polite">
        {error && (
          <p className={styles.error} role="alert" data-testid={`${idPrefix}-decide-error`}>
            {error}
          </p>
        )}
      </div>

      {armed ? (
        <div className={styles.confirmBox} data-testid={`${idPrefix}-confirm-box`}>
          <p style={{ margin: 0 }}>
            {mode === "verify" ? (
              <>
                Enter a <b>Grade {grade}</b> verification with a penalty of <b>{penalty}</b> on the
                record? The penalty enters the subject&rsquo;s trust score under the Penal Code
                {grade === OFFICE_FORFEITURE_GRADE
                  ? " and every office the subject holds is forfeited"
                  : ""}
                . The decision is audit-logged.
              </>
            ) : (
              <>Dismiss this report? The dismissal is entered on the record and audit-logged.</>
            )}
          </p>
          <div className={styles.formActions} style={{ marginTop: 12 }}>
            <button
              type="button"
              className={mode === "verify" ? styles.dangerBtn : "btn btn-primary"}
              disabled={busy}
              onClick={confirm}
              data-testid={`${idPrefix}-confirm`}
            >
              {busy
                ? "Entering…"
                : mode === "verify"
                  ? "Confirm verification"
                  : "Confirm dismissal"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={disarm} disabled={busy}>
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.formActions}>
          <button
            type="submit"
            className={mode === "verify" ? styles.dangerBtn : "btn btn-primary"}
            disabled={busy}
            data-testid={`${idPrefix}-submit`}
          >
            {mode === "verify" ? "Verify report…" : "Dismiss report…"}
          </button>
          {onCancel && (
            <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
          )}
        </div>
      )}
    </form>
  );
}
