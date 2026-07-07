import type { Metadata } from "next";
import { TrustApp } from "@/components/trust/TrustApp";
import styles from "@/components/trust/trust.module.css";

export const metadata: Metadata = {
  title: "Trust Score — CryptRepublic",
  description:
    "Your hybrid trust score decomposed into its real factors — citizenship, tenure, referrals, votes, and dividend claims — read honestly from chain.",
};

/**
 * Trust score (Wave 15 — Identity). Server Component mounting the client
 * ledger; the dashboard layout provides session + shell chrome. The score is
 * the SAME computation the referral gate reads (lib/trust/score.ts) — this
 * page only decomposes it.
 */
export default function TrustPage() {
  return (
    <div className={`wrap ${styles.stack}`}>
      <div>
        <div className="kicker">CIVIC STANDING</div>
        <h1 style={{ marginTop: 10 }}>Trust score</h1>
        <p style={{ color: "var(--muted)", marginTop: 8, maxWidth: 560 }}>
          Participation raises it; verified disputes lower it. The ledger below decomposes your
          standing into the exact factors the Republic computes — nothing is hidden, nothing is
          invented.
        </p>
      </div>
      <TrustApp />
    </div>
  );
}
