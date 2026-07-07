"use client";
import { useCallback, useEffect, useState } from "react";
import { Skeleton, CardError, Field, inputStyle, type Load } from "./bits";
import { Modal } from "@/components/ui/Modal";
import { Ledger } from "@/components/ui/Ledger";
import {
  INSURANCE_STATUSES,
  LISTING_STATUSES,
  type InsuranceStatus,
  type ListingStatus,
} from "@/lib/services/types";
import styles from "./ServicesDeskApp.module.css";

/**
 * Services desk (Wave 15 C): three panels —
 *  1. Insurance queue: review/approve/decline with note dialogs (decline
 *     REQUIRES a note; the API enforces it too).
 *  2. Store moderation: search/filter + remove-with-reason (moderation, not
 *     deletion — the row survives, the audit row records the reason).
 *  3. Programme statistics: counts only. BitWill directives are PRIVATE — the
 *     desk sees how many are active, never who or what they name.
 * Every mutation is audit-logged by the API in the same transaction.
 */

interface Applicant {
  id: string;
  email: string | null;
  name: string | null;
}
interface AdminApplication extends Record<string, unknown> {
  id: string;
  product: string;
  coverageNote: string;
  valueUsd: string | null;
  status: InsuranceStatus;
  reviewNote: string | null;
  createdAt: string;
  user: Applicant;
}
interface AdminListing extends Record<string, unknown> {
  id: string;
  title: string;
  description: string;
  category: string;
  priceCoin: string;
  status: ListingStatus;
  createdAt: string;
  seller: Applicant;
}
interface Overview {
  insurance: Record<string, number>;
  listings: Record<string, number>;
  commissary: Array<{ itemId: string; count: number }>;
  bitwill: { activeCount: number };
}

type Dialog =
  | { kind: "approve" | "decline"; application: AdminApplication }
  | { kind: "remove"; listing: AdminListing }
  | null;

const INSURANCE_CHIP: Record<InsuranceStatus, string> = {
  SUBMITTED: `${styles.chip} ${styles.chipSubmitted}`,
  IN_REVIEW: `${styles.chip} ${styles.chipInReview}`,
  APPROVED: `${styles.chip} ${styles.chipApproved}`,
  DECLINED: `${styles.chip} ${styles.chipDeclined}`,
};
const LISTING_CHIP: Record<ListingStatus, string> = {
  ACTIVE: `${styles.chip} ${styles.chipActive}`,
  SOLD: styles.chip,
  WITHDRAWN: styles.chip,
  REMOVED: `${styles.chip} ${styles.chipRemoved}`,
};

function filed(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function ServicesDeskApp() {
  const [insurance, setInsurance] = useState<Load<AdminApplication[]>>({ status: "loading" });
  const [listings, setListings] = useState<Load<AdminListing[]>>({ status: "loading" });
  const [overview, setOverview] = useState<Load<Overview>>({ status: "loading" });

  const [insuranceFilter, setInsuranceFilter] = useState("ALL");
  const [storeFilter, setStoreFilter] = useState("ALL");
  const [storeQuery, setStoreQuery] = useState("");

  const [dialog, setDialog] = useState<Dialog>(null);
  const [dialogNote, setDialogNote] = useState("");
  const [mutError, setMutError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState("");

  const loadInsurance = useCallback(() => {
    setInsurance({ status: "loading" });
    const qs = insuranceFilter === "ALL" ? "" : `?status=${insuranceFilter}`;
    fetch(`/api/admin/services/insurance${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: { applications: AdminApplication[] }) =>
        setInsurance({ status: "ok", data: d.applications }),
      )
      .catch(() => setInsurance({ status: "error" }));
  }, [insuranceFilter]);

  const loadListings = useCallback(() => {
    setListings({ status: "loading" });
    const params = new URLSearchParams();
    if (storeFilter !== "ALL") params.set("status", storeFilter);
    if (storeQuery.trim()) params.set("q", storeQuery.trim());
    const qs = params.size > 0 ? `?${params.toString()}` : "";
    fetch(`/api/admin/services/store${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: { listings: AdminListing[] }) => setListings({ status: "ok", data: d.listings }))
      .catch(() => setListings({ status: "error" }));
  }, [storeFilter, storeQuery]);

  const loadOverview = useCallback(() => {
    setOverview({ status: "loading" });
    fetch("/api/admin/services/overview")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: Overview) => setOverview({ status: "ok", data: d }))
      .catch(() => setOverview({ status: "error" }));
  }, []);

  useEffect(() => loadInsurance(), [loadInsurance]);
  useEffect(() => loadListings(), [loadListings]);
  useEffect(() => loadOverview(), [loadOverview]);

  async function patch(url: string, body: unknown, done: string): Promise<void> {
    setMutError(null);
    setStatusMsg("");
    try {
      const res = await fetch(url, {
        method: "PATCH",
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
      loadInsurance();
      loadListings();
      loadOverview();
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
    <div className={`wrap ${styles.app}`} data-testid="services-desk">
      <div className="kicker">SERVICES DESK</div>

      <p aria-live="polite" role="status" className={styles.status} data-testid="services-status">
        {statusMsg}
      </p>
      {mutError && !dialog && (
        <p role="alert" className={styles.error} data-testid="services-error">
          {mutError}
        </p>
      )}

      {/* ── Panel 1: insurance queue ─────────────────────────────────── */}
      <article className={styles.panel} data-testid="panel-insurance">
        <h2 className={styles.panelTitle}>Insurance queue</h2>
        <p className={styles.panelNote}>
          Applications to the mutual-cover programme. A decline requires a review note; every
          decision is audit-logged. Registry state only — approval moves no funds.
        </p>
        <div className={styles.toolbar}>
          <Field id="insurance-filter" label="Status">
            <select
              id="insurance-filter"
              style={inputStyle}
              value={insuranceFilter}
              onChange={(e) => setInsuranceFilter(e.target.value)}
            >
              <option value="ALL">All</option>
              {INSURANCE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {insurance.status === "loading" && <Skeleton lines={3} />}
        {insurance.status === "error" && (
          <CardError onRetry={loadInsurance} testid="insurance-queue-error" />
        )}
        {insurance.status === "ok" && (
          <Ledger<AdminApplication>
            columns={[
              { key: "createdAt", label: "Filed", render: (a) => filed(a.createdAt) },
              {
                key: "user",
                label: "Applicant",
                render: (a) => <span className={styles.mono}>{a.user.email ?? a.user.id}</span>,
              },
              { key: "product", label: "Product" },
              {
                key: "valueUsd",
                label: "Declared value",
                align: "right",
                render: (a) =>
                  a.valueUsd === null ? (
                    <span className={styles.dim}>—</span>
                  ) : (
                    <span className={styles.mono}>
                      ${Number(a.valueUsd).toLocaleString("en-US")}
                    </span>
                  ),
              },
              {
                key: "coverageNote",
                label: "Cover sought",
                render: (a) => (
                  <span className={styles.dim}>
                    {a.coverageNote.length > 60
                      ? `${a.coverageNote.slice(0, 60)}…`
                      : a.coverageNote}
                  </span>
                ),
              },
              {
                key: "status",
                label: "Status",
                render: (a) => (
                  <>
                    <span className={INSURANCE_CHIP[a.status]}>{a.status.replace("_", " ")}</span>
                    {a.reviewNote && <span className={styles.rowNote}>{a.reviewNote}</span>}
                  </>
                ),
              },
              {
                key: "actions",
                label: "Action",
                render: (a) =>
                  a.status === "APPROVED" || a.status === "DECLINED" ? (
                    <span className={styles.dim}>Decided</span>
                  ) : (
                    <span className={styles.rowActions}>
                      {a.status === "SUBMITTED" && (
                        <button
                          className="btn btn-ghost"
                          type="button"
                          style={{ padding: "6px 12px", fontSize: 12 }}
                          data-testid={`insurance-review-${a.id}`}
                          onClick={() =>
                            void patch(
                              `/api/admin/services/insurance/${a.id}`,
                              { action: "review" },
                              "Application moved to review.",
                            )
                          }
                        >
                          Begin review
                        </button>
                      )}
                      <button
                        className="btn btn-ghost"
                        type="button"
                        style={{ padding: "6px 12px", fontSize: 12 }}
                        data-testid={`insurance-approve-${a.id}`}
                        onClick={() => openDialog({ kind: "approve", application: a })}
                      >
                        Approve
                      </button>
                      <button
                        className="btn btn-ghost"
                        type="button"
                        style={{ padding: "6px 12px", fontSize: 12 }}
                        data-testid={`insurance-decline-${a.id}`}
                        onClick={() => openDialog({ kind: "decline", application: a })}
                      >
                        Decline
                      </button>
                    </span>
                  ),
              },
            ]}
            rows={insurance.data}
            getRowKey={(a) => a.id}
            empty="The queue is clear."
            scrollLabel="Insurance queue (scrolls horizontally on narrow screens)"
          />
        )}
      </article>

      {/* ── Panel 2: store moderation ────────────────────────────────── */}
      <article className={styles.panel} data-testid="panel-store">
        <h2 className={styles.panelTitle}>Store moderation</h2>
        <p className={styles.panelNote}>
          Citizen-store listings across all statuses. Removal is moderation, not deletion — the
          listing row survives and the reason is recorded in the audit trail.
        </p>
        <div className={styles.toolbar}>
          <Field id="store-search" label="Search">
            <input
              id="store-search"
              style={inputStyle}
              value={storeQuery}
              onChange={(e) => setStoreQuery(e.target.value)}
              placeholder="Title or description"
            />
          </Field>
          <Field id="store-filter" label="Status">
            <select
              id="store-filter"
              style={inputStyle}
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
            >
              <option value="ALL">All</option>
              {LISTING_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {listings.status === "loading" && <Skeleton lines={3} />}
        {listings.status === "error" && (
          <CardError onRetry={loadListings} testid="store-table-error" />
        )}
        {listings.status === "ok" && (
          <Ledger<AdminListing>
            columns={[
              { key: "createdAt", label: "Listed", render: (l) => filed(l.createdAt) },
              { key: "title", label: "Title" },
              {
                key: "seller",
                label: "Seller",
                render: (l) => <span className={styles.mono}>{l.seller.email ?? l.seller.id}</span>,
              },
              { key: "category", label: "Category" },
              {
                key: "priceCoin",
                label: "Price ($CRYPT)",
                align: "right",
                render: (l) => <span className={styles.mono}>{l.priceCoin}</span>,
              },
              {
                key: "status",
                label: "Status",
                render: (l) => <span className={LISTING_CHIP[l.status]}>{l.status}</span>,
              },
              {
                key: "actions",
                label: "Action",
                render: (l) =>
                  l.status === "REMOVED" ? (
                    <span className={styles.dim}>Removed</span>
                  ) : (
                    <button
                      className="btn btn-ghost"
                      type="button"
                      style={{ padding: "6px 12px", fontSize: 12 }}
                      data-testid={`store-remove-${l.id}`}
                      onClick={() => openDialog({ kind: "remove", listing: l })}
                    >
                      Remove
                    </button>
                  ),
              },
            ]}
            rows={listings.data}
            getRowKey={(l) => l.id}
            empty="No listings match."
            scrollLabel="Store listings (scrolls horizontally on narrow screens)"
          />
        )}
      </article>

      {/* ── Panel 3: programme statistics ────────────────────────────── */}
      <article className={styles.panel} data-testid="panel-stats">
        <h2 className={styles.panelTitle}>Programme statistics</h2>
        <p className={styles.panelNote}>
          Aggregate registry counts across the citizen-services programmes.
        </p>
        {overview.status === "loading" && <Skeleton lines={3} />}
        {overview.status === "error" && <CardError onRetry={loadOverview} testid="stats-error" />}
        {overview.status === "ok" && (
          <div className={styles.statsGrid}>
            <div className={styles.statGroup}>
              <div className={styles.statGroupLabel}>Insurance by status</div>
              {INSURANCE_STATUSES.map((s) => (
                <div key={s} className={styles.statRow}>
                  <span>{s.replace("_", " ")}</span>
                  <span className={styles.statCount}>{overview.data.insurance[s] ?? 0}</span>
                </div>
              ))}
            </div>
            <div className={styles.statGroup}>
              <div className={styles.statGroupLabel}>Listings by status</div>
              {LISTING_STATUSES.map((s) => (
                <div key={s} className={styles.statRow}>
                  <span>{s}</span>
                  <span className={styles.statCount}>{overview.data.listings[s] ?? 0}</span>
                </div>
              ))}
            </div>
            <div className={styles.statGroup}>
              <div className={styles.statGroupLabel}>Commissary interest (top 10)</div>
              {overview.data.commissary.length === 0 && (
                <div className={styles.statRow}>
                  <span className={styles.dim}>No interest registered.</span>
                </div>
              )}
              {overview.data.commissary.map((c) => (
                <div key={c.itemId} className={styles.statRow}>
                  <span className={styles.mono}>{c.itemId}</span>
                  <span className={styles.statCount}>{c.count}</span>
                </div>
              ))}
            </div>
            <div className={styles.statGroup}>
              <div className={styles.statGroupLabel}>BitWill directives in force</div>
              <div className={styles.bigCount} data-testid="bitwill-active-count">
                {overview.data.bitwill.activeCount}
              </div>
              <p className={styles.privacyNote}>
                Directives are private instruments. The desk records only their number — never a
                beneficiary, memo, or signer.
              </p>
            </div>
          </div>
        )}
      </article>

      {/* ── Dialogs ──────────────────────────────────────────────────── */}
      {dialog?.kind === "approve" && (
        <Modal title="Approve application" onClose={() => setDialog(null)}>
          <p className={styles.dialogText}>
            Approve {dialog.application.product} cover for{" "}
            <b>{dialog.application.user.email ?? dialog.application.user.id}</b>? Registry state
            only — no funds move and no premium is collected.
          </p>
          <Field id="approve-note" label="Review note (optional)">
            <input
              id="approve-note"
              style={inputStyle}
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
              data-testid="approve-confirm"
              onClick={() =>
                void patch(
                  `/api/admin/services/insurance/${dialog.application.id}`,
                  {
                    action: "approve",
                    ...(dialogNote.trim() ? { reviewNote: dialogNote.trim() } : {}),
                  },
                  "Application approved.",
                )
              }
            >
              Approve
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setDialog(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {dialog?.kind === "decline" && (
        <Modal title="Decline application" onClose={() => setDialog(null)}>
          <p className={styles.dialogText}>
            Decline {dialog.application.product} cover for{" "}
            <b>{dialog.application.user.email ?? dialog.application.user.id}</b>. A review note is
            required and will be shown to the citizen.
          </p>
          <Field id="decline-note" label="Review note (required)">
            <input
              id="decline-note"
              style={inputStyle}
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
              className={`btn btn-primary ${styles.primaryAction}`}
              type="button"
              data-testid="decline-confirm"
              disabled={dialogNote.trim().length < 3}
              onClick={() =>
                void patch(
                  `/api/admin/services/insurance/${dialog.application.id}`,
                  { action: "decline", reviewNote: dialogNote.trim() },
                  "Application declined.",
                )
              }
            >
              Decline
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setDialog(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {dialog?.kind === "remove" && (
        <Modal title="Remove listing" onClose={() => setDialog(null)}>
          <p className={styles.dialogText}>
            Remove <b>{dialog.listing.title}</b> from the citizen store? The listing is retired from
            view, not deleted; the reason is recorded in the audit trail.
          </p>
          <Field id="remove-reason" label="Reason (required)">
            <input
              id="remove-reason"
              style={inputStyle}
              value={dialogNote}
              onChange={(e) => setDialogNote(e.target.value)}
              minLength={3}
              maxLength={300}
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
              className={`btn btn-primary ${styles.primaryAction}`}
              type="button"
              data-testid="remove-confirm"
              disabled={dialogNote.trim().length < 3}
              onClick={() =>
                void patch(
                  `/api/admin/services/store/${dialog.listing.id}`,
                  { action: "remove", reason: dialogNote.trim() },
                  "Listing removed.",
                )
              }
            >
              Remove listing
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
