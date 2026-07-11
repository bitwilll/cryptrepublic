"use client";
import { useCallback, useEffect, useState } from "react";
import { Skeleton, CardError, Field, inputStyle, type Load } from "./bits";
import { Modal } from "@/components/ui/Modal";
import { formatDate } from "@/lib/store/format";
import { CIVIC_OFFICES, UNIQUE_OFFICES, OFFICE_LABELS, type CivicOffice } from "@/lib/gov/types";
import styles from "./OfficesDeskApp.module.css";

/**
 * Offices desk (Wave 16) — the Republic's protocol office. Two panels:
 *  1. Council of the Republic: the active roster in precedence order
 *     (PM → CM → COP → Ministers → Senators → Legislators → Protectors).
 *     Unique offices render as single-seat cards ("VACANT SEAT" when unheld);
 *     revocation is two-step with an optional note.
 *  2. Letters of appointment: search a citizen, choose an office (single
 *     seats marked), portfolio for ministers, and appoint. A 409 seat
 *     conflict surfaces inline — the desk must revoke first.
 * OFFICES ARE HONOURS + DISPLAY ONLY — they grant no auth privilege. Every
 * appointment and revocation is entered in the audit log by the API, in the
 * same transaction.
 */

interface RosterRow {
  id: string;
  userId: string;
  email: string | null;
  name: string | null;
  citizen: string;
  office: string;
  portfolio: string | null;
  note: string | null;
  appointedAt: string;
  appointedBy: string;
}
interface UserMatch {
  id: string;
  email: string | null;
  name: string | null;
  citizen: string;
  offices: Array<{ office: string; portfolio: string | null }>;
}

const PORTFOLIO_OFFICES: readonly CivicOffice[] = ["MINISTER", "CHIEF_MINISTER"];

function officeLabel(office: string): string {
  return OFFICE_LABELS[office as CivicOffice] ?? office;
}

export function OfficesDeskApp() {
  const [roster, setRoster] = useState<Load<RosterRow[]>>({ status: "loading" });

  // Appointment form
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<UserMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<UserMatch | null>(null);
  const [office, setOffice] = useState<CivicOffice>("MINISTER");
  const [portfolio, setPortfolio] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState("");

  const [revokeTarget, setRevokeTarget] = useState<RosterRow | null>(null);
  const [revokeNote, setRevokeNote] = useState("");
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState("");

  const load = useCallback(() => {
    setRoster({ status: "loading" });
    fetch("/api/admin/offices")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: { roster: RosterRow[] }) => setRoster({ status: "ok", data: d.roster }))
      .catch(() => setRoster({ status: "error" }));
  }, []);

  useEffect(() => load(), [load]);

  // Debounced citizen search for the appointment form (min 2 chars).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setMatches([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      fetch(`/api/admin/offices?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
        .then((d: { users?: UserMatch[] }) => setMatches(d.users ?? []))
        .catch(() => setMatches([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  async function appoint(): Promise<void> {
    if (!selected) {
      setFormError("Select a citizen to appoint.");
      return;
    }
    setFormError("");
    setStatusMsg("");
    try {
      const res = await fetch("/api/admin/offices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: selected.id,
          office,
          ...(PORTFOLIO_OFFICES.includes(office) && portfolio.trim()
            ? { portfolio: portfolio.trim() }
            : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setFormError(d.error ?? "The appointment could not be entered.");
        return;
      }
      setStatusMsg(
        `${selected.citizen} appointed ${officeLabel(office)}. Entered in the audit log.`,
      );
      setSelected(null);
      setQuery("");
      setPortfolio("");
      setNote("");
      load();
    } catch {
      setFormError("The appointment could not be entered.");
    }
  }

  async function revoke(): Promise<void> {
    if (!revokeTarget) return;
    setRevokeError(null);
    setStatusMsg("");
    try {
      const res = await fetch("/api/admin/offices/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          appointmentId: revokeTarget.id,
          ...(revokeNote.trim() ? { note: revokeNote.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setRevokeError(d.error ?? "The revocation could not be entered.");
        return;
      }
      setStatusMsg(
        `${officeLabel(revokeTarget.office)} appointment revoked. Entered in the audit log.`,
      );
      setRevokeTarget(null);
      setRevokeNote("");
      load();
    } catch {
      setRevokeError("The revocation could not be entered.");
    }
  }

  function holderIdentity(r: RosterRow) {
    return (
      <div className={styles.holderId}>
        <b>{r.citizen}</b>
        <span className={styles.holderMail}>{r.email ?? r.userId}</span>
      </div>
    );
  }

  function revokeButton(r: RosterRow) {
    return (
      <button
        className={styles.revokeBtn}
        type="button"
        data-testid={`revoke-${r.id}`}
        onClick={() => {
          setRevokeError(null);
          setRevokeNote("");
          setRevokeTarget(r);
        }}
      >
        Revoke
      </button>
    );
  }

  const uniqueOffices = CIVIC_OFFICES.filter((o) => UNIQUE_OFFICES.includes(o));
  const benchOffices = CIVIC_OFFICES.filter((o) => !UNIQUE_OFFICES.includes(o));

  return (
    <div className={`wrap ${styles.app}`} data-testid="offices-desk">
      <div className="kicker">PROTOCOL OFFICE</div>

      <div className={styles.notice}>
        <span className={styles.noticeLabel}>Honours of the Republic</span>
        Civic offices are honours and public display only — they grant no authorisation. Seats are
        assigned and revoked here, by the desk, on the record.
      </div>

      <p aria-live="polite" role="status" className={styles.status} data-testid="offices-status">
        {statusMsg}
      </p>

      {/* ── Panel 1: the Council roster ─────────────────────────────── */}
      <article className={styles.panel} data-testid="panel-council">
        <h2 className={styles.panelTitle}>Council of the Republic</h2>
        <p className={styles.panelNote}>
          The active roster, in protocol order. The Prime Minister, Chief Minister, and Chief of
          Protectors hold single seats — a successor requires the sitting holder&apos;s revocation
          first.
        </p>

        {roster.status === "loading" && <Skeleton lines={4} />}
        {roster.status === "error" && <CardError onRetry={load} testid="roster-error" />}
        {roster.status === "ok" && (
          <>
            <div className={styles.seatGrid}>
              {uniqueOffices.map((o) => {
                const holder = roster.data.find((r) => r.office === o);
                return holder ? (
                  <section
                    key={o}
                    className={styles.seatCard}
                    data-testid={`seat-${o}`}
                    aria-label={`${OFFICE_LABELS[o]} — held`}
                  >
                    <div className={styles.seatOffice}>{OFFICE_LABELS[o]}</div>
                    <div className={styles.seatHolder}>{holder.citizen}</div>
                    <div className={styles.holderMail}>{holder.email ?? holder.userId}</div>
                    <div className={styles.holderMeta} style={{ marginTop: 10 }}>
                      {holder.portfolio && (
                        <span className={styles.portfolio}>{holder.portfolio}</span>
                      )}
                      <span className={styles.tenure}>Since {formatDate(holder.appointedAt)}</span>
                    </div>
                    <div style={{ marginTop: 12 }}>{revokeButton(holder)}</div>
                  </section>
                ) : (
                  <section
                    key={o}
                    className={styles.vacantSeat}
                    data-testid={`seat-${o}`}
                    aria-label={`${OFFICE_LABELS[o]} — vacant`}
                  >
                    <div className={styles.seatOffice}>{OFFICE_LABELS[o]}</div>
                    <div className={styles.vacantLabel}>Vacant seat</div>
                  </section>
                );
              })}
            </div>

            {benchOffices.map((o) => {
              const holders = roster.data.filter((r) => r.office === o);
              return (
                <section key={o} className={styles.officeGroup} data-testid={`group-${o}`}>
                  <h3 className={styles.groupLabel}>
                    {OFFICE_LABELS[o]}s — {holders.length} seated
                  </h3>
                  {holders.length === 0 && (
                    <div className={styles.groupEmpty}>
                      No {OFFICE_LABELS[o].toLowerCase()}s hold office.
                    </div>
                  )}
                  {holders.map((r) => (
                    <div key={r.id} className={styles.holderRow} data-testid={`holder-${r.id}`}>
                      {holderIdentity(r)}
                      <div className={styles.holderMeta}>
                        {r.portfolio && <span className={styles.portfolio}>{r.portfolio}</span>}
                        <span className={styles.tenure}>Since {formatDate(r.appointedAt)}</span>
                        {revokeButton(r)}
                      </div>
                    </div>
                  ))}
                </section>
              );
            })}
          </>
        )}
      </article>

      {/* ── Panel 2: letters of appointment ─────────────────────────── */}
      <article className={styles.panel} data-testid="panel-appoint">
        <h2 className={styles.panelTitle}>Letters of appointment</h2>
        <p className={styles.panelNote}>
          Search the citizen registry, choose the office, and enter the appointment. Single seats
          must be vacated before a successor can be named.
        </p>

        <div className={styles.form}>
          <Field id="appoint-search" label="Citizen (search by email or name)">
            <input
              id="appoint-search"
              style={inputStyle}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
              }}
              placeholder="At least 2 characters"
              autoComplete="off"
            />
          </Field>

          {searching && <p className={styles.dim}>Searching the registry…</p>}
          {!selected && !searching && query.trim().length >= 2 && matches.length === 0 && (
            <p className={styles.dim} data-testid="no-matches">
              No citizens match.
            </p>
          )}
          {!selected && matches.length > 0 && (
            <ul className={styles.searchResults} data-testid="search-results">
              {matches.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    className={styles.searchResult}
                    data-testid={`pick-${u.id}`}
                    onClick={() => setSelected(u)}
                  >
                    <b>{u.citizen}</b> <span className={styles.mono}>{u.email ?? u.id}</span>
                    <span className={styles.resultOffices}>
                      {u.offices.length === 0
                        ? "Holds no office"
                        : `Holds: ${u.offices.map((x) => officeLabel(x.office)).join(", ")}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selected && (
            <div className={styles.selectedUser} data-testid="selected-user">
              <span>
                <b>{selected.citizen}</b>{" "}
                <span className={styles.mono}>{selected.email ?? selected.id}</span>
                <span className={styles.resultOffices}>
                  {selected.offices.length === 0
                    ? "Holds no office"
                    : `Holds: ${selected.offices.map((x) => officeLabel(x.office)).join(", ")}`}
                </span>
              </span>
              <button className="btn btn-ghost" type="button" onClick={() => setSelected(null)}>
                Change
              </button>
            </div>
          )}

          <Field id="appoint-office" label="Office">
            <select
              id="appoint-office"
              style={inputStyle}
              value={office}
              aria-invalid={formError ? true : undefined}
              aria-describedby="appoint-error"
              onChange={(e) => setOffice(e.target.value as CivicOffice)}
            >
              {CIVIC_OFFICES.map((o) => (
                <option key={o} value={o}>
                  {OFFICE_LABELS[o]}
                  {UNIQUE_OFFICES.includes(o) ? " · single seat" : ""}
                </option>
              ))}
            </select>
          </Field>

          {PORTFOLIO_OFFICES.includes(office) && (
            <Field id="appoint-portfolio" label="Portfolio — e.g. Treasury">
              <input
                id="appoint-portfolio"
                style={inputStyle}
                value={portfolio}
                onChange={(e) => setPortfolio(e.target.value)}
                maxLength={80}
              />
            </Field>
          )}

          <Field id="appoint-note" label="Note (optional)">
            <input
              id="appoint-note"
              style={inputStyle}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={280}
            />
          </Field>

          <p id="appoint-error" role="alert" className={styles.error} data-testid="appoint-error">
            {formError}
          </p>

          <button
            className={`btn btn-primary ${styles.primaryAction}`}
            type="button"
            data-testid="appoint-submit"
            disabled={!selected}
            onClick={() => void appoint()}
          >
            Appoint
          </button>
        </div>
      </article>

      <p className={styles.footNote}>
        Every appointment and revocation is entered in the audit log.
      </p>

      {/* ── Revoke dialog (two-step) ─────────────────────────────────── */}
      {revokeTarget && (
        <Modal title="Revoke appointment" onClose={() => setRevokeTarget(null)}>
          <p className={styles.dialogText}>
            Revoke the {officeLabel(revokeTarget.office)} appointment of{" "}
            <b>{revokeTarget.citizen}</b> ({revokeTarget.email ?? revokeTarget.userId})? The seat
            becomes vacant; the revocation is entered in the audit log.
          </p>
          <Field id="revoke-note" label="Revocation note (optional)">
            <textarea
              id="revoke-note"
              className={styles.noteArea}
              value={revokeNote}
              onChange={(e) => setRevokeNote(e.target.value)}
              maxLength={280}
            />
          </Field>
          {revokeError && (
            <p role="alert" className={styles.error} style={{ marginTop: 10 }}>
              {revokeError}
            </p>
          )}
          <div className={styles.dialogActions}>
            <button
              className={styles.revokeBtn}
              type="button"
              data-testid="revoke-confirm"
              onClick={() => void revoke()}
            >
              Revoke appointment
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setRevokeTarget(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
