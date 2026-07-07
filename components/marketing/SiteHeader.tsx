"use client";

import { useState } from "react";
import Link from "next/link";
import { Crest } from "@/components/brand/Crest";

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="site" data-screen-label="Navigation">
      <div className="wrap">
        <nav className="nav">
          <Link
            className="brand"
            href="/"
            style={{ gap: "12px", display: "flex", alignItems: "center" }}
          >
            <Crest tone="dark" height={34} />
            <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.12 }}>
              <b style={{ fontSize: "15px", letterSpacing: "0.02em" }}>CRYPTREPUBLIC</b>
              <span style={{ fontSize: "9.5px", letterSpacing: "0.16em", opacity: 0.65 }}>
                NETWORK STATE №001
              </span>
            </span>
          </Link>
          <div className="nav-links">
            <Link href="/#why">Why</Link>
            <Link href="/#how">How it works</Link>
            <Link href="/services">Services</Link>
            <Link href="/documents">Documents</Link>
            <Link href="/knowledge">Knowledge</Link>
          </div>
          <div className="nav-cta">
            <Link
              href="/auth"
              style={{
                textDecoration: "none",
                fontWeight: 700,
                fontSize: "14px",
                color: "var(--muted)",
              }}
            >
              Sign in
            </Link>
            <Link
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
            </Link>
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
        <Link href="/#why" onClick={closeMenu}>
          Why CryptRepublic
        </Link>
        <Link href="/#how" onClick={closeMenu}>
          How it works
        </Link>
        <Link href="/services" onClick={closeMenu}>
          Citizen services
        </Link>
        <Link href="/documents" onClick={closeMenu}>
          Documents
        </Link>
        <Link href="/knowledge" onClick={closeMenu}>
          Knowledge base
        </Link>
        <Link href="/brand" onClick={closeMenu}>
          Brand & commissary
        </Link>
        <Link href="/auth" style={{ color: "var(--blue)" }} onClick={closeMenu}>
          Sign in / Register
        </Link>
        <Link className="btn btn-primary" href="/dashboard" onClick={closeMenu}>
          Mint passport →
        </Link>
      </div>
    </header>
  );
}
