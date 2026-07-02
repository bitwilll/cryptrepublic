"use client";

/**
 * Small shared admin-screen primitives (Wave 9 C-group): the Wave-7 state
 * matrix's loading skeleton and per-card error + RETRY, plus the mono label
 * tag. Kept in one file so every admin island renders the identical states.
 */

export function Skeleton({ lines }: { lines: number }) {
  return (
    <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          data-testid="skeleton-line"
          style={{ height: 14, background: "var(--paper)", border: "1px solid var(--line)" }}
        />
      ))}
    </div>
  );
}

export function CardError({ onRetry, testid }: { onRetry: () => void; testid: string }) {
  return (
    <div data-testid={testid} style={{ marginTop: 14 }}>
      <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>Could not load this card.</p>
      <button className="btn btn-ghost" type="button" onClick={onRetry} style={{ marginTop: 8 }}>
        Retry
      </button>
    </div>
  );
}

/** The bordered mono tag used for honesty labels (SEEDED / CHAIN-DERIVED / …). */
export function TagLabel({ children, testid }: { children: React.ReactNode; testid?: string }) {
  return (
    <span
      data-testid={testid}
      style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.08em",
        padding: "2px 6px",
        border: "1px solid var(--line)",
        color: "var(--muted)",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export type Load<T> = { status: "loading" } | { status: "ok"; data: T } | { status: "error" };

/** Field wrapper: a mono uppercase label bound to its control via htmlFor. */
export function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label
        htmlFor={id}
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--muted)",
          fontFamily: "var(--mono)",
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

export const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid var(--line)",
  fontSize: 14,
  fontFamily: "inherit",
  background: "#fff",
  color: "var(--ink)",
  borderRadius: 0,
  width: "100%",
  boxSizing: "border-box",
};

/**
 * Visually-hidden (screen-reader-only) style — CSP-safe inline object (no
 * external stylesheet). Used by every chart's accessible data table (Wave 10 C2,
 * addendum #7) so a sighted user sees the SVG while assistive tech + axe read the
 * underlying values as a real <table>.
 */
export const srOnly: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};
