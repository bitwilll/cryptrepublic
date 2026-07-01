"use client";
import { useEffect, useRef } from "react";

/**
 * Modal wrapper (backdrop + title + Close + Escape-to-close + a light focus
 * trap), extracted from UnlockWalletModal's chrome. Reused by cast-vote (B2),
 * claim (B4), and propose-embassy (B6).
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    // move focus into the dialog for keyboard users
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

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
        aria-label={title}
        tabIndex={-1}
        style={{
          background: "#fff",
          border: "1px solid var(--line)",
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
          <h2 style={{ margin: 0, fontSize: 20 }}>{title}</h2>
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
