"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Embassy detail (§7.12) client island. Renders the directory info for a code
 * plus a LIVE per-city citizen count (self-declared, minted citizens only —
 * honestly low/0 on a fresh chain, never the mockup's fabricated cit/events). A
 * not-found state renders for an unknown code.
 */

interface Embassy {
  code: string;
  name: string;
  neighborhood: string;
  hours: string;
  foundedAt: string;
  brandColor: string;
  city: string;
  country: string;
}

type State =
  | { status: "loading" }
  | { status: "ok"; embassy: Embassy; liveCitizenCount: number }
  | { status: "notfound" }
  | { status: "error" };

export function EmbassyDetail({ code }: { code: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    fetch(`/api/embassies/${encodeURIComponent(code)}`)
      .then(async (r) => {
        if (r.status === 404) return { notfound: true as const };
        if (!r.ok) throw new Error("failed");
        return r.json();
      })
      .then((d: { notfound?: true; embassy?: Embassy; liveCitizenCount?: number }) => {
        if (!alive) return;
        if (d.notfound || !d.embassy) {
          setState({ status: "notfound" });
          return;
        }
        setState({
          status: "ok",
          embassy: d.embassy,
          liveCitizenCount: typeof d.liveCitizenCount === "number" ? d.liveCitizenCount : 0,
        });
      })
      .catch(() => alive && setState({ status: "error" }));
    return () => {
      alive = false;
    };
  }, [code]);

  return (
    <div className="wrap" style={{ padding: "32px 0" }}>
      <div className="kicker">
        <Link href="/dashboard/embassies" style={{ textDecoration: "none" }}>
          ← EMBASSIES
        </Link>
      </div>

      {state.status === "loading" && <Skeleton />}
      {state.status === "error" && (
        <p style={{ color: "var(--muted)", marginTop: 16 }}>Could not load this embassy.</p>
      )}
      {state.status === "notfound" && (
        <div data-testid="embassy-not-found" style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 28 }}>Embassy not found</h2>
          <p style={{ color: "var(--muted)", marginTop: 8 }}>
            No embassy with code “{code}” is in the directory.
          </p>
          <Link className="btn btn-primary" href="/dashboard/embassies" style={{ marginTop: 16 }}>
            Back to embassies
          </Link>
        </div>
      )}
      {state.status === "ok" && (
        <article className="pillar" style={{ padding: "28px 32px", marginTop: 16 }}>
          <div style={{ height: 8, background: state.embassy.brandColor, marginBottom: 20 }} />
          <h2 style={{ margin: 0, fontSize: 34 }}>{state.embassy.name}</h2>
          <div style={{ color: "var(--muted)", marginTop: 6 }}>
            {state.embassy.neighborhood} · {state.embassy.city}, {state.embassy.country}
          </div>

          <div
            style={{
              marginTop: 24,
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 14,
            }}
          >
            <Field label="CODE" value={state.embassy.code} />
            <Field label="FOUNDED" value={state.embassy.foundedAt} />
            <Field label="HOURS" value={state.embassy.hours} />
            <Field
              label="CITIZENS (SELF-DECLARED)"
              value={String(state.liveCitizenCount)}
              testid="live-citizen-count"
            />
          </div>
        </article>
      )}
    </div>
  );
}

function Field({ label, value, testid }: { label: string; value: string; testid?: string }) {
  return (
    <div
      data-testid={testid}
      style={{ padding: "12px 14px", background: "var(--paper)", border: "1px solid var(--line)" }}
    >
      <div
        style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.12em", fontWeight: 700 }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4, fontFamily: "var(--mono)" }}>
        {value}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          data-testid="skeleton-line"
          style={{ height: 14, background: "var(--paper)", border: "1px solid var(--line)" }}
        />
      ))}
    </div>
  );
}
