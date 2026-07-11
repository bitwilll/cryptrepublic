"use client";
import styles from "./community.module.css";

/**
 * Shared pieces for the community UI (Wave 17): kind/status pills in the
 * Republic's palette (FAMILY gold-ink, FRIEND blue), loading skeletons
 * (global .skeleton-line), the error box, shared payload types, and the
 * client-side Civic ID helpers (mirrors lib/identity/civicId.ts — the server
 * re-validates regardless; that module is server-only).
 */

export const HONESTY_LINE = "Messages are stored by the registry and are not end-to-end encrypted.";

export const CIVIC_ID_HINT = "Share it to be added as friend or family — it reveals nothing else.";

export const CIVIC_ID_INPUT_RE =
  /^CR-[23456789BCDFGHJKMNPQRSTVWXYZ]{4}-[23456789BCDFGHJKMNPQRSTVWXYZ]{4}$/;

/** Uppercase + unify dash-ish separators, mirroring the server's normalizer. */
export function normalizeCivicIdInput(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[\s–—_]+/g, "-")
    .replace(/-+/g, "-");
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function KindPill({ kind }: { kind: string }) {
  const family = kind === "FAMILY";
  return (
    <span className={`${styles.status} ${family ? styles.kindFamily : styles.kindFriend}`}>
      {family ? "Family" : "Friend"}
    </span>
  );
}

export function Skeletons({ lines = 3 }: { lines?: number }) {
  return (
    <div
      className={styles.skeletons}
      data-testid="community-skeleton"
      role="status"
      aria-label="Loading"
    >
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton-line" />
      ))}
    </div>
  );
}

export function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.errorBox} role="alert">
      {children}
    </div>
  );
}

/* ── Payload types (mirror the /api/community responses) ── */

export interface CitizenRef {
  civicId: string;
  display: string;
}

export interface IncomingRequest {
  connectionId: string;
  kind: string;
  greeting: string | null;
  requester: CitizenRef;
  createdAt: string;
}

export interface OutgoingRequest {
  connectionId: string;
  kind: string;
  civicId: string; // Civic ID ONLY — no display name until they accept
  createdAt: string;
}

export interface AcceptedConnection {
  connectionId: string;
  kind: string;
  peer: CitizenRef;
  since: string;
}

export interface ConnectionsPayload {
  incoming: IncomingRequest[];
  outgoing: OutgoingRequest[];
  accepted: AcceptedConnection[];
}

export interface ConversationMemberRef extends CitizenRef {
  mine: boolean;
}

export interface ConversationSummary {
  conversationId: string;
  kind: string;
  title: string;
  mineIsCreator: boolean;
  members: ConversationMemberRef[];
  lastMessage: { excerpt: string; at: string; mine: boolean } | null;
  unread: number;
  lastActivityAt: string;
}

export interface ThreadMessage {
  id: string;
  body: string;
  at: string;
  sender: { civicId: string; display: string; mine: boolean };
}
