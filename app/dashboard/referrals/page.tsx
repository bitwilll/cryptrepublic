import type { Metadata } from "next";
import { ReferralCards } from "@/components/home/ReferralCards";
import { ReferralLinksCard } from "@/components/referrals/ReferralLinksCard";

export const metadata: Metadata = {
  title: "Referrals & Trust — CryptRepublic",
  description:
    "Your hybrid trust score, referral-token balance, and the members you have referred — read honestly from chain.",
};

/**
 * Referrals & trust (Wave 12). Server Component mounting the client island; the
 * dashboard layout already provides the session/citizen context + shell chrome.
 */
export default function ReferralsPage() {
  return (
    <div
      className="wrap"
      style={{
        padding: "32px 0",
        display: "flex",
        flexDirection: "column",
        gap: 20,
        maxWidth: 720,
      }}
    >
      <div>
        <div className="kicker">SOCIAL STANDING</div>
        <h2 style={{ fontSize: 32, marginTop: 10 }}>Referrals &amp; trust</h2>
        <p style={{ color: "var(--muted)", marginTop: 8, maxWidth: 560 }}>
          You can only witness (attest) for citizens you referred, and every new citizen needs
          enough distinct referrers to seal their passport. Refer members below.
        </p>
      </div>
      <ReferralCards full />
      <ReferralLinksCard />
    </div>
  );
}
