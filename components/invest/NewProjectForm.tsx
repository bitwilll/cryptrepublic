"use client";
import { useState } from "react";
import { getAddress } from "viem";
import { PROJECT_CATEGORIES, PROJECT_CATEGORY_LABELS } from "@/lib/gov/types";
import { validCoinAmount } from "@/lib/validation/invest";
import { formatCoin, formatDate } from "@/lib/store/format";
import { NON_CUSTODIAL_NOTICE, ProjectStatusPill } from "./bits";
import styles from "./invest.module.css";

/**
 * File a fundraiser (Wave 16). Live client validation MIRRORS
 * lib/validation/invest.ts createProjectSchema exactly (title 4..80, summary
 * 20..280, description 40..4000, category union, goal decimal string, the
 * OPTIONAL treasury address checksummed via viem getAddress — the same check
 * the server re-runs). Success renders a filing receipt explaining the path:
 * SUBMITTED → 7 citizen endorsements (community-backed) → Cabinet review →
 * ACTIVE. The Republic never holds funds at any step.
 */

const AMOUNT_RE = /^(?:\d{1,8})(?:\.\d{1,2})?$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function validateTitle(v: string): string | null {
  const t = v.trim();
  if (t.length < 4) return "Title must be at least 4 characters.";
  if (t.length > 80) return "Title cannot exceed 80 characters.";
  return null;
}
function validateSummary(v: string): string | null {
  const t = v.trim();
  if (t.length < 20) return "Summary must be at least 20 characters.";
  if (t.length > 280) return "Summary cannot exceed 280 characters.";
  return null;
}
function validateDescription(v: string): string | null {
  const t = v.trim();
  if (t.length < 40) return "Description must be at least 40 characters.";
  if (t.length > 4000) return "Description cannot exceed 4000 characters.";
  return null;
}
function validateGoal(v: string): string | null {
  if (!AMOUNT_RE.test(v)) {
    return "Enter a decimal amount with at most 2 decimal places, e.g. 2500.00.";
  }
  if (!validCoinAmount(v)) {
    return Number(v) <= 0
      ? "Goal must be greater than zero."
      : "Goal cannot exceed 10,000,000 $CRYPT.";
  }
  return null;
}
function validateTreasury(v: string): string | null {
  if (v === "") return null; // optional
  if (!ADDRESS_RE.test(v)) return "Must be a 0x… EVM address (40 hex characters).";
  try {
    if (getAddress(v) !== v) {
      return "Address must match its EIP-55 checksum exactly — paste the mixed-case form.";
    }
  } catch {
    return "Address must match its EIP-55 checksum exactly — paste the mixed-case form.";
  }
  return null;
}

interface FiledProject {
  id: string;
  title: string;
  category: string;
  goalCoin: string;
  treasuryAddress: string | null;
  status: string;
  createdAt: string;
}

export function NewProjectForm({ onDone }: { onDone?: () => void }) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("INFRASTRUCTURE");
  const [goal, setGoal] = useState("");
  const [treasury, setTreasury] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filed, setFiled] = useState<FiledProject | null>(null);

  const errors = {
    title: validateTitle(title),
    summary: validateSummary(summary),
    description: validateDescription(description),
    goal: validateGoal(goal),
    treasury: validateTreasury(treasury.trim()),
  };
  const valid = Object.values(errors).every((e) => e === null);

  function touch(name: string) {
    setTouched((t) => ({ ...t, [name]: true }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ title: true, summary: true, description: true, goal: true, treasury: true });
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        summary: summary.trim(),
        description: description.trim(),
        category,
        goalCoin: goal,
      };
      if (treasury.trim() !== "") body.treasuryAddress = treasury.trim();
      const res = await fetch("/api/invest/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        project?: FiledProject;
      };
      if (!res.ok || !data.project) throw new Error(data.error ?? "The filing was refused.");
      setFiled(data.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The filing was refused.");
    } finally {
      setBusy(false);
    }
  }

  if (filed) {
    return (
      <div className={styles.receipt} data-testid="project-receipt">
        <div>
          <span className={styles.microLabel} style={{ color: "var(--success)" }}>
            Filing accepted
          </span>
          <h3 style={{ marginTop: 8, fontSize: 18 }}>Fundraiser entered on the Registry</h3>
        </div>
        <div className={styles.receiptGrid}>
          <div>
            <span className={styles.microLabel}>Registry reference</span>
            <div className={`${styles.receiptValue} ${styles.receiptSerial}`}>{filed.id}</div>
          </div>
          <div>
            <span className={styles.microLabel}>Title</span>
            <div className={styles.receiptValue}>{filed.title}</div>
          </div>
          <div>
            <span className={styles.microLabel}>Goal</span>
            <div className={`${styles.receiptValue} ${styles.receiptSerial}`}>
              {formatCoin(filed.goalCoin)}
            </div>
          </div>
          <div>
            <span className={styles.microLabel}>Status</span>
            <div className={styles.receiptValue}>
              <ProjectStatusPill status={filed.status} />
            </div>
          </div>
          <div>
            <span className={styles.microLabel}>Filed</span>
            <div className={styles.receiptValue}>{formatDate(filed.createdAt)}</div>
          </div>
        </div>
        <p className={styles.summary}>
          What happens next: your filing sits on the <strong>endorsement queue</strong>, where
          fellow citizens can endorse it — at 7 endorsements it is marked community-backed. The
          Cabinet then reviews the filing; on approval it goes <strong>active</strong> and citizens
          can pledge to it.
        </p>
        <p className={styles.notice}>{NON_CUSTODIAL_NOTICE}</p>
        {onDone && (
          <div className={styles.btnRow}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onDone}
              data-testid="receipt-done"
            >
              View my fundraiser
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={styles.form} noValidate data-testid="new-project-form">
      <div className={styles.field}>
        <label htmlFor="project-title" className={styles.microLabel}>
          Title (4–80 characters)
        </label>
        <input
          id="project-title"
          className={styles.input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => touch("title")}
          maxLength={80}
          aria-invalid={Boolean(touched.title && errors.title)}
          aria-describedby="project-title-error"
          data-testid="project-title-input"
        />
        <div id="project-title-error" aria-live="polite">
          {touched.title && errors.title && <p className={styles.fieldError}>{errors.title}</p>}
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="project-summary" className={styles.microLabel}>
          Summary (20–280 characters)
        </label>
        <textarea
          id="project-summary"
          className={styles.textarea}
          style={{ minHeight: 70 }}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          onBlur={() => touch("summary")}
          maxLength={280}
          aria-invalid={Boolean(touched.summary && errors.summary)}
          aria-describedby="project-summary-error"
          data-testid="project-summary-input"
        />
        <div id="project-summary-error" aria-live="polite">
          {touched.summary && errors.summary && (
            <p className={styles.fieldError}>{errors.summary}</p>
          )}
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="project-description" className={styles.microLabel}>
          Description (40–4000 characters)
        </label>
        <textarea
          id="project-description"
          className={styles.textarea}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => touch("description")}
          maxLength={4000}
          aria-invalid={Boolean(touched.description && errors.description)}
          aria-describedby="project-description-error"
          data-testid="project-description-input"
        />
        <p className={styles.hint}>{description.trim().length}/4000</p>
        <div id="project-description-error" aria-live="polite">
          {touched.description && errors.description && (
            <p className={styles.fieldError}>{errors.description}</p>
          )}
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="project-category" className={styles.microLabel}>
          Category
        </label>
        <select
          id="project-category"
          className={styles.select}
          style={{ maxWidth: 260 }}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          data-testid="project-category-select"
        >
          {PROJECT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {PROJECT_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="project-goal" className={styles.microLabel}>
          Funding goal
        </label>
        <div className={styles.amountWrap}>
          <input
            id="project-goal"
            className={styles.input}
            inputMode="decimal"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onBlur={() => touch("goal")}
            placeholder="2500.00"
            aria-invalid={Boolean(touched.goal && errors.goal)}
            aria-describedby="project-goal-error project-goal-hint"
            data-testid="project-goal-input"
          />
          <span className={styles.amountSuffix} aria-hidden="true">
            $CRYPT
          </span>
        </div>
        <p id="project-goal-hint" className={styles.hint}>
          Up to 10,000,000 $CRYPT, at most 2 decimal places.
        </p>
        <div id="project-goal-error" aria-live="polite">
          {touched.goal && errors.goal && <p className={styles.fieldError}>{errors.goal}</p>}
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="project-treasury" className={styles.microLabel}>
          Treasury address (optional)
        </label>
        <input
          id="project-treasury"
          className={`${styles.input} ${styles.mono}`}
          value={treasury}
          onChange={(e) => setTreasury(e.target.value)}
          onBlur={() => touch("treasury")}
          placeholder="0x…"
          spellCheck={false}
          autoComplete="off"
          aria-invalid={Boolean(touched.treasury && errors.treasury)}
          aria-describedby="project-treasury-error project-treasury-hint"
          data-testid="project-treasury-input"
        />
        <p id="project-treasury-hint" className={styles.hint}>
          A checksummed EVM address, published so backers can contribute wallet-to-wallet. The
          Republic never touches it.
        </p>
        <div id="project-treasury-error" aria-live="polite">
          {touched.treasury && errors.treasury && (
            <p className={styles.fieldError}>{errors.treasury}</p>
          )}
        </div>
      </div>

      <p className={styles.notice}>{NON_CUSTODIAL_NOTICE}</p>

      <div aria-live="polite">
        {error && (
          <div className={styles.errorBox} role="alert">
            {error}
          </div>
        )}
      </div>

      <div>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || (Object.keys(touched).length > 0 && !valid)}
          data-testid="project-submit"
        >
          {busy ? "Filing…" : "File the fundraiser"}
        </button>
      </div>
    </form>
  );
}
