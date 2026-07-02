"use client";
import { useCallback, useEffect, useState } from "react";
import { Ledger } from "@/components/ui/Ledger";
import { KYC_STATUSES } from "@/lib/auth/types";
import { prepareAdminMint, type PreparedBatch } from "@/lib/admin/prepare";
import { PreparedActionCard } from "./PreparedActionCard";
import { Skeleton, CardError, Field, inputStyle, TagLabel, type Load } from "./bits";

/**
 * Application review detail (Wave 9 C2). OFF-CHAIN-HONEST (constraint #6):
 * the review form posts { kycStatus?, reviewNote? } ONLY — there is NO
 * status-editing affordance and the chain-cache columns (sealTxHash /
 * citizenTokenId / sealedAt) render read-only behind an explicit
 * "CHAIN-DERIVED · NOT AUTHORITATIVE" tag. Witness signatures are PUBLIC data.
 *
 * Wave 10 A4 — Admin mint (override witnesses): the affordance gates on the
 * GET route's LIVE `resolvedMintTo` (== the approve-mint route's `to`
 * resolution), NEVER the stale `applicantAddress` column. Approving POSTs
 * approve-mint (off-chain intent), then feeds the SERVER's mintParams into the
 * PURE `prepareAdminMint` encoder → `PreparedActionCard`. Nothing here signs
 * or broadcasts (test/no-admin-signing.test.ts).
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
  /** LIVE resolveApplicantAddress(userId) — the trusted mint destination (Wave 10). */
  resolvedMintTo: string | null;
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

interface AdminMintParamsPayload {
  to: `0x${string}`;
  nameHash: `0x${string}`;
  motto: `0x${string}`;
  domicile: `0x${string}`;
}

type MintState =
  | { phase: "idle" }
  | { phase: "busy" }
  | { phase: "error"; message: string }
  | {
      phase: "done";
      alreadyCitizen: boolean;
      chainId: number;
      mintParams: AdminMintParamsPayload;
      batch: PreparedBatch | null;
    };

interface ChainCtx {
  available: boolean;
  passport: `0x${string}` | null;
  holders: string[];
}

export function ApplicationDetail({ applicationId }: { applicationId: string }) {
  const [state, setState] = useState<Load<AppDetail>>({ status: "loading" });
  const [kyc, setKyc] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [me, setMe] = useState<{ userId: string; verifiedAddress: string | null } | null>(null);
  const [chain, setChain] = useState<ChainCtx | null>(null);
  const [mint, setMint] = useState<MintState>({ phase: "idle" });

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

  // Acting-admin identity (self-mint note) + passport address/role holders for
  // the prepared card. Both degrade gracefully — never block the review screen.
  useEffect(() => {
    fetch("/api/admin/me")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: { userId: string; verifiedAddress: string | null }) => setMe(d))
      .catch(() => setMe(null));
    Promise.all([
      fetch("/api/admin/chain/params").then((r) =>
        r.ok ? r.json() : Promise.reject(new Error("failed")),
      ),
      fetch("/api/admin/chain/roles").then((r) =>
        r.ok ? r.json() : Promise.reject(new Error("failed")),
      ),
    ])
      .then(
        ([p, t]: [
          { available: boolean; addresses: { passport?: `0x${string}` } },
          {
            available: boolean;
            contracts?: { contract: string; roles: { role: string; holders: string[] }[] }[];
          },
        ]) => {
          const passport = p.available ? (p.addresses.passport ?? null) : null;
          const holders =
            (t.available &&
              t.contracts
                ?.find((c) => c.contract === "passport")
                ?.roles.find((r) => r.role === "PASSPORT_ADMIN_ROLE")?.holders) ||
            [];
          setChain({ available: Boolean(passport), passport, holders });
        },
      )
      .catch(() => setChain({ available: false, passport: null, holders: [] }));
  }, []);

  async function approveMint() {
    setMint({ phase: "busy" });
    try {
      const res = await fetch(`/api/admin/applications/${applicationId}/approve-mint`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setMint({ phase: "error", message: data.error ?? "The approval could not be recorded." });
        return;
      }
      const data = (await res.json()) as {
        ok: boolean;
        alreadyCitizen: boolean;
        chainId: number;
        mintParams: AdminMintParamsPayload;
      };
      // The client NEVER re-encodes: the server's already-encoded params feed
      // the pure encoder directly.
      const batch =
        !data.alreadyCitizen && chain?.passport
          ? prepareAdminMint(
              data.chainId,
              chain.passport,
              data.mintParams.to,
              data.mintParams.nameHash,
              data.mintParams.motto,
              data.mintParams.domicile,
            )
          : null;
      setMint({
        phase: "done",
        alreadyCitizen: data.alreadyCitizen,
        chainId: data.chainId,
        mintParams: data.mintParams,
        batch,
      });
    } catch {
      setMint({ phase: "error", message: "The approval could not be recorded." });
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
          <Dd style={{ fontFamily: "var(--mono)", fontSize: 12, overflowWrap: "anywhere" }}>
            {app.applicantAddress ?? "—"}
          </Dd>
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
          <Dd style={{ fontFamily: "var(--mono)", fontSize: 12, overflowWrap: "anywhere" }}>
            {app.chainCache.sealTxHash ?? "—"}
          </Dd>
          <Dt>Citizen token id</Dt>
          <Dd style={{ fontFamily: "var(--mono)", fontSize: 12, overflowWrap: "anywhere" }}>
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h3 style={{ margin: 0, fontSize: 20 }}>Admin mint (override witnesses)</h3>
          <TagLabel>PASSPORT_ADMIN_ROLE</TagLabel>
        </div>
        <p style={{ color: "var(--muted)", marginTop: 4, fontSize: 12 }}>
          Approval is off-chain intent. The passport is issued only when the prepared adminMint is
          signed and broadcast in your own wallet/Safe and the chain confirms it. This panel never
          signs.
        </p>
        {me && state.data.userId === me.userId && (
          <p
            data-testid="self-mint-note"
            style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: "var(--navy)" }}
          >
            This is YOUR OWN application — approving prepares a SELF-mint to your verified wallet
            (no other witness required).
          </p>
        )}
        {app.resolvedMintTo === null ? (
          <div data-testid="approve-mint-disabled" style={{ marginTop: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: "#b04141" }}>
              This applicant has no verified wallet — adminMint needs a destination. The mint
              destination is always the server-resolved verified wallet, never a typed address.
            </p>
            <p style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
              Two honest paths: (1) the applicant verifies a wallet themselves — Dashboard → Wallet
              → &ldquo;Verify this wallet&rdquo; (signs a message locally; unblocks this button), or
              (2) you prepare a MANUAL admin mint in{" "}
              <a href="/admin/chain" style={{ textDecoration: "underline" }}>
                Chain actions
              </a>{" "}
              — typing a destination there requires verifying it with its owner off-chain (a wrong
              address mints an irrevocable soulbound passport).
            </p>
          </div>
        ) : (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
              Destination (live-resolved verified wallet — the server&apos;s mint `to`):{" "}
              <span
                data-testid="resolved-mint-to"
                style={{ fontFamily: "var(--mono)", overflowWrap: "anywhere" }}
              >
                {app.resolvedMintTo}
              </span>
            </p>
            {mint.phase === "error" && (
              <p
                data-testid="approve-mint-error"
                style={{ color: "#b04141", fontSize: 13, margin: 0 }}
              >
                {mint.message}
              </p>
            )}
            <div>
              <button
                className="btn btn-primary"
                type="button"
                disabled={mint.phase === "busy"}
                onClick={approveMint}
              >
                Approve &amp; prepare admin mint
              </button>
            </div>
          </div>
        )}
      </article>

      {mint.phase === "done" && mint.alreadyCitizen && (
        <article className="pillar" data-testid="already-citizen" style={{ padding: "24px 28px" }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>Already a citizen on chain</h3>
          <p style={{ color: "var(--muted)", marginTop: 6, fontSize: 13 }}>
            This address already holds a passport on chain — adminMint would revert
            (AlreadyCitizen). The approval intent was recorded in the audit trail; no transaction is
            exported.
          </p>
        </article>
      )}
      {mint.phase === "done" && !mint.alreadyCitizen && mint.batch && (
        <PreparedActionCard
          prepared={mint.batch}
          requiredRole={{
            contract: "passport",
            role: "PASSPORT_ADMIN_ROLE",
            holders: chain?.holders ?? [],
          }}
        />
      )}
      {mint.phase === "done" && !mint.alreadyCitizen && !mint.batch && (
        <article
          className="pillar"
          data-testid="approve-mint-chain-unavailable"
          style={{ padding: "24px 28px" }}
        >
          <h3 style={{ margin: 0, fontSize: 18 }}>Chain not registered — manual composition</h3>
          <p style={{ color: "var(--muted)", marginTop: 6, fontSize: 13 }}>
            The approval was recorded, but no passport contract is registered on this chain, so no
            transaction could be prepared. Compose adminMint manually with these SERVER-resolved
            params:
          </p>
          <dl
            data-testid="approve-mint-params"
            style={{
              marginTop: 10,
              display: "grid",
              gridTemplateColumns: "120px 1fr",
              gap: "6px 14px",
              fontSize: 12,
            }}
          >
            <Dt>to</Dt>
            <Dd style={{ fontFamily: "var(--mono)", overflowWrap: "anywhere" }}>
              {mint.mintParams.to}
            </Dd>
            <Dt>nameHash</Dt>
            <Dd style={{ fontFamily: "var(--mono)", overflowWrap: "anywhere" }}>
              {mint.mintParams.nameHash}
            </Dd>
            <Dt>motto</Dt>
            <Dd style={{ fontFamily: "var(--mono)", overflowWrap: "anywhere" }}>
              {mint.mintParams.motto}
            </Dd>
            <Dt>domicile</Dt>
            <Dd style={{ fontFamily: "var(--mono)", overflowWrap: "anywhere" }}>
              {mint.mintParams.domicile}
            </Dd>
          </dl>
        </article>
      )}

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
