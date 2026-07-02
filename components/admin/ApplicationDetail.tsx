"use client";
import { useCallback, useEffect, useState } from "react";
import { Ledger } from "@/components/ui/Ledger";
import { KYC_STATUSES } from "@/lib/auth/types";
import { Skeleton, CardError, Field, inputStyle, TagLabel, type Load } from "./bits";

/**
 * Application review detail (Wave 9 C2). OFF-CHAIN-HONEST (constraint #6):
 * the review form posts { kycStatus?, reviewNote? } ONLY — there is NO
 * status-editing affordance and the chain-cache columns (sealTxHash /
 * citizenTokenId / sealedAt) render read-only behind an explicit
 * "CHAIN-DERIVED · NOT AUTHORITATIVE" tag. Witness signatures are PUBLIC data.
 */

interface WitnessSig extends Record<string, unknown> {
  id: string;
  witnessAddress: string;
  signature: string;
  nonce: string;
  deadline: string;
  createdAt: string;
}

interface AppDetail {
  id: string;
  userId: string;
  status: string;
  kycStatus: string;
  reviewNote: string | null;
  name: string;
  domicileCity: string;
  hostCountry: string;
  motto: string;
  oathAcceptedAt: string | null;
  applicantAddress: string | null;
  witnessNonce: string | null;
  witnessDeadline: string | null;
  createdAt: string;
  updatedAt: string;
  user: { email: string | null; name: string | null };
  witnessSignatures: WitnessSig[];
  chainCache: {
    chainDerived: true;
    sealTxHash: string | null;
    citizenTokenId: string | null;
    sealedAt: string | null;
  };
}

export function ApplicationDetail({ applicationId }: { applicationId: string }) {
  const [state, setState] = useState<Load<AppDetail>>({ status: "loading" });
  const [kyc, setKyc] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    setState({ status: "loading" });
    fetch(`/api/admin/applications/${applicationId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: { application: AppDetail }) => {
        setState({ status: "ok", data: d.application });
        setKyc(d.application.kycStatus);
        setNote(d.application.reviewNote ?? "");
      })
      .catch(() => setState({ status: "error" }));
  }, [applicationId]);

  useEffect(() => {
    load();
  }, [load]);

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
          <CardError onRetry={load} testid="application-detail-error" />
        </article>
      </Wrap>
    );
  }

  const app = state.data;

  return (
    <Wrap>
      <article className="pillar" style={{ padding: "24px 28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h3 style={{ margin: 0, fontSize: 20 }}>{app.user.email ?? app.userId}</h3>
          <TagLabel>STATUS · {app.status}</TagLabel>
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
          <Dt>Declared name</Dt>
          <Dd>{app.name}</Dd>
          <Dt>Domicile</Dt>
          <Dd>
            {app.domicileCity}, {app.hostCountry}
          </Dd>
          <Dt>Motto</Dt>
          <Dd>{app.motto}</Dd>
          <Dt>Oath accepted</Dt>
          <Dd>{app.oathAcceptedAt ? new Date(app.oathAcceptedAt).toISOString() : "—"}</Dd>
          <Dt>Applicant address</Dt>
          <Dd style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{app.applicantAddress ?? "—"}</Dd>
        </dl>
      </article>

      <article className="pillar" style={{ padding: "24px 28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h3 style={{ margin: 0, fontSize: 20 }}>Chain record</h3>
          <TagLabel testid="chain-derived-tag">CHAIN-DERIVED · NOT AUTHORITATIVE</TagLabel>
        </div>
        <p style={{ color: "var(--muted)", marginTop: 4, fontSize: 12 }}>
          Client-reported cache — the chain is authoritative. SEALED can only be derived from the
          seal transaction; this panel cannot set it.
        </p>
        <dl
          style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: "160px 1fr",
            gap: "8px 16px",
            fontSize: 13,
          }}
        >
          <Dt>Seal tx hash</Dt>
          <Dd style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
            {app.chainCache.sealTxHash ?? "—"}
          </Dd>
          <Dt>Citizen token id</Dt>
          <Dd style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
            {app.chainCache.citizenTokenId ?? "—"}
          </Dd>
          <Dt>Sealed at</Dt>
          <Dd>{app.chainCache.sealedAt ? new Date(app.chainCache.sealedAt).toISOString() : "—"}</Dd>
        </dl>
      </article>

      <article className="pillar" style={{ padding: "24px 28px" }}>
        <h3 style={{ margin: 0, fontSize: 20 }}>Witness signatures</h3>
        <p style={{ color: "var(--muted)", marginTop: 4, fontSize: 12 }}>
          Public data: checksummed witness addresses and their EIP-712 attestations.
        </p>
        <div style={{ marginTop: 12 }}>
          <Ledger
            columns={[
              {
                key: "witnessAddress",
                label: "Witness",
                render: (r: WitnessSig) => (
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                    {r.witnessAddress}
                  </span>
                ),
              },
              { key: "nonce", label: "Nonce", align: "right" },
              {
                key: "deadline",
                label: "Deadline",
                render: (r: WitnessSig) => new Date(r.deadline).toISOString(),
              },
              {
                key: "createdAt",
                label: "Signed",
                render: (r: WitnessSig) => new Date(r.createdAt).toISOString(),
              },
            ]}
            rows={app.witnessSignatures}
            getRowKey={(r: WitnessSig) => r.id}
            empty="No witness signatures yet."
          />
        </div>
      </article>

      <article className="pillar" style={{ padding: "24px 28px" }}>
        <h3 style={{ margin: 0, fontSize: 20 }}>Review</h3>
        <p style={{ color: "var(--muted)", marginTop: 4, fontSize: 12 }}>
          kycStatus and a review note ONLY — a body naming status, citizenTokenId, or sealTxHash is
          rejected by the API.
        </p>
        {saveError && (
          <p data-testid="review-error" style={{ color: "#b04141", fontSize: 13 }}>
            {saveError}
          </p>
        )}
        {saved && (
          <p data-testid="review-saved" style={{ color: "var(--success)", fontSize: 13 }}>
            Review saved.
          </p>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setSaveError(null);
            setSaved(false);
            try {
              const res = await fetch(`/api/admin/applications/${applicationId}/review`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ kycStatus: kyc, reviewNote: note }),
              });
              if (!res.ok) {
                const data = (await res.json().catch(() => ({}))) as { error?: string };
                setSaveError(data.error ?? "The review could not be saved.");
                return;
              }
              setSaved(true);
            } catch {
              setSaveError("The review could not be saved.");
            } finally {
              setBusy(false);
            }
          }}
          style={{
            marginTop: 12,
            display: "flex",
            flexDirection: "column",
            gap: 14,
            maxWidth: 520,
          }}
        >
          <Field id="review-kyc" label="KYC status">
            <select
              id="review-kyc"
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
          <Field id="review-note" label="Review note">
            <textarea
              id="review-note"
              style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
              value={note}
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Off-chain review note (max 2000 chars)"
            />
          </Field>
          <div>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              Save review
            </button>
          </div>
        </form>
      </article>
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="wrap"
      style={{ padding: "32px 0", display: "flex", flexDirection: "column", gap: 24 }}
    >
      <div className="kicker">APPLICATION REVIEW</div>
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

function Dd({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <dd style={{ margin: 0, ...style }}>{children}</dd>;
}
