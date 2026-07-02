"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Ledger } from "@/components/ui/Ledger";
import { APP_STATUS_ORDER } from "@/lib/applications/state";
import { Skeleton, CardError, type Load } from "./bits";

/**
 * Citizenship-application review list (Wave 9 C2). The status chips are the 5
 * REAL forward-only statuses (lib/applications/state.ts APP_STATUS_ORDER) —
 * NOT the stale APPLICATION_STATUSES union in lib/auth/types.ts (divergence
 * noted in the plan). Rows link to /admin/applications/[id].
 */

interface AppRow extends Record<string, unknown> {
  id: string;
  userId: string;
  status: string;
  kycStatus: string;
  reviewNote: string | null;
  name: string;
  domicileCity: string;
  hostCountry: string;
  updatedAt: string;
  user: { email: string | null; name: string | null };
}

interface AppsPage {
  applications: AppRow[];
  page: number;
  pageSize: number;
  total: number;
}

export function ApplicationsApp() {
  const [state, setState] = useState<Load<AppsPage>>({ status: "loading" });
  const [status, setStatus] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(
    (opts?: { page?: number; status?: string | null }) => {
      const p = opts?.page ?? page;
      const s = opts?.status !== undefined ? opts.status : status;
      setState({ status: "loading" });
      const params = new URLSearchParams({ page: String(p), pageSize: "20" });
      if (s) params.set("status", s);
      fetch(`/api/admin/applications?${params.toString()}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
        .then((d: AppsPage) => setState({ status: "ok", data: d }))
        .catch(() => setState({ status: "error" }));
    },
    [page, status],
  );

  useEffect(() => {
    load({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  const totalPages = state.status === "ok" ? Math.max(1, Math.ceil(state.data.total / 20)) : 1;

  return (
    <div
      className="wrap"
      style={{ padding: "32px 0", display: "flex", flexDirection: "column", gap: 24 }}
    >
      <div className="kicker">CITIZENSHIP APPLICATIONS</div>

      <article className="pillar" style={{ padding: "24px 28px" }}>
        <h3 style={{ margin: 0, fontSize: 20 }}>Applications</h3>
        <p style={{ color: "var(--muted)", marginTop: 4, fontSize: 12 }}>
          Review sets kycStatus and a note ONLY — the application status machine is forward-only and
          SEALED is chain-derived; the admin cannot set it.
        </p>

        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Chip active={status === null} label="ALL" onClick={() => filter(null)} />
          {APP_STATUS_ORDER.map((s) => (
            <Chip key={s} active={status === s} label={s} onClick={() => filter(s)} />
          ))}
        </div>

        {state.status === "loading" && <Skeleton lines={5} />}
        {state.status === "error" && (
          <CardError onRetry={() => load()} testid="applications-error" />
        )}
        {state.status === "ok" && (
          <div style={{ marginTop: 16 }}>
            <Ledger
              columns={[
                {
                  key: "email",
                  label: "Applicant",
                  render: (r: AppRow) => (
                    <Link href={`/admin/applications/${r.id}`} style={{ fontWeight: 600 }}>
                      {r.user.email ?? r.userId}
                    </Link>
                  ),
                },
                { key: "name", label: "Declared name" },
                {
                  key: "domicile",
                  label: "Domicile",
                  render: (r: AppRow) => `${r.domicileCity}, ${r.hostCountry}`,
                },
                { key: "status", label: "Status" },
                { key: "kycStatus", label: "KYC" },
                {
                  key: "updatedAt",
                  label: "Updated",
                  render: (r: AppRow) => new Date(r.updatedAt).toISOString().slice(0, 10),
                },
              ]}
              rows={state.data.applications}
              getRowKey={(r: AppRow) => r.id}
              empty="No applications with this status."
            />
          </div>
        )}

        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <button
            className="btn btn-ghost"
            type="button"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => {
              const p = page - 1;
              setPage(p);
              load({ page: p });
            }}
          >
            ← Prev
          </button>
          <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>
            page {page} of {totalPages}
          </span>
          <button
            className="btn btn-ghost"
            type="button"
            aria-label="Next page"
            disabled={page >= totalPages}
            onClick={() => {
              const p = page + 1;
              setPage(p);
              load({ page: p });
            }}
          >
            Next →
          </button>
        </div>
      </article>
    </div>
  );

  function filter(s: string | null) {
    setStatus(s);
    setPage(1);
    load({ page: 1, status: s });
  }
}

function Chip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: "6px 12px",
        border: active ? "1px solid var(--ink)" : "1px solid var(--line)",
        background: active ? "var(--ink)" : "#fff",
        color: active ? "#fff" : "var(--ink)",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.06em",
        fontFamily: "var(--mono)",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
