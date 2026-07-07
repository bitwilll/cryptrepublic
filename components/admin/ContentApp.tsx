"use client";
import { useCallback, useEffect, useState } from "react";
import { Ledger, type LedgerColumn } from "@/components/ui/Ledger";
import { Modal } from "@/components/ui/Modal";
import { Skeleton, CardError, Field, inputStyle, TagLabel, type Load } from "./bits";

/**
 * Tabbed content CRUD (Wave 9 C3) over the 6 DB-served content groups +
 * comment moderation. HONESTY (constraint #7):
 * - the assets tab keeps the SEEDED/DEMONSTRATIVE context note (UI-level tags
 *   STAY) and mirrors the provenance guard client-side for instant feedback —
 *   the server remains the enforcement and its errors render VERBATIM;
 * - the allocations tab shows the live table-wide sum with an over-100%
 *   warning (mirror of the API's "Allocation targets exceed 100%.");
 * - a proposal body is not editable when its descriptionHash is set (editing
 *   it would falsify the on-chain hash binding); title/tag stay editable;
 * - comment moderation notes that the removed text is preserved in the audit
 *   log (beforeJson).
 */

type FormValues = Record<string, string | boolean>;

interface FieldDef {
  key: string;
  label: string;
  kind: "text" | "number" | "textarea" | "checkbox" | "select";
  options?: readonly string[];
}

async function mutate(
  url: string,
  method: "POST" | "PUT" | "DELETE",
  body?: unknown,
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method,
      ...(body !== undefined
        ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
        : {}),
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      return d.error ?? "The request failed.";
    }
    return null;
  } catch {
    return "The request failed.";
  }
}

const TABS = ["ASSETS", "EMBASSIES", "CENSUS", "ALLOCATIONS", "CONSTITUTION", "PROPOSALS"] as const;
type Tab = (typeof TABS)[number];

export function ContentApp() {
  const [tab, setTab] = useState<Tab>("ASSETS");
  return (
    <div
      className="wrap"
      style={{ padding: "32px 0", display: "flex", flexDirection: "column", gap: 24 }}
    >
      <div className="kicker">CONTENT REGISTRY</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            style={{
              padding: "8px 14px",
              border: tab === t ? "1px solid var(--ink)" : "1px solid var(--line)",
              background: tab === t ? "var(--ink)" : "#fff",
              color: tab === t ? "#fff" : "var(--ink)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
              fontFamily: "var(--mono)",
              cursor: "pointer",
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "ASSETS" && <AssetsTab />}
      {tab === "EMBASSIES" && <EmbassiesTab />}
      {tab === "CENSUS" && <CensusTab />}
      {tab === "ALLOCATIONS" && <AllocationsTab />}
      {tab === "CONSTITUTION" && <ConstitutionTab />}
      {tab === "PROPOSALS" && <ProposalsTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// generic pieces
// ---------------------------------------------------------------------------

function useList<Row>(url: string, key: string) {
  const [state, setState] = useState<Load<Row[]>>({ status: "loading" });
  const load = useCallback(() => {
    setState({ status: "loading" });
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: Record<string, Row[]>) =>
        setState({ status: "ok", data: Array.isArray(d[key]) ? d[key] : [] }),
      )
      .catch(() => setState({ status: "error" }));
  }, [url, key]);
  useEffect(() => {
    load();
  }, [load]);
  return { state, load };
}

/** Create/edit modal driven by field definitions; values are edited as strings. */
function FormModal({
  title,
  fields,
  initial,
  keyField,
  isEdit,
  error,
  extra,
  disabledFields,
  onChange,
  onSubmit,
  onClose,
}: {
  title: string;
  fields: FieldDef[];
  initial: FormValues;
  keyField: string;
  isEdit: boolean;
  error: string | null;
  extra?: React.ReactNode;
  disabledFields?: Record<string, string>; // key → reason (rendered in-voice)
  onChange: (v: FormValues) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const values = initial;
  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
      >
        {fields.map((f) => {
          const id = `content-field-${f.key}`;
          const keyLocked = isEdit && f.key === keyField;
          const disabledReason = disabledFields?.[f.key];
          const disabled = keyLocked || disabledReason !== undefined;
          return (
            <Field key={f.key} id={id} label={f.label}>
              {f.kind === "select" ? (
                <select
                  id={id}
                  style={inputStyle}
                  value={String(values[f.key] ?? "")}
                  disabled={disabled}
                  onChange={(e) => onChange({ ...values, [f.key]: e.target.value })}
                >
                  {(f.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : f.kind === "textarea" ? (
                <textarea
                  id={id}
                  style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
                  value={String(values[f.key] ?? "")}
                  disabled={disabled}
                  onChange={(e) => onChange({ ...values, [f.key]: e.target.value })}
                />
              ) : f.kind === "checkbox" ? (
                <input
                  id={id}
                  type="checkbox"
                  checked={Boolean(values[f.key])}
                  disabled={disabled}
                  onChange={(e) => onChange({ ...values, [f.key]: e.target.checked })}
                />
              ) : (
                <input
                  id={id}
                  style={inputStyle}
                  inputMode={f.kind === "number" ? "numeric" : undefined}
                  value={String(values[f.key] ?? "")}
                  disabled={disabled}
                  onChange={(e) => onChange({ ...values, [f.key]: e.target.value })}
                />
              )}
              {keyLocked && (
                <span style={{ fontSize: 11, color: "var(--muted)" }}>
                  The natural key cannot be renamed (keeps the audit target stable).
                </span>
              )}
              {disabledReason && (
                <span style={{ fontSize: 11, color: "var(--muted)" }}>{disabledReason}</span>
              )}
            </Field>
          );
        })}
        {extra}
        {error && (
          <p data-testid="form-error" style={{ color: "#8b3a3a", fontSize: 13, margin: 0 }}>
            {error}
          </p>
        )}
        <div style={{ display: "flex", gap: 12 }}>
          <button className="btn btn-primary" type="submit">
            Save
          </button>
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Two-step inline delete confirm. */
function DeleteButton({
  label,
  confirmNote,
  onConfirm,
}: {
  label: string;
  confirmNote: string;
  onConfirm: () => void;
}) {
  const [arming, setArming] = useState(false);
  if (!arming) {
    return (
      <button
        className="btn btn-ghost"
        type="button"
        style={{ padding: "6px 14px", fontSize: 12 }}
        onClick={() => setArming(true)}
      >
        {label}
      </button>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 11, color: "var(--muted)" }}>{confirmNote}</span>
      <button
        className="btn btn-primary"
        type="button"
        style={{ padding: "6px 14px", fontSize: 12 }}
        onClick={onConfirm}
      >
        Confirm removal
      </button>
      <button
        className="btn btn-ghost"
        type="button"
        style={{ padding: "6px 14px", fontSize: 12 }}
        onClick={() => setArming(false)}
      >
        Keep
      </button>
    </span>
  );
}

/** Shared tab scaffolding: list card + create/edit modal + delete, per config. */
function CrudTab<Row extends Record<string, unknown>>(props: {
  title: string;
  note?: React.ReactNode;
  listUrl: string;
  listKey: string;
  errorTestid: string;
  keyField: string;
  itemUrl: (keyVal: string) => string;
  columns: readonly LedgerColumn<Row>[];
  fields: FieldDef[];
  newLabel: string;
  emptyValues: FormValues;
  fromRow: (row: Row) => FormValues;
  toBody: (v: FormValues) => Record<string, unknown>;
  clientGuard?: (v: FormValues) => string | null;
  extra?: (v: FormValues, rows: Row[], editingKey: string | null) => React.ReactNode;
  summary?: (rows: Row[]) => React.ReactNode;
}) {
  const { state, load } = useList<Row>(props.listUrl, props.listKey);
  const [modal, setModal] = useState<{ editingKey: string | null; values: FormValues } | null>(
    null,
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  async function submit() {
    if (!modal) return;
    const guardMsg = props.clientGuard?.(modal.values) ?? null;
    if (guardMsg) {
      setFormError(guardMsg);
      return;
    }
    const body = props.toBody(modal.values);
    const err = modal.editingKey
      ? await mutate(props.itemUrl(modal.editingKey), "PUT", body)
      : await mutate(props.listUrl, "POST", body);
    if (err) {
      setFormError(err);
      return;
    }
    setModal(null);
    setFormError(null);
    load();
  }

  const rows = state.status === "ok" ? state.data : [];

  return (
    <article className="pillar" style={{ padding: "24px 28px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 style={{ margin: 0, fontSize: 20 }}>{props.title}</h3>
        <button
          className="btn btn-ghost"
          type="button"
          onClick={() => {
            setFormError(null);
            setModal({ editingKey: null, values: { ...props.emptyValues } });
          }}
        >
          {props.newLabel}
        </button>
      </div>
      {props.note}
      {state.status === "ok" && props.summary?.(rows)}
      {listError && (
        <p data-testid="list-error" style={{ color: "#8b3a3a", fontSize: 13 }}>
          {listError}
        </p>
      )}
      {state.status === "loading" && <Skeleton lines={4} />}
      {state.status === "error" && <CardError onRetry={load} testid={props.errorTestid} />}
      {state.status === "ok" && (
        <div style={{ marginTop: 14 }}>
          <Ledger
            columns={[
              ...props.columns,
              {
                key: "__actions",
                label: "",
                align: "right",
                render: (r: Row) => (
                  <span style={{ display: "inline-flex", gap: 8 }}>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      style={{ padding: "6px 14px", fontSize: 12 }}
                      onClick={() => {
                        setFormError(null);
                        setModal({
                          editingKey: String(r[props.keyField]),
                          values: props.fromRow(r),
                        });
                      }}
                    >
                      Edit
                    </button>
                    <DeleteButton
                      label="Delete"
                      confirmNote="Deletion is audit-logged with the removed record preserved."
                      onConfirm={async () => {
                        setListError(null);
                        const err = await mutate(
                          props.itemUrl(String(r[props.keyField])),
                          "DELETE",
                        );
                        if (err) setListError(err);
                        else load();
                      }}
                    />
                  </span>
                ),
              },
            ]}
            rows={rows}
            getRowKey={(r: Row) => String(r[props.keyField])}
            empty="No entries yet."
          />
        </div>
      )}
      {modal && (
        <FormModal
          title={modal.editingKey ? `Edit ${modal.editingKey}` : props.newLabel}
          fields={props.fields}
          initial={modal.values}
          keyField={props.keyField}
          isEdit={modal.editingKey !== null}
          error={formError}
          extra={props.extra?.(modal.values, rows, modal.editingKey)}
          onChange={(values) => setModal({ ...modal, values })}
          onSubmit={() => void submit()}
          onClose={() => {
            setModal(null);
            setFormError(null);
          }}
        />
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// per-group tabs
// ---------------------------------------------------------------------------

const FABRICATED_PROVENANCE = /CR-L2|CryptRepublic L2|TITLED ON CHAIN/i;

interface AssetRow extends Record<string, unknown> {
  ref: string;
  kind: string;
  name: string;
  location: string;
  valueUsd: string;
  yieldBps: number;
  annualYieldUsd: string;
  status: string;
  acquiredAt: string;
}

function AssetsTab() {
  return (
    <CrudTab<AssetRow>
      title="Asset catalog"
      note={
        <p
          data-testid="assets-demonstrative-note"
          style={{ color: "var(--muted)", marginTop: 6, fontSize: 12 }}
        >
          These entries are SEEDED / DEMONSTRATIVE content — the dashboard keeps its honesty tags.
          Fabricated on-chain provenance (CR-L2 / TITLED ON CHAIN) is rejected here and by the API.
        </p>
      }
      listUrl="/api/admin/content/assets"
      listKey="assets"
      errorTestid="assets-error"
      keyField="ref"
      itemUrl={(ref) => `/api/admin/content/assets/${encodeURIComponent(ref)}`}
      columns={[
        { key: "ref", label: "Ref" },
        { key: "name", label: "Name" },
        { key: "location", label: "Location" },
        {
          key: "valueUsd",
          label: "Value USD",
          align: "right",
          render: (r: AssetRow) =>
            r.valueUsd === "" ? "\u2014" : Number(r.valueUsd).toLocaleString("en-US"),
        },
        { key: "status", label: "Status" },
      ]}
      fields={[
        { key: "ref", label: "Ref", kind: "text" },
        { key: "kind", label: "Kind", kind: "select", options: ["re", "ip", "eq", "tr"] },
        { key: "name", label: "Name", kind: "text" },
        { key: "location", label: "Location", kind: "text" },
        { key: "valueUsd", label: "Value USD (integer)", kind: "number" },
        { key: "yieldBps", label: "Yield bps", kind: "number" },
        { key: "annualYieldUsd", label: "Annual yield USD (integer)", kind: "number" },
        { key: "status", label: "Status", kind: "text" },
        { key: "acquiredAt", label: "Acquired at", kind: "text" },
      ]}
      newLabel="New asset"
      emptyValues={{
        ref: "",
        kind: "re",
        name: "",
        location: "",
        valueUsd: "",
        yieldBps: "0",
        annualYieldUsd: "",
        status: "",
        acquiredAt: "",
      }}
      fromRow={(r) => ({
        ref: r.ref,
        kind: r.kind,
        name: r.name,
        location: r.location,
        valueUsd: r.valueUsd,
        yieldBps: String(r.yieldBps),
        annualYieldUsd: r.annualYieldUsd,
        status: r.status,
        acquiredAt: r.acquiredAt,
      })}
      toBody={(v) => ({
        ref: String(v.ref),
        kind: String(v.kind),
        name: String(v.name),
        location: String(v.location),
        valueUsd: String(v.valueUsd),
        yieldBps: Number(v.yieldBps),
        annualYieldUsd: String(v.annualYieldUsd),
        status: String(v.status),
        acquiredAt: String(v.acquiredAt),
      })}
      clientGuard={(v) =>
        FABRICATED_PROVENANCE.test([v.name, v.location, v.status].join(" "))
          ? "Fabricated on-chain provenance is not allowed."
          : null
      }
    />
  );
}

interface EmbassyRow extends Record<string, unknown> {
  code: string;
  name: string;
  neighborhood: string;
  hours: string;
  foundedAt: string;
  brandColor: string;
  city: string;
  country: string;
}

function EmbassiesTab() {
  return (
    <CrudTab<EmbassyRow>
      title="Embassy directory"
      listUrl="/api/admin/content/embassies"
      listKey="embassies"
      errorTestid="embassies-error"
      keyField="code"
      itemUrl={(code) => `/api/admin/content/embassies/${encodeURIComponent(code)}`}
      columns={[
        { key: "code", label: "Code" },
        { key: "name", label: "Name" },
        { key: "city", label: "City" },
        { key: "country", label: "Country" },
        { key: "hours", label: "Hours" },
      ]}
      fields={[
        { key: "code", label: "Code", kind: "text" },
        { key: "name", label: "Name", kind: "text" },
        { key: "neighborhood", label: "Neighborhood", kind: "text" },
        { key: "hours", label: "Hours", kind: "text" },
        { key: "foundedAt", label: "Founded at", kind: "text" },
        { key: "brandColor", label: "Brand color", kind: "text" },
        { key: "city", label: "City", kind: "text" },
        { key: "country", label: "Country", kind: "text" },
      ]}
      newLabel="New embassy"
      emptyValues={{
        code: "",
        name: "",
        neighborhood: "",
        hours: "",
        foundedAt: "",
        brandColor: "",
        city: "",
        country: "",
      }}
      fromRow={(r) => ({
        code: r.code,
        name: r.name,
        neighborhood: r.neighborhood,
        hours: r.hours,
        foundedAt: r.foundedAt,
        brandColor: r.brandColor,
        city: r.city,
        country: r.country,
      })}
      toBody={(v) => ({
        code: String(v.code),
        name: String(v.name),
        neighborhood: String(v.neighborhood),
        hours: String(v.hours),
        foundedAt: String(v.foundedAt),
        brandColor: String(v.brandColor),
        city: String(v.city),
        country: String(v.country),
      })}
    />
  );
}

interface CensusRow extends Record<string, unknown> {
  code: string;
  name: string;
  lat: number;
  long: number;
  hasEmbassy: boolean;
  seededCount: number;
}

function CensusTab() {
  return (
    <CrudTab<CensusRow>
      title="City census (seeded snapshot)"
      note={
        <p style={{ color: "var(--muted)", marginTop: 6, fontSize: 12 }}>
          seededCount is demonstrative geography — the dashboard never merges it into the live
          totalCitizens().
        </p>
      }
      listUrl="/api/admin/content/census"
      listKey="census"
      errorTestid="census-error"
      keyField="code"
      itemUrl={(code) => `/api/admin/content/census/${encodeURIComponent(code)}`}
      columns={[
        { key: "code", label: "Code" },
        { key: "name", label: "City" },
        { key: "lat", label: "Lat", align: "right" },
        { key: "long", label: "Long", align: "right" },
        {
          key: "hasEmbassy",
          label: "Embassy",
          render: (r: CensusRow) => (r.hasEmbassy ? "yes" : "no"),
        },
        { key: "seededCount", label: "Seeded count", align: "right" },
      ]}
      fields={[
        { key: "code", label: "Code", kind: "text" },
        { key: "name", label: "City name", kind: "text" },
        { key: "lat", label: "Latitude", kind: "number" },
        { key: "long", label: "Longitude", kind: "number" },
        { key: "hasEmbassy", label: "Has embassy", kind: "checkbox" },
        { key: "seededCount", label: "Seeded count", kind: "number" },
      ]}
      newLabel="New city"
      emptyValues={{ code: "", name: "", lat: "0", long: "0", hasEmbassy: false, seededCount: "0" }}
      fromRow={(r) => ({
        code: r.code,
        name: r.name,
        lat: String(r.lat),
        long: String(r.long),
        hasEmbassy: r.hasEmbassy,
        seededCount: String(r.seededCount),
      })}
      toBody={(v) => ({
        code: String(v.code),
        name: String(v.name),
        lat: Number(v.lat),
        long: Number(v.long),
        hasEmbassy: Boolean(v.hasEmbassy),
        seededCount: Number(v.seededCount),
      })}
    />
  );
}

interface AllocationRow extends Record<string, unknown> {
  id: string;
  bucket: string;
  label: string;
  targetBps: number;
  color: string;
}

function AllocationsTab() {
  return (
    <CrudTab<AllocationRow>
      title="Treasury allocation targets"
      note={
        <p style={{ color: "var(--muted)", marginTop: 6, fontSize: 12 }}>
          The table-wide sum of targetBps must stay ≤ 10000 (100%) — the same rule the on-chain
          treasury enforces (AllocationOverflow).
        </p>
      }
      listUrl="/api/admin/content/allocations"
      listKey="allocations"
      errorTestid="allocations-error"
      keyField="bucket"
      itemUrl={(bucket) => `/api/admin/content/allocations/${encodeURIComponent(bucket)}`}
      columns={[
        { key: "bucket", label: "Bucket" },
        { key: "label", label: "Label" },
        { key: "targetBps", label: "Target bps", align: "right" },
        { key: "color", label: "Color" },
      ]}
      fields={[
        { key: "bucket", label: "Bucket (a-z, 0-9, _; max 32)", kind: "text" },
        { key: "label", label: "Label", kind: "text" },
        { key: "targetBps", label: "Target bps", kind: "number" },
        { key: "color", label: "Color", kind: "text" },
      ]}
      newLabel="New allocation"
      emptyValues={{ bucket: "", label: "", targetBps: "0", color: "" }}
      fromRow={(r) => ({
        bucket: r.bucket,
        label: r.label,
        targetBps: String(r.targetBps),
        color: r.color,
      })}
      toBody={(v) => ({
        bucket: String(v.bucket),
        label: String(v.label),
        targetBps: Number(v.targetBps),
        color: String(v.color),
      })}
      summary={(rows) => {
        const sum = rows.reduce((acc, r) => acc + r.targetBps, 0);
        return (
          <p style={{ fontSize: 12, color: sum > 10_000 ? "#b04141" : "var(--muted)" }}>
            Live table-wide sum: <b data-testid="allocation-sum">{sum}</b> / 10000 bps
            {sum > 10_000 && " — targets exceed 100%"}
          </p>
        );
      }}
      extra={(v, rows, editingKey) => {
        const others = rows
          .filter((r) => r.bucket !== (editingKey ?? v.bucket))
          .reduce((sum, r) => sum + r.targetBps, 0);
        const next = others + (Number(v.targetBps) || 0);
        return (
          <p style={{ fontSize: 12, color: next > 10_000 ? "#b04141" : "var(--muted)", margin: 0 }}>
            New table-wide sum: <b data-testid="allocation-form-sum">{next}</b> / 10000 bps
            {next > 10_000 && (
              <span data-testid="allocation-sum-warning">
                {" "}
                — allocation targets would exceed 100%; the API will reject this.
              </span>
            )}
          </p>
        );
      }}
    />
  );
}

interface ConstitutionRow extends Record<string, unknown> {
  key: string;
  title: string;
  body: string;
  citation: string | null;
}

function ConstitutionTab() {
  return (
    <CrudTab<ConstitutionRow>
      title="Constitution text"
      listUrl="/api/admin/content/constitution"
      listKey="entries"
      errorTestid="constitution-error"
      keyField="key"
      itemUrl={(key) => `/api/admin/content/constitution/${encodeURIComponent(key)}`}
      columns={[
        { key: "key", label: "Key" },
        { key: "title", label: "Title" },
        { key: "citation", label: "Citation", render: (r: ConstitutionRow) => r.citation ?? "—" },
      ]}
      fields={[
        { key: "key", label: "Key", kind: "text" },
        { key: "title", label: "Title", kind: "text" },
        { key: "body", label: "Body", kind: "textarea" },
        { key: "citation", label: "Citation (optional)", kind: "text" },
      ]}
      newLabel="New article"
      emptyValues={{ key: "", title: "", body: "", citation: "" }}
      fromRow={(r) => ({
        key: r.key,
        title: r.title,
        body: r.body,
        citation: r.citation ?? "",
      })}
      toBody={(v) => ({
        key: String(v.key),
        title: String(v.title),
        body: String(v.body),
        citation: String(v.citation).trim() === "" ? null : String(v.citation),
      })}
    />
  );
}

// ---------------------------------------------------------------------------
// proposals + comment moderation (custom tab: no create, no delete — recorded
// decisions; body immutability under a set descriptionHash)
// ---------------------------------------------------------------------------

interface ProposalRow extends Record<string, unknown> {
  id: string;
  chainId: number;
  proposalId: string;
  title: string;
  tag: string;
  body: string;
  descriptionHash: string | null;
  commentCount: number;
}

interface CommentRow {
  id: string;
  authorAddress: string;
  citizenTokenId: string | null;
  body: string;
  createdAt: string;
}

const PROPOSAL_TAGS = ["PROCEDURAL", "CULTURAL", "FISCAL", "CIVIC", "TECHNICAL"] as const;

function ProposalsTab() {
  const { state, load } = useList<ProposalRow>("/api/admin/content/proposals", "proposals");
  const [editing, setEditing] = useState<ProposalRow | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [commentsFor, setCommentsFor] = useState<ProposalRow | null>(null);

  return (
    <article className="pillar" style={{ padding: "24px 28px" }}>
      <h3 style={{ margin: 0, fontSize: 20 }}>Governance proposal content</h3>
      <p style={{ color: "var(--muted)", marginTop: 6, fontSize: 12 }}>
        Proposal texts are created by citizens against real on-chain proposals — there is no admin
        create or delete (a delete would orphan the on-chain descriptionHash binding). A body whose
        descriptionHash is set is immutable; title and tag stay editable.
      </p>
      {state.status === "loading" && <Skeleton lines={4} />}
      {state.status === "error" && <CardError onRetry={load} testid="proposals-error" />}
      {state.status === "ok" && (
        <div style={{ marginTop: 14 }}>
          <Ledger
            columns={[
              { key: "title", label: "Title" },
              { key: "tag", label: "Tag" },
              {
                key: "proposalId",
                label: "Proposal",
                render: (r: ProposalRow) => `#${r.proposalId} @ ${r.chainId}`,
              },
              {
                key: "descriptionHash",
                label: "Hash binding",
                render: (r: ProposalRow) =>
                  r.descriptionHash ? <TagLabel>HASH-BOUND</TagLabel> : "—",
              },
              {
                key: "__actions",
                label: "",
                align: "right",
                render: (r: ProposalRow) => (
                  <span style={{ display: "inline-flex", gap: 8 }}>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      style={{ padding: "6px 14px", fontSize: 12 }}
                      onClick={() => {
                        setFormError(null);
                        setEditing(r);
                        setValues({ title: r.title, tag: r.tag, body: r.body });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      style={{ padding: "6px 14px", fontSize: 12 }}
                      onClick={() => setCommentsFor(r)}
                    >
                      Comments ({r.commentCount})
                    </button>
                  </span>
                ),
              },
            ]}
            rows={state.data}
            getRowKey={(r: ProposalRow) => r.id}
            empty="No proposal content rows yet."
          />
        </div>
      )}

      {editing && (
        <FormModal
          title={`Edit proposal content`}
          fields={[
            { key: "title", label: "Title", kind: "text" },
            { key: "tag", label: "Tag", kind: "select", options: PROPOSAL_TAGS },
            { key: "body", label: "Body", kind: "textarea" },
          ]}
          initial={values}
          keyField="__none"
          isEdit
          error={formError}
          disabledFields={
            editing.descriptionHash
              ? {
                  body: "Body is bound to the on-chain descriptionHash — editing it would falsify the hash binding.",
                }
              : undefined
          }
          onChange={setValues}
          onSubmit={() => {
            void (async () => {
              const body: Record<string, unknown> = {
                title: String(values.title),
                tag: String(values.tag),
              };
              // hash-bound bodies are never sent (immutability — route enforces too)
              if (!editing.descriptionHash) body.body = String(values.body);
              const err = await mutate(`/api/admin/content/proposals/${editing.id}`, "PUT", body);
              if (err) {
                setFormError(err);
                return;
              }
              setEditing(null);
              load();
            })();
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {commentsFor && <CommentsModal proposal={commentsFor} onClose={() => setCommentsFor(null)} />}
    </article>
  );
}

function CommentsModal({ proposal, onClose }: { proposal: ProposalRow; onClose: () => void }) {
  const [state, setState] = useState<Load<CommentRow[]>>({ status: "loading" });
  const [arming, setArming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setState({ status: "loading" });
    fetch(`/api/admin/content/proposals/${proposal.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: { comments?: CommentRow[] }) =>
        setState({ status: "ok", data: Array.isArray(d.comments) ? d.comments : [] }),
      )
      .catch(() => setState({ status: "error" }));
  }, [proposal.id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Modal title={`Comments — ${proposal.title}`} onClose={onClose}>
      {state.status === "loading" && <Skeleton lines={3} />}
      {state.status === "error" && <CardError onRetry={load} testid="comments-error" />}
      {error && (
        <p data-testid="comment-error" style={{ color: "#8b3a3a", fontSize: 13 }}>
          {error}
        </p>
      )}
      {state.status === "ok" && state.data.length === 0 && (
        <p style={{ color: "var(--muted)", fontSize: 13 }}>No comments.</p>
      )}
      {state.status === "ok" &&
        state.data.map((c) => (
          <div
            key={c.id}
            data-testid="comment-row"
            style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}
          >
            <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>
              {c.authorAddress}
              {c.citizenTokenId ? ` · citizen №${c.citizenTokenId}` : ""}
            </div>
            <p style={{ margin: "6px 0", fontSize: 14 }}>{c.body}</p>
            {arming === c.id ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>
                  The removed text is preserved in the audit log.
                </span>
                <button
                  className="btn btn-primary"
                  type="button"
                  style={{ padding: "6px 14px", fontSize: 12 }}
                  onClick={() => {
                    void (async () => {
                      setError(null);
                      const err = await mutate(`/api/admin/content/comments/${c.id}`, "DELETE");
                      if (err) setError(err);
                      else {
                        setArming(null);
                        load();
                      }
                    })();
                  }}
                >
                  Confirm removal
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  style={{ padding: "6px 14px", fontSize: 12 }}
                  onClick={() => setArming(null)}
                >
                  Keep
                </button>
              </span>
            ) : (
              <button
                className="btn btn-ghost"
                type="button"
                style={{ padding: "6px 14px", fontSize: 12 }}
                onClick={() => setArming(c.id)}
              >
                Moderate
              </button>
            )}
          </div>
        ))}
    </Modal>
  );
}
