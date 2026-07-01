"use client";
import styles from "../mint.module.css";

export interface AttestForm {
  name: string;
  city: string;
  country: string;
}

export function MintAttestStep({
  form,
  onChange,
}: {
  form: AttestForm;
  onChange: (patch: Partial<AttestForm>) => void;
}): React.ReactElement {
  return (
    <div>
      <span className={styles.tag}>STEP 01 OF 04 · ~3 MINUTES</span>
      <h2 className={styles.heading}>Attest who you are.</h2>
      <p className={styles.lede}>
        Your name and place will be inscribed on your passport in perpetuity. You may not change
        them. Citizens of the Republic stand by what they have written.
      </p>
      <div className={styles.grid2}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>LEGAL OR CHOSEN NAME</span>
          <input
            className={styles.input}
            value={form.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="A. Nakadai"
            aria-label="Legal or chosen name"
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>DOMICILE CITY</span>
          <input
            className={styles.input}
            value={form.city}
            onChange={(e) => onChange({ city: e.target.value })}
            aria-label="Domicile city"
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>HOST COUNTRY</span>
          <input
            className={styles.input}
            value={form.country}
            onChange={(e) => onChange({ country: e.target.value })}
            aria-label="Host country"
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>DATE OF BINDING</span>
          <input className={styles.input} disabled value="today" style={{ opacity: 0.6 }} />
        </label>
      </div>
    </div>
  );
}
