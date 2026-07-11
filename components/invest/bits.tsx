"use client";
import styles from "./invest.module.css";

/**
 * Shared pieces for Projects & investment (Wave 16): the MANDATORY
 * non-custodial notice, status pills in the recalibrated palette
 * (gold-ink pending / --success live / --muted terminal / #8b3a3a declined),
 * skeletons, and the shared item type mirroring /api/invest/projects.
 */

export const NON_CUSTODIAL_NOTICE =
  "Pledges are recorded commitments — settlement is wallet-to-wallet; the Republic never holds funds.";

const PROJECT_PILLS: Record<string, { label: string; cls: string }> = {
  SUBMITTED: { label: "Submitted", cls: styles.statusPending },
  ACTIVE: { label: "Active", cls: styles.statusActive },
  DECLINED: { label: "Declined", cls: styles.statusError },
  CLOSED: { label: "Closed", cls: styles.statusMuted },
  WITHDRAWN: { label: "Withdrawn", cls: styles.statusMuted },
};
const PLEDGE_PILLS: Record<string, { label: string; cls: string }> = {
  PLEDGED: { label: "Pledged", cls: styles.statusActive },
  WITHDRAWN: { label: "Withdrawn", cls: styles.statusMuted },
};

export function ProjectStatusPill({ status }: { status: string }) {
  const pill = PROJECT_PILLS[status] ?? { label: status, cls: styles.statusMuted };
  return <span className={`${styles.status} ${pill.cls}`}>{pill.label}</span>;
}

export function PledgeStatusPill({ status }: { status: string }) {
  const pill = PLEDGE_PILLS[status] ?? { label: status, cls: styles.statusMuted };
  return <span className={`${styles.status} ${pill.cls}`}>{pill.label}</span>;
}

export function CommunityBackedBadge() {
  return <span className={styles.backedBadge}>Community-backed</span>;
}

export function Skeletons({ lines = 3 }: { lines?: number }) {
  return (
    <div
      className={styles.skeletons}
      data-testid="invest-skeleton"
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

/** Mirrors the item shape of GET /api/invest/projects. */
export interface ProjectItem {
  id: string;
  title: string;
  summary: string;
  category: string;
  goalCoin: string;
  treasuryAddress: string | null;
  status: string;
  createdAt: string;
  creatorDisplay: string;
  pledgedTotalCoin: string;
  pledgeCount: number;
  endorsementCount: number;
  communityBacked: boolean;
  myPledge: { amountCoin: string; note: string | null; status: string } | null;
  myEndorsement: boolean;
  mine: boolean;
}
