"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { REPORT_CATEGORIES, REPORT_CATEGORY_LABELS, type ReportCategory } from "@/lib/gov/types";
import styles from "./reports.module.css";

/**
 * /dashboard/conduct island (Wave 17 integration) — the citizen side of the
 * conduct system: file a report against a Civic ID, follow your own filings,
 * and read the verified charges entered against you (the right-to-see). The
 * officer/admin decision surfaces live at /dashboard/tribunal and
 * /admin/reports; this component only consumes POST/GET /api/reports.
 */

const CIVIC_RE = /^CR-[23456789BCDFGHJKMNPQRSTVWXYZ]{4}-[23456789BCDFGHJKMNPQRSTVWXYZ]{4}$/;

interface FiledRow {
  id: string;
  subjectCivicId: string;
  category: ReportCategory;
  status: "SUBMITTED" | "VERIFIED" | "DISMISSED";
  createdAt: string;
  decidedAt: string | null;
  grade: string | null;
}

interface AgainstRow {
  id: string;
  category: ReportCategory;
  grade: string;
  penalty: number;
  note: string | null;
  decidedAt: string;
}

type Data = { filed: FiledRow[]; verifiedAgainstMe: AgainstRow[] };

const dateFmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

function statusPill(status: FiledRow["status"]): string {
  if (status === "VERIFIED") return `${styles.pill} ${styles.pillDanger}`;
  if (status === "DISMISSED") return `${styles.pill} ${styles.pillMuted}`;
  return `${styles.pill} ${styles.pillGold}`;
}

export function FileReportApp() {
  const [data, setData] = useState<Data | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ok" | "error">("loading");

  const [civicId, setCivicId] = useState("");
  const [category, setCategory] = useState<ReportCategory>(REPORT_CATEGORIES[0]);
  const [body, setBody] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/reports");
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as Data);
      setLoadState("ok");
    } catch {
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const normalized = civicId
    .trim()
    .toUpperCase()
    .replace(/[\s–—]+/g, "-");
  const civicValid = CIVIC_RE.test(normalized);
  const bodyValid = body.trim().length >= 20 && body.length <= 2000;

  const submit = async () => {
    if (!civicValid) {
      setFieldError("That is not a valid Civic ID (CR-XXXX-XXXX).");
      return;
    }
    if (!bodyValid) {
      setFieldError("Describe the conduct in 20–2000 characters.");
      return;
    }
    setFieldError(null);
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setStatus("Filing…");
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectCivicId: normalized, category, body: body.trim() }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setStatus("");
        setFieldError(payload.error ?? "The registry declined the filing.");
      } else {
        setStatus("Filed. The report awaits verification by a Protector or the Cabinet.");
        setCivicId("");
        setBody("");
        void load();
      }
    } catch {
      setStatus("");
      setFieldError("The registry could not be reached.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <>
      <section className={styles.card}>
        <h2 className={styles.microLabel}>File a conduct report · verified under the Penal Code</h2>
        <p className={styles.cardNote}>
          Name the citizen by their Civic ID. A sitting Protector or the Cabinet weighs the report;
          only a <em>verified</em> report enters the subject&rsquo;s trust score. The subject never
          learns who filed. False reports are themselves an offence (
          <Link href="/documents/penal-code" style={{ color: "var(--blue)" }}>
            Penal Code
          </Link>
          , Grade II).
        </p>

        <div style={{ marginTop: 16 }}>
          <label
            className={styles.microLabel}
            htmlFor="report-civic-id"
            style={{ display: "block" }}
          >
            Subject&rsquo;s Civic ID
          </label>
          <input
            id="report-civic-id"
            className={styles.input}
            value={civicId}
            onChange={(e) => setCivicId(e.target.value.toUpperCase())}
            placeholder="CR-XXXX-XXXX"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={civicId.length > 0 && !civicValid}
            aria-describedby="report-field-error"
            style={{ fontFamily: "var(--mono)", marginTop: 6, maxWidth: 280 }}
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <label
            className={styles.microLabel}
            htmlFor="report-category"
            style={{ display: "block" }}
          >
            Offence category
          </label>
          <select
            id="report-category"
            className={styles.select}
            value={category}
            onChange={(e) => setCategory(e.target.value as ReportCategory)}
            style={{ marginTop: 6, maxWidth: 420 }}
          >
            {REPORT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {REPORT_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginTop: 14 }}>
          <label className={styles.microLabel} htmlFor="report-body" style={{ display: "block" }}>
            The conduct, in your own words (20–2000 characters)
          </label>
          <textarea
            id="report-body"
            className={styles.textarea}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            aria-invalid={body.length > 0 && !bodyValid}
            aria-describedby="report-field-error"
            style={{ marginTop: 6 }}
          />
        </div>

        <div id="report-field-error" aria-live="polite">
          {fieldError && (
            <p role="alert" style={{ color: "#8b3a3a", fontSize: 13, marginTop: 8 }}>
              {fieldError}
            </p>
          )}
        </div>

        <div
          style={{
            marginTop: 16,
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void submit()}
            disabled={busy}
            style={{ minHeight: 44 }}
            data-testid="file-report-submit"
          >
            {confirming ? "Confirm the filing" : "File the report"}
          </button>
          {confirming && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setConfirming(false)}
              style={{ minHeight: 44 }}
            >
              Stand down
            </button>
          )}
        </div>
        <div
          className={styles.status}
          aria-live="polite"
          style={{ minHeight: 16, margin: "8px 0 0" }}
        >
          {status}
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.microLabel}>My filings</h2>
        {loadState === "loading" && <div className="skeleton-line" style={{ marginTop: 12 }} />}
        {loadState === "error" && (
          <p className={styles.cardNote}>The registry could not be reached. Reload to retry.</p>
        )}
        {loadState === "ok" && data && data.filed.length === 0 && (
          <p className="empty-state" style={{ marginTop: 12 }}>
            You have filed no conduct reports.
          </p>
        )}
        {loadState === "ok" && data && data.filed.length > 0 && (
          <div className={styles.queue} style={{ marginTop: 8 }}>
            {data.filed.map((r) => (
              <div key={r.id} className={styles.queueCard} data-testid="my-filing">
                <div className={styles.queueHead}>
                  <span className={styles.mono}>{r.subjectCivicId}</span>
                  <span className={statusPill(r.status)}>
                    {r.status}
                    {r.grade ? ` · GRADE ${r.grade}` : ""}
                  </span>
                </div>
                <div className={styles.queueMeta}>
                  {REPORT_CATEGORY_LABELS[r.category]} · filed {dateFmt(r.createdAt)}
                  {r.decidedAt ? ` · decided ${dateFmt(r.decidedAt)}` : " · awaiting verification"}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.card}>
        <h2 className={styles.microLabel}>Verified against me · the right to see</h2>
        <p className={styles.cardNote}>
          Only <em>verified</em> charges appear here, exactly as they entered your trust score.
          Unverified or dismissed reports never touch your standing and are not shown.
        </p>
        {loadState === "ok" && data && data.verifiedAgainstMe.length === 0 && (
          <p className="empty-state" style={{ marginTop: 12 }}>
            No verified conduct reports stand against you.
          </p>
        )}
        {loadState === "ok" && data && data.verifiedAgainstMe.length > 0 && (
          <div className={styles.queue} style={{ marginTop: 8 }}>
            {data.verifiedAgainstMe.map((r) => (
              <div key={r.id} className={styles.queueCard} data-testid="charge-against-me">
                <div className={styles.queueHead}>
                  <span>{REPORT_CATEGORY_LABELS[r.category]}</span>
                  <span className={`${styles.pill} ${styles.pillDanger}`}>
                    GRADE {r.grade} · {r.penalty}
                  </span>
                </div>
                <div className={styles.queueMeta}>decided {dateFmt(r.decidedAt)}</div>
                {r.note && <p className={styles.complaint}>{r.note}</p>}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
