"use client";
import styles from "./shell.module.css";

/**
 * The dismiss backdrop for the mobile nav drawer. The drawer itself is the
 * `Sidebar` (which slides in via `.open` at ≤1024px per shell.module.css). This
 * component only renders the click-to-close scrim when the drawer is open.
 */
export function MobileNavDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      className={styles.backdrop}
      data-testid="nav-backdrop"
      onClick={onClose}
      aria-hidden="true"
    />
  );
}
