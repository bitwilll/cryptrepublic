"use client";
import { Fragment } from "react";
import styles from "../mint.module.css";

export const MINT_STEPS = ["Attest", "Oath", "Witness", "Seal"] as const;

/**
 * The 4-step progress header, ported from dash-mint.jsx. `step` is the active
 * index (0..3); `sealed` marks the whole flow complete.
 */
export function MintStepper({
  step,
  sealed = false,
}: {
  step: number;
  sealed?: boolean;
}): React.ReactElement {
  return (
    <div className={styles.stepper}>
      {MINT_STEPS.map((label, i) => {
        const done = i < step || sealed;
        const active = i === step && !sealed;
        const badgeClass = done ? styles.badgeDone : active ? styles.badgeActive : "";
        return (
          <Fragment key={label}>
            <div className={styles.step}>
              <div
                className={`${styles.badge} ${badgeClass}`.trim()}
                data-testid={`step-badge-${i}`}
              >
                {done ? "✓" : `0${i + 1}`}
              </div>
              <span
                className={`${styles.stepLabel} ${i === step ? styles.stepLabelActive : ""}`.trim()}
              >
                {label.toUpperCase()}
              </span>
            </div>
            {i < MINT_STEPS.length - 1 && (
              <div
                className={`${styles.connector} ${i < step ? styles.connectorDone : ""}`.trim()}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
