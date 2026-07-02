"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Ledger } from "@/components/ui/Ledger";
import { Skeleton, CardError, type Load } from "./bits";
import { BarChart } from "./charts/BarChart";
import { CountTile } from "./charts/CountTile";
import { ActivitySeries } from "./charts/ActivitySeries";

/** A stat pillar that NAVIGATES to its admin section (C1). A real keyboard-
 *  focusable <Link> (native <a>), aria-labelled — never an onClick div. */
const tileLinkStyle: React.CSSProperties = {
  padding: "24px 28px",
  color: "inherit",
  textDecoration: "none",
  display: "block",
};
function TileLink({
  href,
  label,
  testid,
  children,
}: {
  href: string;
  label: string;
  testid: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      data-testid={testid}
      className="pillar"
      style={tileLinkStyle}
    >
      {children}
    </Link>
  );
}

/**
 * Admin overview island (Wave 9 C1): stat tiles from /api/admin/overview
 * (users / suspended / admins / applications-by-status / content counts /
 * flags) + a "Recent administrative actions" ledger of the last 10 audit rows.
 * Read-only; the full filterable trail lives at /admin/audit.
 */

interface AuditRow extends Record<string, unknown> {
  id: string;
  actorLabel: string;
  action: string;
  targetType: string;
  targetId: string;
  createdAt: string;
}

interface Overview {
  users: { total: number; suspended: number; admins: number };
  applications: Record<string, number>;
  content: Record<string, number>;
  flags: number;
  recentAudit: AuditRow[];
}

/** /api/admin/stats payload (Wave 10 C2) — see the route's honesty contract. */
interface Stats {
  applicationsByStatus: { status: string; count: number }[];
  counts: { users: number; citizens: number | null; embassies: number };
  chainAvailable: boolean;
  auditActivity: { day: string; count: number }[];
  censusByCity: { code: string; name: string; count: number }[];
  censusSource: "live" | "seeded";
}

const CONTENT_LABELS: Record<string, string> = {
  assets: "Assets",
  embassies: "Embassies",
  census: "Census cities",
  allocations: "Allocations",
  constitution: "Constitution",
  proposalContent: "Proposal texts",
  comments: "Comments",
};

export function AdminOverviewApp() {
  const [state, setState] = useState<Load<Overview>>({ status: "loading" });
  const [stats, setStats] = useState<Load<Stats>>({ status: "loading" });

  const load = useCallback(() => {
    setState({ status: "loading" });
    fetch("/api/admin/overview")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: Overview) => setState({ status: "ok", data: d }))
      .catch(() => setState({ status: "error" }));
  }, []);

  const loadStats = useCallback(() => {
    setStats({ status: "loading" });
    fetch("/api/admin/stats")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: Stats) => setStats({ status: "ok", data: d }))
      .catch(() => setStats({ status: "error" }));
  }, []);

  useEffect(() => {
    load();
    loadStats();
  }, [load, loadStats]);

  return (
    <div
      className="wrap"
      style={{ padding: "32px 0", display: "flex", flexDirection: "column", gap: 24 }}
    >
      <div className="kicker">ADMINISTRATION</div>

      {state.status === "loading" && (
        <article className="pillar" style={{ padding: "24px 28px" }}>
          <Skeleton lines={4} />
        </article>
      )}
      {state.status === "error" && (
        <article className="pillar" style={{ padding: "24px 28px" }}>
          <CardError onRetry={load} testid="overview-error" />
        </article>
      )}
      {state.status === "ok" && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 20,
              alignItems: "start",
            }}
          >
            <TileLink href="/admin/users" label="View all users" testid="overview-users">
              <h3 style={{ margin: 0, fontSize: 20 }}>Users</h3>
              <div style={{ marginTop: 14, display: "flex", gap: 28, flexWrap: "wrap" }}>
                <Tile value={state.data.users.total} label="Total" />
                <Tile value={state.data.users.suspended} label="Suspended" />
                <Tile value={state.data.users.admins} label="Admins" />
              </div>
            </TileLink>
            <TileLink
              href="/admin/applications"
              label="Review citizenship applications"
              testid="overview-applications"
            >
              <h3 style={{ margin: 0, fontSize: 20 }}>Applications</h3>
              <div style={{ marginTop: 14, display: "flex", gap: 24, flexWrap: "wrap" }}>
                {Object.entries(state.data.applications).map(([status, count]) => (
                  <Tile key={status} value={count} label={status} />
                ))}
              </div>
            </TileLink>
            <TileLink href="/admin/content" label="Manage content" testid="overview-content">
              <h3 style={{ margin: 0, fontSize: 20 }}>Content</h3>
              <div style={{ marginTop: 14, display: "flex", gap: 24, flexWrap: "wrap" }}>
                {Object.entries(state.data.content).map(([key, count]) => (
                  <Tile key={key} value={count} label={CONTENT_LABELS[key] ?? key} />
                ))}
              </div>
            </TileLink>
            <TileLink href="/admin/flags" label="Manage feature flags" testid="overview-flags">
              <h3 style={{ margin: 0, fontSize: 20 }}>Feature flags</h3>
              <div style={{ marginTop: 14 }}>
                <Tile
                  value={state.data.flags}
                  label="Flag rows (missing rows use declared defaults)"
                />
              </div>
            </TileLink>
          </div>

          <article
            className="pillar"
            style={{ padding: "24px 28px" }}
            data-testid="overview-glance-card"
          >
            <h3 style={{ margin: 0, fontSize: 20 }}>Republic at a glance</h3>
            <p style={{ color: "var(--muted)", marginTop: 4, fontSize: 12 }}>
              Database counts are live; the citizens count is chain-derived (shown as — when the
              chain is unavailable); census geography is a seeded demonstration, not live data.
            </p>
            {stats.status === "loading" && <Skeleton lines={4} />}
            {stats.status === "error" && <CardError onRetry={loadStats} testid="stats-error" />}
            {stats.status === "ok" && (
              <div data-testid="overview-glance">
                <div style={{ marginTop: 14, display: "flex", gap: 28, flexWrap: "wrap" }}>
                  <CountTile label="Users" value={stats.data.counts.users} testid="glance-users" />
                  <CountTile
                    label="Citizens (chain)"
                    value={stats.data.counts.citizens}
                    testid="glance-citizens"
                  />
                  <CountTile
                    label="Embassies"
                    value={stats.data.counts.embassies}
                    testid="glance-embassies"
                  />
                </div>
                <div
                  style={{
                    marginTop: 20,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 28,
                    alignItems: "start",
                  }}
                >
                  <BarChart
                    data={stats.data.applicationsByStatus.map((r) => ({
                      label: r.status,
                      value: r.count,
                    }))}
                    title="Applications by status"
                    testid="apps-chart"
                  />
                  <ActivitySeries
                    data={stats.data.auditActivity.map((b) => ({
                      label: b.day,
                      value: b.count,
                    }))}
                    title="Admin audit activity (last 14 days)"
                    testid="audit-chart"
                  />
                  <ActivitySeries
                    data={stats.data.censusByCity.map((c) => ({
                      label: c.code,
                      value: c.count,
                    }))}
                    title={
                      stats.data.censusSource === "seeded"
                        ? "Census by city (SEEDED — demonstrative, not live census)"
                        : "Census by city (live)"
                    }
                    testid="census-chart"
                  />
                </div>
              </div>
            )}
          </article>

          <article className="pillar" style={{ padding: "24px 28px" }}>
            <h3 style={{ margin: 0, fontSize: 20 }}>Recent administrative actions</h3>
            <p style={{ color: "var(--muted)", marginTop: 4, fontSize: 12 }}>
              The last 10 audit rows. Every admin mutation writes its row in the same database
              transaction.
            </p>
            <div style={{ marginTop: 12 }}>
              <Ledger
                columns={[
                  {
                    key: "createdAt",
                    label: "When",
                    render: (r: AuditRow) => new Date(r.createdAt).toISOString(),
                  },
                  { key: "actorLabel", label: "Actor" },
                  { key: "action", label: "Action" },
                  {
                    key: "target",
                    label: "Target",
                    render: (r: AuditRow) => `${r.targetType} ${r.targetId}`,
                  },
                ]}
                rows={state.data.recentAudit}
                getRowKey={(r: AuditRow) => r.id}
                empty="No administrative actions recorded yet."
              />
            </div>
          </article>
        </>
      )}
    </div>
  );
}

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 28, fontWeight: 800 }}>{value}</div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </div>
  );
}
