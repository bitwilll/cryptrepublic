import Link from "next/link";

/**
 * 404 (Wave 8 A3, Server Component). In-voice: the address resolves to no
 * record in the Republic's registry. Links back to the marketing home and the
 * citizen dashboard. Design tokens only.
 */
export default function NotFound() {
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
        <div className="kicker">RECORD NOT FOUND · 404</div>
        <h1 style={{ fontSize: "clamp(28px, 5vw, 44px)", marginTop: 14 }}>
          THIS TERRITORY IS UNCHARTED
        </h1>
        <p style={{ color: "var(--muted)", marginTop: 16, fontSize: 15 }}>
          No record exists at this address. Check the citation, or return to charted territory.
        </p>
        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "center",
            marginTop: 26,
            flexWrap: "wrap",
          }}
        >
          <Link className="btn btn-primary" href="/">
            RETURN TO THE REPUBLIC →
          </Link>
          <Link className="btn btn-ghost" href="/dashboard">
            CITIZEN DASHBOARD →
          </Link>
        </div>
      </div>
    </main>
  );
}
