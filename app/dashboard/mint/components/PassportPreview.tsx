"use client";
import styles from "../mint.module.css";

export interface PassportPreviewProps {
  /** Citizen number / tokenId (or a placeholder while unsealed). */
  no: string;
  /** Display name (uppercased). */
  name: string;
  /** Domicile city line. */
  domicile?: string;
  /** Motto line. */
  motto?: string;
  /** Issued marker (block / "AWAITING SEAL"). */
  issued: string;
}

/**
 * The live passport preview. Ported from dash-mint.jsx <PassportPreview>. Used
 * both in the mint flow (draft, updates live) and on "Your Passport" (sealed).
 */
export function PassportPreview({
  no,
  name,
  domicile,
  motto,
  issued,
}: PassportPreviewProps): React.ReactElement {
  return (
    <div className={styles.passport}>
      <div className={styles.passportHead}>
        <span>CRYPTREPUBLIC · PASSPORT</span>
        <span>CRPASS</span>
      </div>
      <div className={styles.passportName}>{name}</div>
      <div className={styles.passportRow}>
        <span>DOMICILE</span>
        <span>{domicile || "—"}</span>
      </div>
      {motto ? (
        <div className={styles.passportRow}>
          <span>MOTTO</span>
          <span>{motto}</span>
        </div>
      ) : null}
      <div className={styles.passportRow}>
        <span>ISSUED</span>
        <span>{issued}</span>
      </div>
      <div className={styles.passportNo}>№ {no}</div>
    </div>
  );
}
