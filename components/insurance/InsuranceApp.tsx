"use client";
import { useCallback, useEffect, useState } from "react";
import { Ledger } from "@/components/ui/Ledger";
import type { InsuranceProduct, InsuranceStatus } from "@/lib/services/types";
import styles from "./insurance.module.css";

/**
 * Citizen insurance office (Wave 15 B). A REGISTRY of cover applications —
 * no premiums are collected, no payouts are made, no funds move. Two product
 * desks (ASSET / HEALTH) each file applications; the ledger below shows the
 * citizen's own applications with their review state.
 */

interface Application extends Record<string, unknown> {
  id: string;
  product: InsuranceProduct;
  coverageNote: string;
  valueUsd: string | null;
  status: InsuranceStatus;
  reviewNote: string | null;
  createdAt: string;
}

type Load =
  | { status: "loading" }
  | { status: "ok"; applications: Application[] }
  | { status: "error" };

const CHIP_CLASS: Record<InsuranceStatus, string> = {
  SUBMITTED: `${styles.chip} ${styles.chipSubmitted}`,
  IN_REVIEW: `${styles.chip} ${styles.chipInReview}`,
  APPROVED: `${styles.chip} ${styles.chipApproved}`,
  DECLINED: `${styles.chip} ${styles.chipDeclined}`,
};

const PRODUCT_COPY: Record<
  InsuranceProduct,
  { title: string; kicker: string; description: string }
> = {
  ASSET: {
    title: "Asset cover",
    kicker: "Product I — Asset",
    description:
      "Registers a declared asset — physical or digital — for cover under the mutual-cover programme. State what is to be covered and its declared value in whole US dollars.",
  },
  HEALTH: {
    title: "Health cover",
    kicker: "Product II — Health",
    description:
      "Registers the citizen for health cover under the mutual-cover programme. State the cover you seek; no medical records are collected during registration.",
  },
};

function filedDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function ProductDesk({
  product,
  busy,
  onSubmit,
}: {
  product: InsuranceProduct;
  busy: boolean;
  onSubmit: (
    product: InsuranceProduct,
    coverageNote: string,
    valueUsd?: number,
  ) => Promise<boolean>;
}) {
  const [note, setNote] = useState("");
  const [value, setValue] = useState("");
  const copy = PRODUCT_COPY[product];
  const noteId = `ins-note-${product.toLowerCase()}`;
  const valueId = `ins-value-${product.toLowerCase()}`;

  return (
    <article className={styles.card} data-testid={`insurance-product-${product}`}>
      <div className={styles.productKicker}>{copy.kicker}</div>
      <h2 className={styles.cardTitle}>{copy.title}</h2>
      <p className={styles.cardNote}>{copy.description}</p>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit(product, note.trim(), product === "ASSET" ? Number(value) : undefined).then(
            (ok) => {
              if (ok) {
                setNote("");
                setValue("");
              }
            },
          );
        }}
      >
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={noteId}>
            What is to be covered
          </label>
          <textarea
            id={noteId}
            className={styles.input}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            required
            minLength={10}
            maxLength={2000}
            rows={4}
          />
        </div>
        {product === "ASSET" && (
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={valueId}>
              Declared value (whole USD)
            </label>
            <input
              id={valueId}
              className={styles.input}
              type="number"
              inputMode="numeric"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
              min={1}
              max={100_000_000}
              step={1}
            />
          </div>
        )}
        <button
          className={`btn btn-primary ${styles.primaryAction}`}
          type="submit"
          disabled={busy}
          data-testid={`insurance-apply-${product}`}
        >
          {busy ? "Working…" : "Register application"}
        </button>
      </form>
    </article>
  );
}

export function InsuranceApp() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState("");

  const reload = useCallback(() => {
    setLoad({ status: "loading" });
    fetch("/api/insurance/applications", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: { applications: Application[] }) =>
        setLoad({ status: "ok", applications: d.applications }),
      )
      .catch(() => setLoad({ status: "error" }));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function apply(
    product: InsuranceProduct,
    coverageNote: string,
    valueUsd?: number,
  ): Promise<boolean> {
    setError(null);
    setStatusMsg("");
    setBusy(true);
    try {
      const res = await fetch("/api/insurance/applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          product,
          coverageNote,
          ...(valueUsd !== undefined ? { valueUsd } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "The application could not be registered.");
        return false;
      }
      setStatusMsg("Application registered. The Insurance Office will review it in turn.");
      reload();
      return true;
    } catch {
      setError("The application could not be registered.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.app} data-testid="insurance-app">
      <div>
        <h2 style={{ fontSize: 32 }}>Citizen insurance</h2>
        <p className={styles.lede}>
          Apply for asset and health cover under the Republic&apos;s registry. Applications are
          reviewed by the Insurance Office and recorded with their outcome.
        </p>
      </div>

      <div className={styles.notice}>
        <span className={styles.noticeLabel}>Registration period</span>The Insurance Office
        registers applications for the Republic&apos;s mutual-cover programme. No premiums are
        collected during the registration period.
      </div>

      <p aria-live="polite" role="status" className={styles.status} data-testid="insurance-status">
        {statusMsg}
      </p>
      {error && (
        <p role="alert" className={styles.error} data-testid="insurance-error">
          {error}
        </p>
      )}

      <div className={styles.products}>
        <ProductDesk product="ASSET" busy={busy} onSubmit={apply} />
        <ProductDesk product="HEALTH" busy={busy} onSubmit={apply} />
      </div>

      <article className={styles.card}>
        <h2 className={styles.cardTitle}>My applications</h2>
        <p className={styles.cardNote}>
          Your applications on file with the Insurance Office, newest first. A citizen may hold at
          most three applications per product that are not declined.
        </p>
        {load.status === "loading" && <p className={styles.status}>Consulting the registry…</p>}
        {load.status === "error" && (
          <div>
            <p className={styles.cardNote}>The registry could not be reached.</p>
            <button className="btn btn-ghost" type="button" onClick={reload}>
              Retry
            </button>
          </div>
        )}
        {load.status === "ok" && (
          <Ledger<Application>
            columns={[
              {
                key: "createdAt",
                label: "Filed",
                render: (a) => filedDate(a.createdAt),
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
                    {a.coverageNote.length > 80
                      ? `${a.coverageNote.slice(0, 80)}…`
                      : a.coverageNote}
                  </span>
                ),
              },
              {
                key: "status",
                label: "Status",
                render: (a) => (
                  <>
                    <span className={CHIP_CLASS[a.status]}>{a.status.replace("_", " ")}</span>
                    {a.reviewNote && <span className={styles.reviewNote}>{a.reviewNote}</span>}
                  </>
                ),
              },
            ]}
            rows={load.applications}
            getRowKey={(a) => a.id}
            empty="No applications are on file."
            scrollLabel="Insurance applications (scrolls horizontally on narrow screens)"
          />
        )}
      </article>
    </div>
  );
}
