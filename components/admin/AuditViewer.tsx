"use client";
import { useCallback, useEffect, useState } from "react";
import { Skeleton, CardError, Field, inputStyle, type Load } from "./bits";

/**
 * Read-only audit viewer (Wave 9 C1): filter by action / actor userId,
 * prev/next pagination, and per-row expansion to the pretty-printed
 * before/after JSON snapshots (allowlist-serialized at write time — they can
 * never contain passwordHash/tokenHash).
 */

interface AuditRow {
  id: string;
  actorUserId: string | null;
  actorLabel: string;
  action: string;
  targetType: string;
  targetId: string;
  beforeJson: string | null;
  afterJson: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface AuditPage {
  rows: AuditRow[];
  page: number;
  pageSize: number;
  total: number;
}

function pretty(jsonText: string | null): string {
  if (jsonText === null) return "—";
  try {
    return JSON.stringify(JSON.parse(jsonText), null, 2);
  } catch {
    return jsonText;
  }
}

export function AuditViewer() {
  const [state, setState] = useState<Load<AuditPage>>({ status: "loading" });
  const [action, setAction] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(
    (opts?: { page?: number; action?: string; actorUserId?: string }) => {
      const p = opts?.page ?? page;
      const a = opts?.action ?? action;
      const u = opts?.actorUserId ?? actorUserId;
      setState({ status: "loading" });
      setExpanded(null);
      const params = new URLSearchParams({ page: String(p), pageSize: "20" });
      if (a.trim()) params.set("action", a.trim());
      if (u.trim()) params.set("actorUserId", u.trim());
      fetch(`/api/admin/audit?${params.toString()}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
        .then((d: AuditPage) => setState({ status: "ok", data: d }))
        .catch(() => setState({ status: "error" }));
    },
    [page, action, actorUserId],
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
      <div className="kicker">AUDIT TRAIL</div>

      <article className="pillar" style={{ padding: "24px 28px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <h3 style={{ margin: 0, fontSize: 20 }}>Administrative actions</h3>
          <a
            className="btn btn-ghost"
            href="/api/admin/export/audit"
            download
            data-testid="download-audit-csv"
          >
            Download audit CSV
          </a>
        </div>
        <p style={{ color: "var(--muted)", marginTop: 4, fontSize: 12 }}>
          Read-only. Every admin mutation writes its audit row in the same database transaction;
          before/after snapshots pass a per-type field allowlist.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            load({ page: 1 });
          }}
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: "1fr 1fr auto",
            gap: 12,
            alignItems: "end",
          }}
        >
          <Field id="audit-filter-action" label="Action">
            <input
              id="audit-filter-action"
              style={inputStyle}
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="user.suspend, content.asset.update, …"
            />
          </Field>
          <Field id="audit-filter-actor" label="Actor user id">
            <input
              id="audit-filter-actor"
              style={inputStyle}
              value={actorUserId}
              onChange={(e) => setActorUserId(e.target.value)}
              placeholder="usr_…"
            />
          </Field>
          <button className="btn btn-ghost" type="submit">
            Apply filters
          </button>
        </form>

        {state.status === "loading" && <Skeleton lines={5} />}
        {state.status === "error" && <CardError onRetry={() => load()} testid="audit-error" />}
        {state.status === "ok" && state.data.rows.length === 0 && (
          <p
            data-testid="audit-empty"
            style={{ color: "var(--muted)", marginTop: 16, fontSize: 13 }}
          >
            No audit rows match these filters.
          </p>
        )}
        {state.status === "ok" && state.data.rows.length > 0 && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column" }}>
            {state.data.rows.map((row) => (
              <div
                key={row.id}
                data-testid="audit-row"
                style={{ borderTop: "1px solid var(--line)" }}
              >
                <button
                  type="button"
                  onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                  aria-expanded={expanded === row.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "180px 1fr 1fr 1fr",
                    gap: 12,
                    width: "100%",
                    padding: "10px 4px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 13,
                    color: "var(--ink)",
                    fontFamily: "inherit",
                  }}
                >
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                    {new Date(row.createdAt).toISOString()}
                  </span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{row.action}</span>
                  <span style={{ overflowWrap: "anywhere" }}>{row.actorLabel}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                    {row.targetType} · {row.targetId}
                  </span>
                </button>
                {expanded === row.id && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                      padding: "0 4px 14px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: "0.1em",
                          color: "var(--muted)",
                          fontFamily: "var(--mono)",
                        }}
                      >
                        BEFORE
                      </div>
                      <pre
                        data-testid="audit-before"
                        style={{
                          margin: "6px 0 0",
                          padding: 10,
                          background: "var(--paper)",
                          border: "1px solid var(--line)",
                          fontSize: 11,
                          overflowX: "auto",
                        }}
                      >
                        {pretty(row.beforeJson)}
                      </pre>
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: "0.1em",
                          color: "var(--muted)",
                          fontFamily: "var(--mono)",
                        }}
                      >
                        AFTER
                      </div>
                      <pre
                        data-testid="audit-after"
                        style={{
                          margin: "6px 0 0",
                          padding: 10,
                          background: "var(--paper)",
                          border: "1px solid var(--line)",
                          fontSize: 11,
                          overflowX: "auto",
                        }}
                      >
                        {pretty(row.afterJson)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ))}
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
}
