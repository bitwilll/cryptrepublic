"use client";
import { useCallback, useEffect, useState } from "react";
import { Skeleton, CardError, Field, inputStyle, type Load } from "./bits";

/**
 * Admin per-user referral + trust panel (Wave 12 C4). Reads
 * /api/admin/users/[id]/referrals (balance + trust breakdown + the user's
 * referrals with chain-derived becameCitizen) and offers two audited
 * mutations: allocate referral tokens (add-only) and set the trust adjustment
 * (absolute). Each POST refetches. Every mutation is guarded + audited
 * server-side; this UI is a thin driver.
 */
interface AdminReferralRow {
  referredEmail: string | null;
  whenTokenConsumed: boolean;
  becameCitizen: boolean;
}
interface AdminReferralPayload {
  user: { id: string; email: string | null; referralTokenBalance: number; trustAdjustment: number };
  trust: { finalScore: number; computed: number; adminAdjustment: number };
  referrals: AdminReferralRow[];
}

export function AdminReferralPanel({ userId }: { userId: string }) {
  const [state, setState] = useState<Load<AdminReferralPayload>>({ status: "loading" });
  const [delta, setDelta] = useState("5");
  const [adjustment, setAdjustment] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setState({ status: "loading" });
    fetch(`/api/admin/users/${userId}/referrals`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: AdminReferralPayload) => {
        setState({ status: "ok", data: d });
        setAdjustment(String(d.user.trustAdjustment));
      })
      .catch(() => setState({ status: "error" }));
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function post(url: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "The action failed.");
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="pillar" style={{ padding: "24px 28px" }} data-testid="admin-referral-panel">
      <h3 style={{ margin: 0, fontSize: 18 }}>Referrals &amp; trust</h3>

      {state.status === "loading" && <Skeleton lines={3} />}
      {state.status === "error" && <CardError onRetry={load} testid="admin-referral-error" />}
      {state.status === "ok" && (
        <>
          <div style={{ marginTop: 12, display: "flex", gap: 28, flexWrap: "wrap" }}>
            <Stat
              label="Trust score"
              value={state.data.trust.finalScore}
              testid="admin-trust-score"
            />
            <Stat
              label="Referral tokens"
              value={state.data.user.referralTokenBalance}
              testid="admin-token-balance"
            />
            <Stat
              label="Trust adjustment"
              value={state.data.user.trustAdjustment}
              testid="admin-trust-adjustment"
            />
          </div>

          {error && (
            <p
              role="alert"
              data-testid="admin-referral-action-error"
              style={{ color: "#8b3a3a", fontSize: 13, marginTop: 12 }}
            >
              {error}
            </p>
          )}

          <div style={{ marginTop: 16, display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div>
              <Field id="alloc-delta" label="Allocate tokens (+1..1000)">
                <input
                  id="alloc-delta"
                  data-testid="alloc-delta"
                  type="number"
                  min={1}
                  max={1000}
                  value={delta}
                  onChange={(e) => setDelta(e.target.value)}
                  style={{ ...inputStyle, maxWidth: 120 }}
                />
              </Field>
              <button
                className="btn btn-primary"
                type="button"
                data-testid="alloc-submit"
                disabled={busy}
                onClick={() =>
                  void post(`/api/admin/users/${userId}/referral-tokens`, { delta: Number(delta) })
                }
                style={{ marginTop: 8 }}
              >
                Allocate
              </button>
            </div>

            <div>
              <Field id="trust-adjust" label="Set trust adjustment (-100..100)">
                <input
                  id="trust-adjust"
                  data-testid="trust-adjust"
                  type="number"
                  min={-100}
                  max={100}
                  value={adjustment}
                  onChange={(e) => setAdjustment(e.target.value)}
                  style={{ ...inputStyle, maxWidth: 120 }}
                />
              </Field>
              <button
                className="btn"
                type="button"
                data-testid="trust-submit"
                disabled={busy}
                onClick={() =>
                  void post(`/api/admin/users/${userId}/trust`, { adjustment: Number(adjustment) })
                }
                style={{ marginTop: 8 }}
              >
                Set adjustment
              </button>
            </div>
          </div>

          <div style={{ marginTop: 18 }} data-testid="admin-referral-list">
            <div
              style={{
                fontSize: 12,
                color: "var(--muted)",
                fontWeight: 700,
                letterSpacing: "0.08em",
              }}
            >
              REFERRALS (became-citizen is chain-derived)
            </div>
            {state.data.referrals.length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 8 }}>
                This user has referred no one.
              </p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
                {state.data.referrals.map((r, i) => (
                  <li
                    key={i}
                    data-testid="admin-referral-row"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: "6px 0",
                      borderBottom: "1px solid var(--line)",
                      fontSize: 13,
                    }}
                  >
                    <span style={{ overflowWrap: "anywhere" }}>{r.referredEmail ?? "—"}</span>
                    <span
                      style={{
                        color: r.becameCitizen ? "var(--navy)" : "var(--muted)",
                        fontWeight: 700,
                      }}
                    >
                      {r.becameCitizen ? "✓ citizen" : "pending"}
                      {r.whenTokenConsumed ? " · token" : " · trust"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </article>
  );
}

function Stat({ label, value, testid }: { label: string; value: number; testid: string }) {
  return (
    <div>
      <div
        data-testid={testid}
        style={{ fontFamily: "var(--mono)", fontSize: 24, fontWeight: 800 }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </div>
  );
}
