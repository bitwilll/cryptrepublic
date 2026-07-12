"use client";
import { useCallback, useEffect, useState } from "react";
import { useCitizen } from "@/components/shell/SessionCitizenProvider";

/**
 * Citizen referral + trust surface (Wave 12 D2). Fetches /api/citizen/referrals
 * and renders a READ-ONLY trust score, the referral-token balance, and a
 * refer-someone form (gated on canCreateReferral AND on being a citizen — only
 * citizens refer). `full` also renders the "who I referred" list with
 * chain-derived became-citizen badges. The trust score is never citizenship.
 */

interface ReferralRow {
  referredEmail: string | null;
  whenTokenConsumed: boolean;
  createdAt: string;
  becameCitizen: boolean;
}
interface ReferralsPayload {
  trustScore: number;
  trustBreakdown: {
    computed: number;
    adminAdjustment: number;
    signals: Record<string, number | boolean>;
  };
  referralTokenBalance: number;
  canCreateReferral: boolean;
  createReason: string | null;
  referrals: ReferralRow[];
}
type Load<T> = { status: "loading" } | { status: "ok"; data: T } | { status: "error" };

export function ReferralCards({ full = false }: { full?: boolean }) {
  const { isCitizen } = useCitizen();
  const [state, setState] = useState<Load<ReferralsPayload>>({ status: "loading" });
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(() => {
    setState({ status: "loading" });
    fetch("/api/citizen/referrals", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: ReferralsPayload) => setState({ status: "ok", data: d }))
      .catch(() => setState({ status: "error" }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function refer(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const res = await fetch("/api/referrals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ referredEmail: email.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not create the referral.");
      setEmail("");
      setSuccess("Referral recorded.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the referral.");
    } finally {
      setBusy(false);
    }
  }

  if (state.status === "loading") {
    return (
      <article
        style={{ background: "var(--card)", border: "1px solid var(--line)", padding: "24px 28px" }}
        data-testid="referral-loading"
      >
        <Skeleton lines={3} />
      </article>
    );
  }
  if (state.status === "error") {
    return (
      <article
        style={{ background: "var(--card)", border: "1px solid var(--line)", padding: "24px 28px" }}
        data-testid="referral-error"
      >
        <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>Could not load referrals.</p>
        <button className="btn btn-ghost" type="button" onClick={load} style={{ marginTop: 8 }}>
          Retry
        </button>
      </article>
    );
  }

  const d = state.data;
  return (
    <>
      <article
        style={{ background: "var(--card)", border: "1px solid var(--line)", padding: "24px 28px" }}
        data-testid="referral-trust-card"
      >
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--muted)",
          }}
        >
          TRUST SCORE
        </div>
        <div
          data-testid="referral-trust-score"
          style={{
            fontFamily: "var(--mono, monospace)",
            fontSize: 34,
            fontWeight: 800,
            marginTop: 6,
          }}
        >
          {d.trustScore}
          <span style={{ fontSize: 16, color: "var(--muted)" }}> / 100</span>
        </div>
        <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>
          A trust score above 50 lets you refer citizens for free — otherwise a referral spends one
          referral token. Computed from your on-chain standing; read-only.
        </p>
      </article>

      <article
        style={{ background: "var(--card)", border: "1px solid var(--line)", padding: "24px 28px" }}
        data-testid="referral-tokens-card"
      >
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--muted)",
          }}
        >
          REFERRAL TOKENS
        </div>
        <div
          data-testid="referral-token-balance"
          style={{
            fontFamily: "var(--mono, monospace)",
            fontSize: 28,
            fontWeight: 800,
            marginTop: 6,
          }}
        >
          {d.referralTokenBalance}
        </div>
        {isCitizen ? (
          <form onSubmit={refer} data-testid="refer-form" style={{ marginTop: 12 }}>
            <label
              htmlFor="refer-email"
              style={{ display: "block", fontSize: 12, marginBottom: 6 }}
            >
              Refer a member by email
            </label>
            <input
              id="refer-email"
              type="email"
              data-testid="refer-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="member@example.com"
              style={{
                width: "100%",
                padding: 9,
                border: "1px solid var(--line)",
                borderRadius: 8,
                fontSize: 13,
              }}
            />
            {!d.canCreateReferral && d.createReason && (
              <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>{d.createReason}</p>
            )}
            {error && (
              <p role="alert" style={{ color: "#8b3a3a", fontSize: 12, marginTop: 6 }}>
                {error}
              </p>
            )}
            {success && (
              <p
                data-testid="refer-success"
                style={{ color: "var(--success)", fontSize: 12, marginTop: 6 }}
              >
                {success}
              </p>
            )}
            <button
              className="btn btn-primary"
              type="submit"
              data-testid="refer-submit"
              disabled={busy || !d.canCreateReferral || email.trim().length === 0}
              style={{ marginTop: 10 }}
            >
              {busy ? "Referring…" : "Refer"}
            </button>
          </form>
        ) : (
          <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 10 }}>
            Only citizens can refer new members.
          </p>
        )}
      </article>

      {full && (
        <article
          style={{
            background: "var(--card)",
            border: "1px solid var(--line)",
            padding: "24px 28px",
          }}
          data-testid="referral-list"
        >
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            WHO YOU REFERRED
          </div>
          {d.referrals.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 8 }}>
              You haven&apos;t referred anyone yet.
            </p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
              {d.referrals.map((r, i) => (
                <li
                  key={i}
                  data-testid="referral-row"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "8px 0",
                    borderBottom: "1px solid var(--line)",
                    fontSize: 13,
                  }}
                >
                  <span style={{ overflowWrap: "anywhere" }}>{r.referredEmail ?? "—"}</span>
                  <span
                    style={{
                      color: r.becameCitizen ? "var(--success)" : "var(--muted)",
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.becameCitizen ? "✓ citizen" : "pending"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>
      )}
    </>
  );
}

function Skeleton({ lines }: { lines: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          data-testid="skeleton-line"
          style={{ height: 14, background: "var(--paper)", border: "1px solid var(--line)" }}
        />
      ))}
    </div>
  );
}
