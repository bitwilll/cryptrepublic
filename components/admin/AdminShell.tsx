"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Crest } from "@/components/brand/Crest";
import { NavIcon } from "@/components/shell/NavIcon";
import { MobileNavDrawer } from "@/components/shell/MobileNavDrawer";
import { ADMIN_NAV_ITEMS, isAdminActive } from "./adminNavItems";
import styles from "@/components/shell/shell.module.css";

/**
 * The admin back-office shell (Wave 9 C1).
 *
 * SHELL DECISION (recorded): a thin AdminShell, NOT DashboardShell.
 * DashboardShell hardwires SessionCitizenProvider (wallet/passport chain
 * polling), the citizen card, the MINT CTA, and the citizen nav badges
 * (proposals/dividend — extra API traffic) — all wrong affordances for a back
 * office. AdminShell reuses shell.module.css's grid + drawer, NavIcon, Seal,
 * and the Topbar structure with: ADMIN_NAV_ITEMS, a prominent ADMIN badge, and
 * a "← Back to dashboard" link. NO citizen context is mounted and no chain
 * polling runs in the chrome.
 */
export function AdminShell({
  adminEmail,
  children,
}: {
  adminEmail: string | null;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className={styles.app}>
      <MobileNavDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
      <AdminSidebar open={menuOpen} adminEmail={adminEmail} onNavigate={() => setMenuOpen(false)} />
      <main className={styles.main}>
        <AdminTopbar onMenu={() => setMenuOpen(true)} />
        {children}
      </main>
    </div>
  );
}

function AdminSidebar({
  open,
  adminEmail,
  onNavigate,
}: {
  open: boolean;
  adminEmail: string | null;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <aside className={styles.sidebar + (open ? " " + styles.open : "")}>
      <div style={{ padding: "0 8px 14px", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <Crest tone="light" height={30} />
          <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.01em", color: "#fff" }}>
            CryptRepublic
          </div>
        </div>
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
          <span
            data-testid="admin-badge"
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.14em",
              background: "var(--gold)",
              color: "var(--navy)",
              padding: "3px 8px",
            }}
          >
            ADMIN
          </span>
          <span
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.55)",
              fontWeight: 600,
              letterSpacing: "0.04em",
            }}
          >
            BACK OFFICE
          </span>
        </div>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {ADMIN_NAV_ITEMS.map((it) => {
          const active = isAdminActive(pathname, it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "11px 12px",
                paddingLeft: active ? 10 : 12,
                background: active ? "rgba(255,255,255,0.08)" : "transparent",
                color: "#fff",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 600,
                borderLeft: active ? "2px solid var(--gold)" : "2px solid transparent",
              }}
            >
              <NavIcon kind={it.icon} color={active ? "var(--gold)" : "#fff"} />
              <span style={{ flex: 1 }}>{it.label}</span>
            </Link>
          );
        })}
      </nav>

      <div
        style={{
          marginTop: "auto",
          borderTop: "1px solid rgba(255,255,255,0.10)",
          paddingTop: 14,
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.55)",
            fontWeight: 700,
            letterSpacing: "0.12em",
          }}
        >
          SIGNED IN AS
        </div>
        <div
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.8)",
            fontFamily: "var(--mono)",
            marginTop: 4,
            overflowWrap: "anywhere",
          }}
        >
          {adminEmail ?? "administrator"}
        </div>
      </div>
    </aside>
  );
}

const TITLES: Record<string, string> = {
  "/admin": "Admin overview",
  "/admin/users": "Users",
  "/admin/applications": "Applications",
  "/admin/content": "Content",
  "/admin/flags": "Feature flags",
  "/admin/chain": "Chain actions",
  "/admin/services": "Services desk",
  "/admin/audit": "Audit log",
};

function titleFor(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname];
  const match = Object.keys(TITLES)
    .filter((k) => k !== "/admin" && pathname.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return match ? TITLES[match] : "Admin overview";
}

function AdminTopbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  return (
    <header
      className={styles.topbar}
      style={{
        borderBottom: "1px solid var(--line)",
        background: "#fff",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        position: "sticky",
        top: 0,
        zIndex: 40,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
        <button
          className={styles.burger}
          onClick={onMenu}
          aria-label="Open navigation"
          type="button"
          style={{
            background: "transparent",
            border: "1px solid var(--line)",
            padding: 8,
            cursor: "pointer",
            color: "var(--ink)",
            flexShrink: 0,
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
          >
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>
        <div style={{ minWidth: 0 }}>
          <h1
            style={{
              margin: 0,
              fontSize: "clamp(19px, 5vw, 26px)",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: "var(--ink)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {titleFor(pathname)}
          </h1>
          <div
            className={styles.hideSm}
            style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}
          >
            Administration — every mutation is audit-logged
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Link
          href="/dashboard"
          style={{
            color: "var(--ink)",
            textDecoration: "none",
            padding: "8px 14px",
            border: "1px solid var(--line)",
            fontSize: 12,
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          ← Back to dashboard
        </Link>
      </div>
    </header>
  );
}
