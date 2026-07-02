"use client";
import Link from "next/link";

/**
 * Global error boundary (Wave 8 A3). In-voice, honest and generic — NEVER the
 * raw `error.message` (internals must not leak to the citizen; the optional
 * digest is a safe opaque reference). RETRY re-renders the segment via
 * `reset()`; the link returns to the marketing home. Design tokens only.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      style={{
        minHeight: "70vh",
        display: "grid",
        placeItems: "center",
        padding: "64px 18px",
        background: "var(--paper)",
      }}
    >
      <div style={{ maxWidth: 560, textAlign: "center" }}>
        <div className="kicker">SYSTEM FAULT</div>
        <h1 style={{ fontSize: "clamp(28px, 5vw, 44px)", marginTop: 14 }}>
          THE REPUBLIC ENCOUNTERED AN ERROR
        </h1>
        <p style={{ color: "var(--muted)", marginTop: 16, fontSize: 15 }}>
          The fault has been contained to this screen and no records were altered. Retry the
          operation, or return to the Republic.
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
            marginTop: 26,
            flexWrap: "wrap",
          }}
        >
          <button type="button" className="btn btn-primary" onClick={() => reset()}>
            RETRY
          </button>
          <Link className="btn btn-ghost" href="/">
            RETURN TO THE REPUBLIC →
          </Link>
        </div>
      </div>
    </main>
  );
}
