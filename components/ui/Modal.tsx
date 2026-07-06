"use client";
import { useEffect, useId, useRef } from "react";

/**
 * Modal wrapper (backdrop + title + Close + Escape-to-close + a light focus
 * trap with focus restore), extracted from UnlockWalletModal's chrome. Reused
 * by cast-vote (B2), claim (B4), and propose-embassy (B6).
 */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Focus capture/restore lives in a SEPARATE mount-only effect (Wave 8 A2).
  // TRAP: the production caller (EmbassiesApp) passes a fresh inline onClose
  // closure on every 12s useChainInfo poll tick — keying this on [onClose]
  // would re-run capture/restore each tick and steal focus from a user typing
  // inside the dialog.
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    // move focus into the dialog for keyboard users
    dialog?.focus();
    return () => {
      // Restore only if focus is still inside the dialog, or fell back to
      // <body> because the dialog was removed — never yank focus the user has
      // deliberately moved elsewhere.
      const active = document.activeElement;
      if (active === document.body || (dialog && dialog.contains(active))) {
        trigger?.focus?.();
      }
    };
  }, []);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,31,51,0.6)",
        display: "grid",
        placeItems: "center",
        zIndex: 50,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{
          background: "#fff",
          border: "1px solid var(--line)",
          boxShadow: "0 24px 48px -18px rgba(10, 37, 64, 0.35)",
          padding: 24,
          width: "min(460px, 92vw)",
          maxHeight: "90vh",
          overflow: "auto",
          outline: "none",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <h2 id={titleId} style={{ margin: 0, fontSize: 20 }}>
            {title}
          </h2>
          <button
            className="btn"
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{ padding: "4px 10px" }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
