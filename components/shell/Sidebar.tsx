"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Crest } from "@/components/brand/Crest";
import { NavIcon } from "./NavIcon";
import { NAV_ITEMS, isActive } from "./navItems";
import { useCitizen } from "./SessionCitizenProvider";
import styles from "./shell.module.css";

/**
 * Dashboard sidebar. Ports the mockup Sidebar (Dashboard.html) to real App
 * Router routes (next/link, not the `goto(id)` state machine). Nav badges are
 * LIVE, never hardcoded: the governance badge = open-proposal count (0 on a
 * fresh chain — no hardcoded 14); the holdings `$` badge shows only when the
 * citizen has an unclaimed dividend. The bottom Citizen card reads
 * `useCitizen()` and shows an APPLICANT state when the wallet holds no passport.
 */
export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { isCitizen, tokenId } = useCitizen();
  const [openProposals, setOpenProposals] = useState<number>(0);
  const [hasDividend, setHasDividend] = useState<boolean>(false);

  // LIVE governance badge — open proposals (0 on a fresh chain).
  useEffect(() => {
    let alive = true;
    fetch("/api/governance/proposals?status=open")
      .then((r) => (r.ok ? r.json() : { proposals: [] }))
      .then((d: { proposals?: unknown[] }) => {
        if (alive) setOpenProposals(Array.isArray(d.proposals) ? d.proposals.length : 0);
      })
      .catch(() => {
        if (alive) setOpenProposals(0);
      });
    return () => {
      alive = false;
    };
  }, []);

  // LIVE dividend badge — only when the citizen has an unclaimed dividend obligation.
  useEffect(() => {
    if (!isCitizen) {
      setHasDividend(false);
      return;
    }
    let alive = true;
    fetch("/api/citizen/obligations")
      .then((r) => (r.ok ? r.json() : { obligations: [] }))
      .then((d: { obligations?: { kind?: string }[] }) => {
        if (!alive) return;
        setHasDividend(
          Array.isArray(d.obligations) &&
            d.obligations.some((o) => o.kind === "dividend" || o.kind === "claim"),
        );
      })
      .catch(() => {
        if (alive) setHasDividend(false);
      });
    return () => {
      alive = false;
    };
  }, [isCitizen, tokenId]);

  const badgeFor = (badge?: "proposals" | "dividend"): string | null => {
    if (badge === "proposals") return openProposals > 0 ? String(openProposals) : null;
    if (badge === "dividend") return hasDividend ? "$" : null;
    return null;
  };

  return (
    <aside className={styles.sidebar + (open ? " " + styles.open : "")}>
      <div style={{ padding: "0 8px 14px", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <Crest tone="light" height={30} />
          <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.01em", color: "#fff" }}>
            CryptRepublic
          </div>
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: "rgba(255,255,255,0.55)",
            fontWeight: 600,
            letterSpacing: "0.04em",
          }}
        >
          NETWORK STATE №001
        </div>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV_ITEMS.map((it) => {
          const active = isActive(pathname, it.href);
          const badge = badgeFor(it.badge);
          return (
            <Link
              key={it.href}
              href={it.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "11px 12px",
                paddingLeft: active ? 10 : 12,
                background: active ? "rgba(255,255,255,0.14)" : "transparent",
                color: "#fff",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 600,
                borderLeft: active ? "2px solid var(--gold)" : "2px solid transparent",
              }}
            >
              <NavIcon kind={it.icon} color={active ? "var(--gold)" : "#fff"} />
              <span style={{ flex: 1 }}>{it.label}</span>
              {badge && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    background: "var(--gold)",
                    color: "var(--navy)",
                    padding: "2px 7px",
                    letterSpacing: "0.04em",
                  }}
                >
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div style={{ borderTop: "1px solid rgba(255,255,255,0.10)", paddingTop: 14, marginTop: 8 }}>
        <Link
          href="/dashboard/mint"
          onClick={onNavigate}
          style={{
            width: "100%",
            padding: "11px 12px",
            background: "rgba(255,255,255,0.08)",
            color: "#fff",
            textDecoration: "none",
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: "0.04em",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <NavIcon kind="mint" color="var(--gold)" />
          MINT A PASSPORT
        </Link>
      </div>

      <CitizenCard isCitizen={isCitizen} tokenId={tokenId} />
    </aside>
  );
}

/**
 * Bottom Citizen card. Name/city are NOT on-chain (the passport stores hashed
 * fields), so we show the honest resolved standing: the citizen № (tokenId) when
 * a passport is held, or an APPLICANT state otherwise. No fabricated "A. Nakadai
 * · Lisbon".
 */
function CitizenCard({ isCitizen, tokenId }: { isCitizen: boolean; tokenId: bigint | null }) {
  return (
    <div
      data-testid="citizen-card"
      style={{
        marginTop: "auto",
        padding: 14,
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.10)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "rgba(255,255,255,0.55)",
          fontWeight: 700,
          letterSpacing: "0.12em",
        }}
      >
        CITIZEN
      </div>
      {isCitizen && tokenId !== null ? (
        <>
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>Citizen</div>
          <div
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.55)",
              marginTop: 2,
              fontFamily: "var(--mono)",
            }}
          >
            №{tokenId.toString()}
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>Applicant</div>
          <div
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.55)",
              marginTop: 2,
              fontFamily: "var(--mono)",
            }}
          >
            No passport yet
          </div>
        </>
      )}
      <Link
        href="/auth"
        style={{
          display: "block",
          marginTop: 10,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.14em",
          color: "rgba(255,255,255,0.55)",
          textDecoration: "none",
          fontFamily: "var(--mono)",
        }}
      >
        SIGN OUT →
      </Link>
    </div>
  );
}
