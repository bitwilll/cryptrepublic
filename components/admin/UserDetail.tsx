"use client";
import { useCallback, useEffect, useState } from "react";
import { AdminReferralPanel } from "./AdminReferralPanel";
import Link from "next/link";
import { Ledger } from "@/components/ui/Ledger";
import { Modal } from "@/components/ui/Modal";
import { KYC_STATUSES } from "@/lib/auth/types";
import { Skeleton, CardError, Field, inputStyle, TagLabel, type Load } from "./bits";

/**
 * Per-user admin detail (Wave 9 C2): the allowlisted profile, suspend/
 * unsuspend (modal confirm; self-suspend disabled — mirrors the API's 400),
 * kycStatus select, session revocation (single + all), linked wallets, and the
 * application summary. There is NO role control ANYWHERE — the panel has no
 * promotion path (constraint #2); bootstrap is the audited CLI.
 */

interface SessionRow extends Record<string, unknown> {
  id: string;
  userAgent: string | null;
  ipHash: string | null;
  createdAt: string;
  expiresAt: string;
}

interface Detail {
  user: {
    id: string;
    email: string | null;
    name: string | null;
    role: string;
    kycStatus: string;
    suspendedAt: string | null;
    lockedUntil: string | null;
    failedLoginCount: number;
    createdAt: string;
    updatedAt: string;
  };
  sessions: SessionRow[];
  linkedWallets: { address: string; chain: string; verifiedAt: string | null }[];
  application: {
    id: string;
    status: string;
    kycStatus: string;
    chainCache: {
      chainDerived: true;
      sealTxHash: string | null;
      citizenTokenId: string | null;
      sealedAt: string | null;
    };
  } | null;
}

export function UserDetail({ userId, selfUserId }: { userId: string; selfUserId: string }) {
  const [state, setState] = useState<Load<Detail>>({ status: "loading" });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [kyc, setKyc] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => {
    setState({ status: "loading" });
    fetch(`/api/admin/users/${userId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: Detail) => {
        setState({ status: "ok", data: d });
        setKyc(d.user.kycStatus);
      })
      .catch(() => setState({ status: "error" }));
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function post(url: string, body: unknown): Promise<void> {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setActionError(data.error ?? "The action failed.");
        return;
      }
      load();
    } catch {
      setActionError("The action failed.");
    } finally {
      setBusy(false);
    }
  }

  if (state.status === "loading") {
    return (
      <Wrap>
        <article className="pillar" style={{ padding: "24px 28px" }}>
          <Skeleton lines={5} />
        </article>
      </Wrap>
    );
  }
  if (state.status === "error") {
    return (
      <Wrap>
        <article className="pillar" style={{ padding: "24px 28px" }}>
          <CardError onRetry={load} testid="user-detail-error" />
        </article>
      </Wrap>
    );
  }

  const { user, sessions, linkedWallets, application } = state.data;
  const suspended = user.suspendedAt !== null;
  const isSelf = user.id === selfUserId;

  return (
    <Wrap>
      <article className="pillar" style={{ padding: "24px 28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h3 style={{ margin: 0, fontSize: 20 }}>{user.email ?? user.id}</h3>
          {suspended && <TagLabel testid="suspended-tag">SUSPENDED</TagLabel>}
        </div>
        <dl
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "160px 1fr",
            gap: "8px 16px",
            fontSize: 13,
          }}
        >
          <Dt>Name</Dt>
          <Dd>{user.name ?? "—"}</Dd>
          <Dt>Role</Dt>
          <Dd>
            {user.role}
            <span style={{ color: "var(--muted)", marginLeft: 8, fontSize: 11 }}>
              (role changes happen ONLY via the audited operator CLI — this panel cannot promote)
            </span>
          </Dd>
          <Dt>KYC status</Dt>
          <Dd>{user.kycStatus}</Dd>
          <Dt>Failed logins</Dt>
          <Dd>{user.failedLoginCount}</Dd>
          <Dt>Created</Dt>
          <Dd>{new Date(user.createdAt).toISOString()}</Dd>
        </dl>

        {actionError && (
          <p data-testid="user-action-error" style={{ color: "#b04141", fontSize: 13 }}>
            {actionError}
          </p>
        )}

        <div style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "center" }}>
          <button
            className="btn btn-ghost"
            type="button"
            disabled={busy || isSelf}
            onClick={() => setConfirmOpen(true)}
          >
            {suspended ? "Unsuspend" : "Suspend"}
          </button>
          {isSelf && (
            <span style={{ color: "var(--muted)", fontSize: 12 }}>
              You cannot suspend your own account.
            </span>
          )}
        </div>

        <div
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 12,
            alignItems: "end",
            maxWidth: 420,
          }}
        >
          <Field id="user-kyc" label="KYC status">
            <select
              id="user-kyc"
              style={inputStyle}
              value={kyc}
              onChange={(e) => setKyc(e.target.value)}
            >
              {KYC_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <button
            className="btn btn-ghost"
            type="button"
            disabled={busy}
            onClick={() => void post(`/api/admin/users/${userId}/kyc`, { kycStatus: kyc })}
          >
            Apply KYC
          </button>
        </div>
      </article>

      <article className="pillar" style={{ padding: "24px 28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h3 style={{ margin: 0, fontSize: 20 }}>Sessions</h3>
          <button
            className="btn btn-ghost"
            type="button"
            disabled={busy || sessions.length === 0}
            onClick={() => void post(`/api/admin/users/${userId}/sessions/revoke`, { all: true })}
          >
            Revoke all
          </button>
        </div>
        <div style={{ marginTop: 12 }}>
          <Ledger
            columns={[
              {
                key: "userAgent",
                label: "User agent",
                render: (r: SessionRow) => r.userAgent ?? "—",
              },
              { key: "ipHash", label: "IP hash", render: (r: SessionRow) => r.ipHash ?? "—" },
              {
                key: "createdAt",
                label: "Created",
                render: (r: SessionRow) => new Date(r.createdAt).toISOString(),
              },
              {
                key: "expiresAt",
                label: "Expires",
                render: (r: SessionRow) => new Date(r.expiresAt).toISOString(),
              },
              {
                key: "revoke",
                label: "",
                align: "right",
                render: (r: SessionRow) => (
                  <button
                    className="btn btn-ghost"
                    type="button"
                    disabled={busy}
                    style={{ padding: "6px 14px", fontSize: 12 }}
                    onClick={() =>
                      void post(`/api/admin/users/${userId}/sessions/revoke`, { sessionId: r.id })
                    }
                  >
                    Revoke
                  </button>
                ),
              },
            ]}
            rows={sessions}
            getRowKey={(r: SessionRow) => r.id}
            empty="No live sessions."
          />
        </div>
      </article>

      <article className="pillar" style={{ padding: "24px 28px" }}>
        <h3 style={{ margin: 0, fontSize: 20 }}>Linked wallets</h3>
        {linkedWallets.length === 0 ? (
          <p style={{ color: "var(--muted)", marginTop: 12, fontSize: 13 }}>No linked wallets.</p>
        ) : (
          <ul style={{ marginTop: 12, paddingLeft: 18, fontSize: 13 }}>
            {linkedWallets.map((w) => (
              <li key={w.address} style={{ fontFamily: "var(--mono)" }}>
                {w.address} · {w.chain}
                {w.verifiedAt ? " · verified" : ""}
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="pillar" style={{ padding: "24px 28px" }}>
        <h3 style={{ margin: 0, fontSize: 20 }}>Citizenship application</h3>
        {application === null ? (
          <p style={{ color: "var(--muted)", marginTop: 12, fontSize: 13 }}>No application.</p>
        ) : (
          <div style={{ marginTop: 12, fontSize: 13 }}>
            <p style={{ margin: 0 }}>
              Status <b>{application.status}</b> · KYC <b>{application.kycStatus}</b>
            </p>
            <p style={{ margin: "8px 0 0", fontFamily: "var(--mono)", fontSize: 12 }}>
              seal tx {application.chainCache.sealTxHash ?? "—"} · token{" "}
              {application.chainCache.citizenTokenId ?? "—"}{" "}
              <TagLabel testid="chain-derived-tag">CHAIN-DERIVED · NOT AUTHORITATIVE</TagLabel>
            </p>
            <p style={{ marginTop: 10 }}>
              <Link href={`/admin/applications/${application.id}`}>Open the full review →</Link>
            </p>
          </div>
        )}
      </article>

      <AdminReferralPanel userId={userId} />

      {confirmOpen && (
        <Modal
          title={suspended ? "Unsuspend this user?" : "Suspend this user?"}
          onClose={() => setConfirmOpen(false)}
        >
          <p style={{ fontSize: 14, marginTop: 0 }}>
            {suspended
              ? "The user will be able to sign in again. This action is audit-logged."
              : "Suspension revokes all sessions immediately and blocks every sign-in path (password and wallet) until unsuspended. This action is audit-logged."}
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy}
              onClick={async () => {
                await post(`/api/admin/users/${userId}/suspend`, { suspended: !suspended });
                setConfirmOpen(false);
              }}
            >
              {suspended ? "Confirm unsuspension" : "Confirm suspension"}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setConfirmOpen(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="wrap"
      style={{ padding: "32px 0", display: "flex", flexDirection: "column", gap: 24 }}
    >
      <div className="kicker">USER DETAIL</div>
      {children}
    </div>
  );
}

function Dt({ children }: { children: React.ReactNode }) {
  return (
    <dt
      style={{
        margin: 0,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "var(--muted)",
        fontFamily: "var(--mono)",
      }}
    >
      {children}
    </dt>
  );
}

function Dd({ children }: { children: React.ReactNode }) {
  return <dd style={{ margin: 0 }}>{children}</dd>;
}
