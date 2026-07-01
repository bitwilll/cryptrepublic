"use client";
import styles from "../mint.module.css";

export interface OathForm {
  motto: string;
  accepted: boolean;
}

export const OATH_TEXT =
  '"I, the undersigned, freely seek citizenship of CryptRepublic. I will vote on every matter ' +
  "brought before the Republic, will attest only what I have witnessed, will respect every other " +
  "citizen as my equal, and will hold no allegiance higher than my conscience. So sealed, so " +
  'sworn."';

export function MintOathStep({
  form,
  onChange,
}: {
  form: OathForm;
  onChange: (patch: Partial<OathForm>) => void;
}): React.ReactElement {
  return (
    <div>
      <span className={styles.tag}>STEP 02 OF 04 · BIND YOUR OATH</span>
      <h2 className={styles.heading}>The oath of entry.</h2>
      <div className={styles.oathBox}>{OATH_TEXT}</div>
      <label className={styles.field} style={{ marginTop: 22, maxWidth: 560 }}>
        <span className={styles.fieldLabel}>A PERSONAL MOTTO (inscribed on your passport)</span>
        <input
          className={styles.input}
          value={form.motto}
          onChange={(e) => onChange({ motto: e.target.value })}
          placeholder="e.g. Recognized in time."
          aria-label="Personal motto"
        />
      </label>
      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={form.accepted}
          onChange={(e) => onChange({ accepted: e.target.checked })}
          aria-label="Accept the constitution"
        />
        <span className={styles.checkText}>
          I accept the Constitution of the Republic in its current form (ratified MMXXVI), and
          acknowledge that my passport, once sealed, cannot be sold, transferred, or revoked.
        </span>
      </label>
    </div>
  );
}
