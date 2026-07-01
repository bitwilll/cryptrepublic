"use client";

import { useState } from "react";

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="site" data-screen-label="Navigation">
      <div className="wrap">
        <nav className="nav">
          <a
            className="brand"
            href="#top"
            style={{ width: "360px", gap: "16px", fontSize: "12px" }}
          >
            CR Crypt Republic NETWORK STATE №001
          </a>
          <div className="nav-links">
            <a href="#why">Why</a>
            <a href="#how">How it works</a>
            <a href="#holdings">Holdings</a>
            <a href="#governance">Governance</a>
            <a href="#embassies">Embassies</a>
          </div>
          <div className="nav-cta">
            <a
              href="/auth"
              style={{
                textDecoration: "none",
                fontWeight: 700,
                fontSize: "14px",
                color: "var(--muted)",
              }}
            >
              Sign in
            </a>
            <a
              className="btn btn-primary"
              href="/dashboard"
              style={{
                padding: "12px 20px",
                fontSize: "14px",
                gap: "9px",
                borderWidth: "0px 1px 1px 0px",
                flexDirection: "row",
                justifyContent: "center",
                margin: "4px",
              }}
            >
              Mint passport
            </a>
          </div>
          <button
            className="burger"
            id="burger"
            aria-label="Open menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              stroke="#0f1f33"
              strokeWidth="2"
              fill="none"
            >
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
        </nav>
      </div>
      <div className={`mobile-menu${menuOpen ? " open" : ""}`} id="mobileMenu">
        <a href="#why" onClick={closeMenu}>
          Why CryptRepublic
        </a>
        <a href="#how" onClick={closeMenu}>
          How it works
        </a>
        <a href="#holdings" onClick={closeMenu}>
          Sovereign holdings
        </a>
        <a href="#governance" onClick={closeMenu}>
          Governance
        </a>
        <a href="#embassies" onClick={closeMenu}>
          Embassies
        </a>
        <a href="/auth" style={{ color: "var(--blue)" }} onClick={closeMenu}>
          Sign in / Register
        </a>
        <a className="btn btn-primary" href="/dashboard" onClick={closeMenu}>
          Mint passport →
        </a>
      </div>
    </header>
  );
}
