"use client";
import { useState } from "react";
import {
  safeTxBuilderJson,
  type GovernanceProposalPayload,
  type PreparedBatch,
  type PreparedTx,
} from "@/lib/admin/prepare";
import type { AdminContract, RoleName } from "@/lib/admin/roles";
import { TagLabel } from "./bits";

/**
 * Renders a PREPARED admin artifact (Wave 9 C4). The panel NEVER signs or
 * broadcasts (constraint #1; test/no-admin-signing.test.ts is the standing
 * proof): this card only shows decoded calldata, copies it, and exports the
 * Safe Transaction Builder JSON for the USER's Safe to review and submit.
 *
 * TWO banner variants share data-testid="never-signs-label" (addendum #4):
 * - PreparedBatch → "PREPARED FOR YOUR SAFE — THIS PANEL NEVER SIGNS."
 * - GovernanceProposalPayload → "PREPARED AS A GOVERNANCE-PROPOSAL PAYLOAD —
 *   NOT A SAFE TRANSACTION — THIS PANEL NEVER SIGNS." (and NO Safe JSON
 *   export — a proposal payload is not a Safe transaction; the copyable
 *   artifact is the FULL propose() calldata for a CITIZEN wallet).
 *
 * Addendum #3: `requiredRole` annotates the role the executing sender must
 * hold + the currently-confirmed holders (from the topology on screen), so
 * the operator sees a would-revert warning BEFORE export.
 *
 * AUDIT SCOPE (addendum #8): composing/exporting is pure client-side and
 * writes no AuditLog row — the Safe's own review/queue is the audit surface
 * for prepared transactions.
 */

export interface RequiredRoleInfo {
  contract: AdminContract;
  role: RoleName | string;
  holders: readonly string[];
}

function isBatch(p: PreparedBatch | GovernanceProposalPayload): p is PreparedBatch {
  return "txs" in p;
}

function copy(text: string): void {
  void navigator.clipboard?.writeText(text);
}

export function PreparedActionCard({
  prepared,
  requiredRole,
}: {
  prepared: PreparedBatch | GovernanceProposalPayload;
  requiredRole?: RequiredRoleInfo | null;
}) {
  return (
    <article className="pillar" data-testid="prepared-action-card" style={{ padding: "24px 28px" }}>
      <div
        data-testid="never-signs-label"
        style={{
          padding: "10px 14px",
          background: "var(--navy)",
          color: "#fff",
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.08em",
          fontFamily: "var(--mono)",
        }}
      >
        {isBatch(prepared)
          ? "PREPARED FOR YOUR SAFE — THIS PANEL NEVER SIGNS."
          : "PREPARED AS A GOVERNANCE-PROPOSAL PAYLOAD — NOT A SAFE TRANSACTION — THIS PANEL NEVER SIGNS."}
      </div>

      <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 18 }}>
          {isBatch(prepared) ? prepared.description : prepared.decoded.summary}
        </h3>
        <TagLabel>chain {prepared.chainId}</TagLabel>
      </div>

      {requiredRole && (
        <p
          data-testid="required-role"
          style={{
            marginTop: 10,
            fontSize: 12,
            color: requiredRole.holders.length === 0 ? "#b04141" : "var(--muted)",
          }}
        >
          REQUIRED ROLE: <b>{requiredRole.role}</b> on <b>{requiredRole.contract}</b>.{" "}
          {requiredRole.holders.length === 0 ? (
            <>
              No confirmed holders — this action will revert for EVERY sender until the role is
              granted.
            </>
          ) : (
            <>
              Confirmed holders:{" "}
              <span style={{ fontFamily: "var(--mono)", overflowWrap: "anywhere" }}>
                {requiredRole.holders.join(", ")}
              </span>
              . A sender without this role will revert — verify your Safe is among them before
              export.
            </>
          )}
        </p>
      )}

      {isBatch(prepared) ? <BatchBody batch={prepared} /> : <ProposalBody payload={prepared} />}
    </article>
  );
}

function BatchBody({ batch }: { batch: PreparedBatch }) {
  function download() {
    const json = safeTxBuilderJson(batch);
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crypt-admin-${batch.txs[0]?.decoded.functionName ?? "action"}-${batch.chainId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
      {batch.txs.map((tx, i) => (
        <TxBlock key={i} tx={tx} index={i} count={batch.txs.length} />
      ))}
      {batch.txs.length > 1 && (
        <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
          Submit the transactions IN ORDER — the second pulls funds approved by the first and
          reverts without it.
        </p>
      )}
      <div>
        <button className="btn btn-primary" type="button" onClick={download}>
          Download Safe Tx Builder JSON
        </button>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
        Import the file into the Safe web app&apos;s Transaction Builder; the Safe&apos;s own
        review/queue is the audit surface for prepared transactions (the panel audits only server
        mutations).
      </p>
    </div>
  );
}

function TxBlock({ tx, index, count }: { tx: PreparedTx; index: number; count: number }) {
  const [showRaw, setShowRaw] = useState(false);
  return (
    <div
      data-testid="prepared-tx"
      style={{ border: "1px solid var(--line)", padding: "12px 14px" }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--mono)" }}>
        {count > 1 ? `${index + 1}. ` : ""}
        {tx.decoded.summary}
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>
        to <span style={{ fontFamily: "var(--mono)" }}>{tx.to}</span> · value {tx.value} ·{" "}
        {tx.decoded.contract}
      </div>
      {Object.entries(tx.decoded.args).length > 0 && (
        <dl
          style={{
            margin: "8px 0 0",
            display: "grid",
            gridTemplateColumns: "140px 1fr",
            gap: "4px 12px",
            fontSize: 12,
          }}
        >
          {Object.entries(tx.decoded.args).map(([k, v]) => (
            <FragmentRow key={k} k={k} v={v} />
          ))}
        </dl>
      )}
      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          className="btn btn-ghost"
          type="button"
          style={{ padding: "6px 14px", fontSize: 12 }}
          aria-label={count > 1 ? `Copy calldata for transaction ${index + 1}` : "Copy calldata"}
          onClick={() => copy(tx.data)}
        >
          Copy calldata
        </button>
        <button
          className="btn btn-ghost"
          type="button"
          style={{ padding: "6px 14px", fontSize: 12 }}
          aria-expanded={showRaw}
          onClick={() => setShowRaw(!showRaw)}
        >
          {showRaw ? "Hide raw data" : "Show raw data"}
        </button>
      </div>
      {showRaw && (
        <pre
          style={{
            margin: "10px 0 0",
            padding: 10,
            background: "var(--paper)",
            border: "1px solid var(--line)",
            fontSize: 11,
            overflowX: "auto",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
          }}
        >
          {tx.data}
        </pre>
      )}
    </div>
  );
}

function FragmentRow({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt
        style={{
          margin: 0,
          fontFamily: "var(--mono)",
          color: "var(--muted)",
          textTransform: "uppercase",
          fontSize: 10,
          letterSpacing: "0.08em",
        }}
      >
        {k}
      </dt>
      <dd style={{ margin: 0, fontFamily: "var(--mono)", overflowWrap: "anywhere" }}>{v}</dd>
    </>
  );
}

function ProposalBody({ payload }: { payload: GovernanceProposalPayload }) {
  const [showRaw, setShowRaw] = useState(false);
  return (
    <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
      <p data-testid="proposal-note" style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
        {payload.note}
      </p>

      <div style={{ border: "1px solid var(--line)", padding: "12px 14px", fontSize: 12 }}>
        <div style={{ fontWeight: 700, fontFamily: "var(--mono)", fontSize: 13 }}>
          {payload.decoded.summary}
        </div>
        <dl
          style={{
            margin: "8px 0 0",
            display: "grid",
            gridTemplateColumns: "140px 1fr",
            gap: "4px 12px",
          }}
        >
          <FragmentRow k="target (treasury)" v={payload.target} />
          <FragmentRow k="value" v={payload.value} />
          <FragmentRow k="description" v={payload.description} />
          <FragmentRow k="descriptionHash" v={payload.descriptionHash} />
        </dl>
      </div>

      <div
        data-testid="propose-artifact"
        style={{ border: "1px solid var(--line)", padding: "12px 14px", fontSize: 12 }}
      >
        <div style={{ fontWeight: 700 }}>
          The copyable artifact: the FULL propose(target, value, callData, descriptionHash) calldata
        </div>
        <div style={{ marginTop: 6, color: "var(--muted)" }}>
          submit to the Governance contract{" "}
          <span style={{ fontFamily: "var(--mono)" }}>{payload.propose.to}</span> FROM A CITIZEN
          WALLET
        </div>
        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="btn btn-ghost"
            type="button"
            style={{ padding: "6px 14px", fontSize: 12 }}
            onClick={() => copy(payload.propose.data)}
          >
            Copy propose() calldata
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            style={{ padding: "6px 14px", fontSize: 12 }}
            aria-expanded={showRaw}
            onClick={() => setShowRaw(!showRaw)}
          >
            {showRaw ? "Hide raw data" : "Show raw data"}
          </button>
        </div>
        {showRaw && (
          <pre
            style={{
              margin: "10px 0 0",
              padding: 10,
              background: "var(--paper)",
              border: "1px solid var(--line)",
              fontSize: 11,
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
            }}
          >
            {payload.propose.data}
          </pre>
        )}
      </div>

      <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
        Not a Safe transaction — no Safe export. Create the matching GovernanceProposalContent row
        so the descriptionHash binds the proposal body, then submit propose() from a citizen wallet.
      </p>
    </div>
  );
}
