"use client";
import styles from "../mint.module.css";

export interface WitnessStepProps {
  collected: number;
  required: number;
  ready: boolean;
  onReadyChange: (ready: boolean) => void;
}

/**
 * The Witness step: a grid of tiles WAITING → SIGNED driven by the REAL collected
 * count from `/api/applications/witnesses/*`. In the bootstrap/local flow sigs are
 * gathered via the `/dashboard/witness` surface (Task 9) or the e2e signers; full
 * social witness-discovery UX is a documented follow-up (spec §7.4).
 */
export function MintWitnessStep({
  collected,
  required,
  ready,
  onReadyChange,
}: WitnessStepProps): React.ReactElement {
  const tiles = Array.from({ length: required });
  return (
    <div>
      <span className={styles.tag}>STEP 03 OF 04 · WITNESS</span>
      <h2 className={styles.heading}>Seven witnesses, signing.</h2>
      <p className={styles.lede}>
        Existing citizens are attesting your induction. Their signatures will be bound to your
        passport in perpetuity. Collected {collected} of {required}.
      </p>
      <div className={styles.witnessGrid}>
        {tiles.map((_v, i) => {
          const signed = i < collected;
          return (
            <div
              key={i}
              className={`${styles.tile} ${signed ? styles.tileSigned : ""}`.trim()}
              data-testid={`witness-tile-${i}`}
            >
              <div
                className={`${styles.tileAvatar} ${signed ? styles.tileAvatarSigned : ""}`.trim()}
              >
                {signed ? "✓" : i + 1}
              </div>
              <div className={styles.tileNum}>№{String(i + 1).padStart(2, "0")}</div>
              <div className={`${styles.tileState} ${signed ? styles.tileStateSigned : ""}`.trim()}>
                {signed ? "SIGNED" : "WAITING"}
              </div>
            </div>
          );
        })}
      </div>
      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={ready}
          disabled={collected < required}
          onChange={(e) => onReadyChange(e.target.checked)}
          aria-label="Accept witness signatures"
        />
        <span className={styles.checkText}>
          I have read and accept the signatures of my witnesses. I am ready to be sealed.
        </span>
      </label>
    </div>
  );
}
