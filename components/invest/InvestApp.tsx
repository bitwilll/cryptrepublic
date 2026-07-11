"use client";
import { useCallback, useEffect, useState } from "react";
import { PROJECT_CATEGORY_LABELS, COMMUNITY_BACKED_THRESHOLD } from "@/lib/gov/types";
import { validCoinAmount } from "@/lib/validation/invest";
import { formatCoin, formatDate } from "@/lib/store/format";
import { coinToCents } from "@/lib/invest/amounts";
import {
  CommunityBackedBadge,
  ErrorBox,
  NON_CUSTODIAL_NOTICE,
  PledgeStatusPill,
  ProjectStatusPill,
  Skeletons,
  type ProjectItem,
} from "./bits";
import { NewProjectForm } from "./NewProjectForm";
import styles from "./invest.module.css";

/**
 * Projects & investment (Wave 16) client island — four registers under one
 * seal: INVEST (browse ACTIVE fundraisers and pledge), ENDORSEMENT QUEUE
 * (SUBMITTED filings gathering the 7-citizen community signal), MY PLEDGES
 * (the caller's pledge ledger), MY FUNDRAISER (file, track, withdraw).
 * Everything here is a REGISTRY ROW: pledges are recorded commitments —
 * settlement is wallet-to-wallet; the Republic never holds funds.
 */

type Tab = "invest" | "queue" | "pledges" | "fundraiser";
type Load<T> = { status: "loading" } | { status: "ok"; data: T } | { status: "error" };

const TAB_ORDER = ["invest", "queue", "pledges", "fundraiser"] as const;
const TAB_LABELS: Record<Tab, string> = {
  invest: "Invest",
  queue: "Endorsement queue",
  pledges: "My pledges",
  fundraiser: "My fundraiser",
};

function categoryLabel(category: string): string {
  return (PROJECT_CATEGORY_LABELS as Record<string, string>)[category] ?? category;
}

/** Exact percent from BigInt cents (display only — money never floats). */
function progressPct(pledgedTotalCoin: string, goalCoin: string): number {
  const goal = coinToCents(goalCoin);
  if (goal <= 0n) return 0;
  const pct = Number((coinToCents(pledgedTotalCoin) * 10000n) / goal) / 100;
  return Math.max(0, Math.min(100, pct));
}

export function InvestApp() {
  const [tab, setTab] = useState<Tab>("invest");
  return (
    <div className={`wrap ${styles.stack}`}>
      <div>
        <div className="kicker">CIVIC FUNDRAISING</div>
        <h2 style={{ fontSize: 32, marginTop: 10 }}>Projects &amp; investment</h2>
        <p className={styles.lede}>
          Citizens fund citizen projects. Filings gather endorsements, the Cabinet activates them,
          and backers pledge. {NON_CUSTODIAL_NOTICE}
        </p>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Investment sections">
        {TAB_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`invest-tab-${key}`}
            aria-selected={tab === key}
            aria-controls={tab === key ? `invest-panel-${key}` : undefined}
            tabIndex={tab === key ? 0 : -1}
            className={`${styles.tab} ${tab === key ? styles.tabActive : ""}`}
            onClick={() => setTab(key)}
            onKeyDown={(e) => {
              const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              if (!dir) return;
              e.preventDefault();
              const next =
                TAB_ORDER[(TAB_ORDER.indexOf(tab) + dir + TAB_ORDER.length) % TAB_ORDER.length];
              setTab(next);
              document.getElementById(`invest-tab-${next}`)?.focus();
            }}
            data-testid={`invest-tab-${key}`}
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`invest-panel-${tab}`} aria-labelledby={`invest-tab-${tab}`}>
        {tab === "invest" && <InvestPanel />}
        {tab === "queue" && <QueuePanel />}
        {tab === "pledges" && <MyPledgesPanel />}
        {tab === "fundraiser" && <MyFundraiserPanel />}
      </div>
    </div>
  );
}

function useProjects(qs: string) {
  const [state, setState] = useState<Load<ProjectItem[]>>({ status: "loading" });
  const load = useCallback(() => {
    setState({ status: "loading" });
    fetch(`/api/invest/projects${qs}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: { projects: ProjectItem[] }) => setState({ status: "ok", data: d.projects }))
      .catch(() => setState({ status: "error" }));
  }, [qs]);
  useEffect(() => {
    load();
  }, [load]);
  return { state, load };
}

/* ── INVEST (browse ACTIVE) ── */

function InvestPanel() {
  const { state, load } = useProjects("");
  return (
    <div className={styles.panelStack}>
      {state.status === "loading" && <Skeletons lines={4} />}
      {state.status === "error" && (
        <ErrorBox>
          Could not load the fundraising board.{" "}
          <button type="button" className={styles.actionBtn} onClick={load}>
            Retry
          </button>
        </ErrorBox>
      )}
      {state.status === "ok" && state.data.length === 0 && (
        <div className="empty-state" data-testid="invest-empty">
          No active fundraisers on the board yet.
        </div>
      )}
      {state.status === "ok" &&
        state.data.map((p) => <ProjectCard key={p.id} project={p} onChanged={load} />)}
    </div>
  );
}

function ProgressBlock({ project }: { project: ProjectItem }) {
  const pct = progressPct(project.pledgedTotalCoin, project.goalCoin);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        className={styles.track}
        role="img"
        aria-label={`${formatCoin(project.pledgedTotalCoin)} pledged of the ${formatCoin(project.goalCoin)} goal`}
      >
        <div className={styles.fill} style={{ width: `${pct}%` }} />
      </div>
      <div className={styles.progressLine}>
        <span data-testid="pledged-line">
          {formatCoin(project.pledgedTotalCoin)} of {formatCoin(project.goalCoin)}
        </span>
        <span className={styles.progressCount}>
          {project.pledgeCount} {project.pledgeCount === 1 ? "citizen" : "citizens"} pledged
        </span>
      </div>
    </div>
  );
}

function TreasuryBlock({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // clipboard unavailable — the address stays selectable text
    }
  }
  return (
    <div className={styles.treasury}>
      <span className={styles.microLabel}>Treasury address · wallet-to-wallet</span>
      <p className={styles.addr} data-testid="treasury-addr">
        {address}
      </p>
      <div className={styles.btnRow}>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={copy}
          data-testid="copy-treasury-btn"
        >
          Copy treasury address
        </button>
        <span className={styles.live} aria-live="polite">
          {copied ? <span className={styles.liveOk}>Copied.</span> : null}
        </span>
      </div>
    </div>
  );
}

function ProjectCard({ project, onChanged }: { project: ProjectItem; onChanged: () => void }) {
  return (
    <section className={styles.card} data-testid="project-card">
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>{project.title}</h3>
        <div className={styles.cardBadges}>
          <span className={styles.categoryTag}>{categoryLabel(project.category)}</span>
          <ProjectStatusPill status={project.status} />
        </div>
      </div>
      <div className={styles.cardMeta}>
        <span className={styles.metaText}>{project.creatorDisplay}</span>
        <span className={styles.metaText}>Filed {formatDate(project.createdAt)}</span>
      </div>
      <p className={styles.summary}>{project.summary}</p>
      <ProgressBlock project={project} />
      {project.treasuryAddress && <TreasuryBlock address={project.treasuryAddress} />}
      <PledgeZone project={project} onChanged={onChanged} />
    </section>
  );
}

function PledgeZone({ project, onChanged }: { project: ProjectItem; onChanged: () => void }) {
  const [amending, setAmending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const standing = project.myPledge?.status === "PLEDGED" ? project.myPledge : null;

  async function withdraw() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/invest/pledges/withdraw", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ projectId: project.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "The withdrawal was refused.");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The withdrawal was refused.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (project.mine) {
    return (
      <div className={styles.pledgeForm}>
        <p className={styles.hint}>Your own filing — you cannot pledge to it.</p>
      </div>
    );
  }

  if (standing && !amending) {
    return (
      <div className={styles.pledgeForm} data-testid="my-pledge-block">
        <div className={styles.cardMeta}>
          <span className={styles.microLabel}>Your pledge</span>
          <span className={styles.amount}>{formatCoin(standing.amountCoin)}</span>
          <PledgeStatusPill status={standing.status} />
        </div>
        {standing.note && <p className={styles.pledgeNote}>{standing.note}</p>}
        <div className={styles.btnRow}>
          {!confirming && (
            <>
              <button
                type="button"
                className={styles.actionBtn}
                disabled={busy}
                onClick={() => setAmending(true)}
                data-testid="amend-pledge-btn"
              >
                Amend pledge
              </button>
              <button
                type="button"
                className={styles.actionBtn}
                disabled={busy}
                onClick={() => setConfirming(true)}
                data-testid="withdraw-pledge-btn"
              >
                Withdraw pledge
              </button>
            </>
          )}
          {confirming && (
            <>
              <span className={styles.microLabel}>Withdraw this pledge?</span>
              <button
                type="button"
                className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                disabled={busy}
                onClick={withdraw}
                data-testid="withdraw-pledge-confirm-btn"
              >
                {busy ? "Withdrawing…" : "Confirm withdrawal"}
              </button>
              <button
                type="button"
                className={styles.actionBtn}
                disabled={busy}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
            </>
          )}
        </div>
        <div aria-live="polite" className={styles.live}>
          {error && <ErrorBox>{error}</ErrorBox>}
        </div>
        <p className={styles.notice}>{NON_CUSTODIAL_NOTICE}</p>
      </div>
    );
  }

  return (
    <PledgeForm
      projectId={project.id}
      initialAmount={amending ? (standing?.amountCoin ?? "") : ""}
      initialNote={amending ? (standing?.note ?? "") : ""}
      onDone={() => {
        setAmending(false);
        onChanged();
      }}
      onCancel={amending ? () => setAmending(false) : undefined}
    />
  );
}

function PledgeForm({
  projectId,
  initialAmount,
  initialNote,
  onDone,
  onCancel,
}: {
  projectId: string;
  initialAmount: string;
  initialNote: string;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [amount, setAmount] = useState(initialAmount);
  const [note, setNote] = useState(initialNote);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountError = !validCoinAmount(amount)
    ? "Enter a decimal amount up to 10,000,000 $CRYPT with at most 2 decimal places."
    : null;
  const noteError = note.length > 280 ? "Note cannot exceed 280 characters." : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (amountError || noteError) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { projectId, amountCoin: amount };
      if (note.trim() !== "") body.note = note.trim();
      const res = await fetch("/api/invest/pledges", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "The pledge was refused.");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The pledge was refused.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.pledgeForm} onSubmit={submit} noValidate data-testid="pledge-form">
      <div className={styles.pledgeControls}>
        <div className={styles.field}>
          <label htmlFor={`pledge-amount-${projectId}`} className={styles.microLabel}>
            Pledge amount
          </label>
          <div className={styles.amountWrap}>
            <input
              id={`pledge-amount-${projectId}`}
              className={styles.input}
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="100.00"
              aria-invalid={Boolean(touched && amountError)}
              aria-describedby={`pledge-amount-error-${projectId}`}
              data-testid="pledge-amount-input"
            />
            <span className={styles.amountSuffix} aria-hidden="true">
              $CRYPT
            </span>
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor={`pledge-note-${projectId}`} className={styles.microLabel}>
            Note (optional)
          </label>
          <input
            id={`pledge-note-${projectId}`}
            className={`${styles.input} ${styles.noteInput}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={280}
            data-testid="pledge-note-input"
          />
        </div>
        <button
          type="submit"
          className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
          disabled={busy}
          data-testid="pledge-submit"
        >
          {busy ? "Recording…" : initialAmount ? "Amend pledge" : "Pledge"}
        </button>
        {onCancel && (
          <button type="button" className={styles.actionBtn} disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      <div id={`pledge-amount-error-${projectId}`} aria-live="polite" className={styles.live}>
        {touched && amountError && <p className={styles.fieldError}>{amountError}</p>}
        {touched && noteError && <p className={styles.fieldError}>{noteError}</p>}
        {error && (
          <div className={styles.errorBox} role="alert">
            {error}
          </div>
        )}
      </div>
      <p className={styles.notice}>{NON_CUSTODIAL_NOTICE}</p>
    </form>
  );
}

/* ── ENDORSEMENT QUEUE (SUBMITTED) ── */

function QueuePanel() {
  const { state, load } = useProjects("?status=SUBMITTED");
  return (
    <div className={styles.panelStack}>
      {state.status === "loading" && <Skeletons lines={4} />}
      {state.status === "error" && (
        <ErrorBox>
          Could not load the endorsement queue.{" "}
          <button type="button" className={styles.actionBtn} onClick={load}>
            Retry
          </button>
        </ErrorBox>
      )}
      {state.status === "ok" && state.data.length === 0 && (
        <div className="empty-state" data-testid="queue-empty">
          No filings awaiting endorsement.
        </div>
      )}
      {state.status === "ok" &&
        state.data.map((p) => <QueueCard key={p.id} project={p} onChanged={load} />)}
    </div>
  );
}

function QueueCard({ project, onChanged }: { project: ProjectItem; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/invest/projects/${project.id}/endorse`, {
        method: project.myEndorsement ? "DELETE" : "POST",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "The endorsement was refused.");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The endorsement was refused.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.card} data-testid="queue-card">
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>{project.title}</h3>
        <div className={styles.cardBadges}>
          <span className={styles.categoryTag}>{categoryLabel(project.category)}</span>
          <ProjectStatusPill status={project.status} />
          {project.communityBacked && <CommunityBackedBadge />}
        </div>
      </div>
      <div className={styles.cardMeta}>
        <span className={styles.metaText}>{project.creatorDisplay}</span>
        <span className={styles.metaText}>Filed {formatDate(project.createdAt)}</span>
        <span className={styles.metaText} data-testid="endorsement-count">
          {project.endorsementCount} of {COMMUNITY_BACKED_THRESHOLD} endorsements
        </span>
      </div>
      <p className={styles.summary}>{project.summary}</p>
      {project.mine ? (
        <p className={styles.hint} data-testid="own-filing-note">
          Your filing — awaiting the Cabinet.
        </p>
      ) : (
        <div className={styles.btnRow}>
          <button
            type="button"
            className={styles.actionBtn}
            aria-pressed={project.myEndorsement}
            disabled={busy}
            onClick={toggle}
            data-testid="endorse-btn"
          >
            {busy ? "Recording…" : project.myEndorsement ? "Withdraw endorsement" : "Endorse"}
          </button>
        </div>
      )}
      <div aria-live="polite" className={styles.live}>
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </section>
  );
}

/* ── MY PLEDGES ── */

interface PledgeRow {
  projectId: string;
  projectTitle: string;
  projectStatus: string;
  goalCoin: string;
  amountCoin: string;
  note: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

function MyPledgesPanel() {
  const [state, setState] = useState<Load<PledgeRow[]>>({ status: "loading" });
  const load = useCallback(() => {
    setState({ status: "loading" });
    fetch("/api/invest/pledges", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: { pledges: PledgeRow[] }) => setState({ status: "ok", data: d.pledges }))
      .catch(() => setState({ status: "error" }));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className={styles.panelStack}>
      {state.status === "loading" && <Skeletons lines={4} />}
      {state.status === "error" && (
        <ErrorBox>
          Could not load your pledge ledger.{" "}
          <button type="button" className={styles.actionBtn} onClick={load}>
            Retry
          </button>
        </ErrorBox>
      )}
      {state.status === "ok" && state.data.length === 0 && (
        <div className="empty-state" data-testid="pledges-empty">
          You have pledged to no project yet.
        </div>
      )}
      {state.status === "ok" &&
        state.data.map((p) => <MyPledgeRow key={p.projectId} row={p} onChanged={load} />)}
      {state.status === "ok" && state.data.length > 0 && (
        <p className={styles.notice}>{NON_CUSTODIAL_NOTICE}</p>
      )}
    </div>
  );
}

function MyPledgeRow({ row, onChanged }: { row: PledgeRow; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withdraw() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/invest/pledges/withdraw", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ projectId: row.projectId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "The withdrawal was refused.");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The withdrawal was refused.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div className={styles.row} data-testid="my-pledge-row">
      <div className={styles.rowMain}>
        <p className={styles.rowTitle}>{row.projectTitle}</p>
        <div className={styles.cardMeta}>
          <span className={styles.amount}>{formatCoin(row.amountCoin)}</span>
          <ProjectStatusPill status={row.projectStatus} />
          <PledgeStatusPill status={row.status} />
          <span className={styles.metaText}>Updated {formatDate(row.updatedAt)}</span>
        </div>
        {row.note && <p className={styles.pledgeNote}>{row.note}</p>}
        <div aria-live="polite" className={styles.live}>
          {error && <ErrorBox>{error}</ErrorBox>}
        </div>
      </div>
      {row.status === "PLEDGED" && (
        <div className={styles.rowActions}>
          {!confirming && (
            <button
              type="button"
              className={styles.actionBtn}
              disabled={busy}
              onClick={() => setConfirming(true)}
              data-testid="ledger-withdraw-btn"
            >
              Withdraw
            </button>
          )}
          {confirming && (
            <>
              <span className={styles.microLabel}>Withdraw this pledge?</span>
              <button
                type="button"
                className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                disabled={busy}
                onClick={withdraw}
                data-testid="ledger-withdraw-confirm-btn"
              >
                {busy ? "Withdrawing…" : "Confirm withdrawal"}
              </button>
              <button
                type="button"
                className={styles.actionBtn}
                disabled={busy}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── MY FUNDRAISER ── */

function MyFundraiserPanel() {
  const { state, load } = useProjects("?mine=1");

  if (state.status === "loading") return <Skeletons lines={4} />;
  if (state.status === "error") {
    return (
      <ErrorBox>
        Could not load your filings.{" "}
        <button type="button" className={styles.actionBtn} onClick={load}>
          Retry
        </button>
      </ErrorBox>
    );
  }

  const open = state.data.find((p) => p.status === "SUBMITTED" || p.status === "ACTIVE");
  const past = state.data.filter((p) => p.id !== open?.id);

  return (
    <div className={styles.panelStack}>
      {open ? (
        <FundraiserCard project={open} onChanged={load} />
      ) : (
        <section className={styles.card}>
          <h2 className={styles.microLabel}>File a fundraiser · one open filing per citizen</h2>
          <NewProjectForm onDone={load} />
        </section>
      )}
      {past.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.microLabel}>Past filings</h2>
          {past.map((p) => (
            <div key={p.id} className={styles.cardMeta} data-testid="past-filing-row">
              <span className={styles.rowTitle}>{p.title}</span>
              <ProjectStatusPill status={p.status} />
              <span className={styles.metaText}>Filed {formatDate(p.createdAt)}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

interface CreatorPledge {
  pledgerDisplay: string;
  amountCoin: string;
  note: string | null;
  status: string;
  createdAt: string;
}

function FundraiserCard({ project, onChanged }: { project: ProjectItem; onChanged: () => void }) {
  const [ledger, setLedger] = useState<Load<CreatorPledge[]>>({ status: "loading" });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLedger = useCallback(() => {
    setLedger({ status: "loading" });
    fetch(`/api/invest/projects/${project.id}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: { pledges: CreatorPledge[] | null }) =>
        setLedger({ status: "ok", data: d.pledges ?? [] }),
      )
      .catch(() => setLedger({ status: "error" }));
  }, [project.id]);
  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  async function withdrawFiling() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/invest/projects/${project.id}/withdraw`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: "{}",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "The withdrawal was refused.");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The withdrawal was refused.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <section className={styles.card} data-testid="fundraiser-card">
      <h2 className={styles.microLabel}>Your fundraiser · registry record</h2>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>{project.title}</h3>
        <div className={styles.cardBadges}>
          <span className={styles.categoryTag}>{categoryLabel(project.category)}</span>
          <ProjectStatusPill status={project.status} />
          {project.communityBacked && <CommunityBackedBadge />}
        </div>
      </div>
      <p className={styles.hint}>
        {project.status === "SUBMITTED"
          ? `Gathering endorsements — at ${COMMUNITY_BACKED_THRESHOLD} your filing is community-backed and goes to the Cabinet for review.`
          : "Approved by the Cabinet — open for pledges."}
      </p>
      <div className={styles.statsGrid}>
        <div>
          <span className={styles.microLabel}>Endorsements</span>
          <div className={styles.statValue} data-testid="fundraiser-endorsements">
            {project.endorsementCount} / {COMMUNITY_BACKED_THRESHOLD}
          </div>
        </div>
        <div>
          <span className={styles.microLabel}>Citizens pledged</span>
          <div className={styles.statValue}>{project.pledgeCount}</div>
        </div>
        <div>
          <span className={styles.microLabel}>Pledged so far</span>
          <div className={styles.statValue}>{formatCoin(project.pledgedTotalCoin)}</div>
        </div>
        <div>
          <span className={styles.microLabel}>Goal</span>
          <div className={styles.statValue}>{formatCoin(project.goalCoin)}</div>
        </div>
      </div>
      <ProgressBlock project={project} />
      {project.treasuryAddress && <TreasuryBlock address={project.treasuryAddress} />}

      <div>
        <h3 className={styles.microLabel} style={{ fontSize: 11 }}>
          Pledge ledger · visible to you alone
        </h3>
        <div className={styles.panelStack} style={{ marginTop: 10 }}>
          {ledger.status === "loading" && <Skeletons lines={2} />}
          {ledger.status === "error" && (
            <ErrorBox>
              Could not load the pledge ledger.{" "}
              <button type="button" className={styles.actionBtn} onClick={loadLedger}>
                Retry
              </button>
            </ErrorBox>
          )}
          {ledger.status === "ok" && ledger.data.length === 0 && (
            <div className="empty-state">No pledges recorded yet.</div>
          )}
          {ledger.status === "ok" &&
            ledger.data.map((p, i) => (
              <div key={i} className={styles.row} data-testid="creator-pledge-row">
                <div className={styles.rowMain}>
                  <div className={styles.cardMeta}>
                    <span className={styles.metaText}>{p.pledgerDisplay}</span>
                    <span className={styles.amount}>{formatCoin(p.amountCoin)}</span>
                    <PledgeStatusPill status={p.status} />
                    <span className={styles.metaText}>{formatDate(p.createdAt)}</span>
                  </div>
                  {p.note && <p className={styles.pledgeNote}>{p.note}</p>}
                </div>
              </div>
            ))}
        </div>
      </div>

      <div className={styles.btnRow}>
        {!confirming && (
          <button
            type="button"
            className={styles.actionBtn}
            disabled={busy}
            onClick={() => setConfirming(true)}
            data-testid="withdraw-filing-btn"
          >
            Withdraw filing
          </button>
        )}
        {confirming && (
          <>
            <span className={styles.microLabel}>Withdraw this fundraiser? This is final.</span>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
              disabled={busy}
              onClick={withdrawFiling}
              data-testid="withdraw-filing-confirm-btn"
            >
              {busy ? "Withdrawing…" : "Confirm withdrawal"}
            </button>
            <button
              type="button"
              className={styles.actionBtn}
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </>
        )}
      </div>
      <div aria-live="polite" className={styles.live}>
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
      <p className={styles.notice}>{NON_CUSTODIAL_NOTICE}</p>
    </section>
  );
}
