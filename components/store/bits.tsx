"use client";
import styles from "./store.module.css";

/**
 * Small shared pieces for the Citizen Store UI (Wave 15): status pills in the
 * Republic's status palette (--success live, --gold pending, --muted done,
 * #b04141 removed/error), loading skeletons (global .skeleton-line), and the
 * mandatory settlement notice — the Republic NEVER holds funds.
 */

export const SETTLEMENT_NOTICE =
  "Settlement is arranged citizen-to-citizen; the Republic never holds funds.";

const LISTING_PILLS: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "Active", cls: styles.statusActive },
  SOLD: { label: "Sold", cls: styles.statusMuted },
  WITHDRAWN: { label: "Withdrawn", cls: styles.statusMuted },
  REMOVED: { label: "Removed", cls: styles.statusError },
};
const INQUIRY_PILLS: Record<string, { label: string; cls: string }> = {
  OPEN: { label: "Awaiting reply", cls: styles.statusPending },
  ANSWERED: { label: "Answered", cls: styles.statusActive },
  CLOSED: { label: "Closed", cls: styles.statusMuted },
};

export function ListingStatusPill({ status }: { status: string }) {
  const pill = LISTING_PILLS[status] ?? { label: status, cls: styles.statusMuted };
  return <span className={`${styles.status} ${pill.cls}`}>{pill.label}</span>;
}

export function InquiryStatusPill({ status }: { status: string }) {
  const pill = INQUIRY_PILLS[status] ?? { label: status, cls: styles.statusMuted };
  return <span className={`${styles.status} ${pill.cls}`}>{pill.label}</span>;
}

export function Skeletons({ lines = 3 }: { lines?: number }) {
  return (
    <div
      className={styles.skeletons}
      data-testid="store-skeleton"
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

export interface ListingSummary {
  id: string;
  title: string;
  description: string;
  category: string;
  priceCoin: string;
  status: string;
  createdAt: string;
  sellerDisplay?: string;
  openInquiries?: number;
}
