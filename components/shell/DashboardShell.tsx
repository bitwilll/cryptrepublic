"use client";
import { useState } from "react";
import { SessionCitizenProvider } from "./SessionCitizenProvider";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { MobileNavDrawer } from "./MobileNavDrawer";
import styles from "./shell.module.css";

/**
 * The dashboard shell: a session/citizen context provider wrapping the two-pane
 * grid (Sidebar | main(Topbar + children)) plus the mobile drawer scrim. The
 * mockup's dev-only Tweaks UI is intentionally excluded. Wired into
 * `app/dashboard/layout.tsx` beneath the auth guard (the guard is kept).
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <SessionCitizenProvider>
      <div className={styles.app}>
        <MobileNavDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
        <Sidebar open={menuOpen} onNavigate={() => setMenuOpen(false)} />
        <main className={styles.main}>
          <Topbar onMenu={() => setMenuOpen(true)} />
          {children}
        </main>
      </div>
    </SessionCitizenProvider>
  );
}
