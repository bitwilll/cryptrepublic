"use client";
import Link from "next/link";

/**
 * Dashboard segment error boundary (Wave 8 A3). Renders INSIDE the shell
 * chrome slot (DashboardShell's <main> persists — so no nested <main> here)
 * with a per-segment RETRY via `reset()`. Never the raw `error.message`.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="wrap" style={{ padding: "48px 0" }}>
      <article
        className="pillar"
        style={{ maxWidth: 640, margin: "0 auto", padding: "32px 34px", textAlign: "center" }}
      >
        <div className="kicker">SYSTEM FAULT</div>
        <h2 style={{ fontSize: "clamp(22px, 3.4vw, 30px)", marginTop: 12 }}>
          THIS SCREEN FAILED TO LOAD
        </h2>
        <p style={{ color: "var(--muted)", marginTop: 14, fontSize: 14 }}>
          The rest of the Republic is unaffected. Retry this screen, or continue from the citizen
          home.
        </p>
        {error?.digest ? (
          <p
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              color: "var(--muted)",
              letterSpacing: "0.08em",
              marginTop: 10,
            }}
          >
            INCIDENT REF · {error.digest}
          </p>
        ) : null}
        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "center",
            marginTop: 24,
            flexWrap: "wrap",
          }}
        >
          <button type="button" className="btn btn-primary" onClick={() => reset()}>
            RETRY
          </button>
          <Link className="btn btn-ghost" href="/dashboard">
            CITIZEN HOME →
          </Link>
        </div>
      </article>
    </div>
  );
}
