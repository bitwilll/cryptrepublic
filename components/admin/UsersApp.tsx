"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Ledger } from "@/components/ui/Ledger";
import { Skeleton, CardError, Field, inputStyle, TagLabel, type Load } from "./bits";

/**
 * Users list (Wave 9 C2): search + paginated ledger over the select-ALLOWLISTED
 * /api/admin/users payload (never passwordHash — the API enforces it; this
 * component only renders what it is given). Rows link to /admin/users/[id].
 */

interface AdminUserRow extends Record<string, unknown> {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  kycStatus: string;
  suspendedAt: string | null;
  createdAt: string;
  sessionCount: number;
}

interface UsersPage {
  users: AdminUserRow[];
  page: number;
  pageSize: number;
  total: number;
}

export function UsersApp() {
  const [state, setState] = useState<Load<UsersPage>>({ status: "loading" });
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(
    (opts?: { page?: number; q?: string }) => {
      const p = opts?.page ?? page;
      const query = opts?.q ?? q;
      setState({ status: "loading" });
      const params = new URLSearchParams({ page: String(p), pageSize: "20" });
      if (query.trim()) params.set("q", query.trim());
      fetch(`/api/admin/users?${params.toString()}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
        .then((d: UsersPage) => setState({ status: "ok", data: d }))
        .catch(() => setState({ status: "error" }));
    },
    [page, q],
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
      <div className="kicker">USERS &amp; CITIZENS</div>

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
          <h2 style={{ margin: 0, fontSize: 20 }}>Registered users</h2>
          <a
            className="btn btn-ghost"
            href="/api/admin/export/users"
            download
            data-testid="download-users-csv"
          >
            Download users CSV
          </a>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            load({ page: 1 });
          }}
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 12,
            alignItems: "end",
          }}
        >
          <Field id="users-search" label="Search (email or name)">
            <input
              id="users-search"
              style={inputStyle}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="citizen@…"
            />
          </Field>
          <button className="btn btn-ghost" type="submit">
            Search
          </button>
        </form>

        {state.status === "loading" && <Skeleton lines={5} />}
        {state.status === "error" && <CardError onRetry={() => load()} testid="users-error" />}
        {state.status === "ok" && (
          <div style={{ marginTop: 16 }}>
            <Ledger
              columns={[
                {
                  key: "email",
                  label: "Email",
                  render: (r: AdminUserRow) => (
                    <Link href={`/admin/users/${r.id}`} style={{ fontWeight: 600 }}>
                      {r.email ?? r.id}
                    </Link>
                  ),
                },
                { key: "name", label: "Name", render: (r: AdminUserRow) => r.name ?? "—" },
                { key: "role", label: "Role" },
                { key: "kycStatus", label: "KYC" },
                {
                  key: "suspended",
                  label: "Standing",
                  render: (r: AdminUserRow) =>
                    r.suspendedAt ? <TagLabel>SUSPENDED</TagLabel> : "active",
                },
                {
                  key: "sessionCount",
                  label: "Sessions",
                  align: "right",
                },
                {
                  key: "createdAt",
                  label: "Created",
                  render: (r: AdminUserRow) => new Date(r.createdAt).toISOString().slice(0, 10),
                },
              ]}
              rows={state.data.users}
              getRowKey={(r: AdminUserRow) => r.id}
              empty="No users match this search."
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
}
