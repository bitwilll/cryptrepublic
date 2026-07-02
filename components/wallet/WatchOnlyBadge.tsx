"use client";

/**
 * The shared WATCH-ONLY honesty badge (Wave 11 C1) — shown near the hero, in
 * setup, and on the air-gapped send modal so the read-only nature is never
 * ambiguous: this device holds NO keys.
 */
export function WatchOnlyBadge() {
  return (
    <span
      role="status"
      data-testid="watchonly-badge"
      style={{
        display: "inline-block",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        padding: "4px 10px",
        border: "1px solid var(--gold)",
        color: "var(--gold)",
      }}
    >
      WATCH-ONLY — read-only; this device holds no keys
    </span>
  );
}
