"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useChainInfo } from "@/lib/hooks/useChainInfo";
import styles from "./shell.module.css";

/**
 * Dashboard topbar. Titles are keyed by pathname; the subtitle chrome is LIVE
 * (real chain name + block from `useChainInfo`), NOT the mockup's fabricated
 * "CHAIN ONLINE" / "block 21 408 932" / "QUORUM 73%". A "← Site" link returns
 * to the marketing home. The burger toggles the mobile drawer.
 */
const TITLES: Record<string, string> = {
  "/dashboard": "Citizen home",
  "/dashboard/governance": "Constitution & votes",
  "/dashboard/treasury": "Treasury",
  "/dashboard/population": "Population",
  "/dashboard/passport": "Your passport",
  "/dashboard/holdings": "Sovereign Holdings",
  "/dashboard/embassies": "Embassies",
  "/dashboard/wallet": "Wallet & chain",
  "/dashboard/mint": "Mint a passport",
  "/dashboard/trust": "Trust score",
  "/dashboard/certificates": "Certificates",
  "/dashboard/store": "Citizen store",
  "/dashboard/bitwill": "BitWill estate",
  "/dashboard/insurance": "Insurance",
  "/dashboard/invest": "Projects & investment",
  "/dashboard/community": "Citizens & messages",
  "/dashboard/referrals": "Referrals & trust",
  "/dashboard/witness": "Witness attestation",
};

function titleFor(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname];
  // longest matching prefix (for nested routes like /dashboard/embassies/[code])
  const match = Object.keys(TITLES)
    .filter((k) => k !== "/dashboard" && pathname.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return match ? TITLES[match] : "Citizen home";
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const chain = useChainInfo();
  const title = titleFor(pathname);

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
            {title}
          </h1>
          <div
            className={styles.hideSm}
            style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}
          >
            {chain.chainName}
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontSize: 12,
          color: "var(--muted)",
          fontFamily: "var(--mono)",
          letterSpacing: "0.06em",
        }}
      >
        {/* var(--blue) (6.3:1 on #fff), not var(--gold-d) (3.7:1 — fails WCAG AA
            4.5:1 at 12px): deliberate a11y contrast fix (Wave 8 A2 item 8);
            token DEFINITIONS untouched. */}
        <span
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-label={chain.online ? "Chain online" : "Chain offline"}
          style={{ color: "var(--blue)", display: "flex", alignItems: "center", gap: 6 }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: chain.online ? "#1f8a5b" : "#b04141",
              boxShadow: chain.online ? "0 0 8px #1f8a5b" : "none",
            }}
          />
          <span className={styles.hideSm}>{chain.online ? "CHAIN ONLINE" : "CHAIN OFFLINE"}</span>
        </span>
        <span className={styles.hideSm} data-testid="topbar-block">
          {chain.blockNumber !== null ? `BLK ${chain.blockNumber.toString()}` : "BLK —"}
        </span>
        <Link
          href="/"
          style={{
            color: "var(--ink)",
            textDecoration: "none",
            padding: "8px 14px",
            border: "1px solid var(--line)",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          ← Site
        </Link>
      </div>
    </header>
  );
}
