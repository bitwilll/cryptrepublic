"use client";
import { useState } from "react";
import styles from "../mint.module.css";

export interface PassportPreviewProps {
  /** Citizen number / tokenId (or a placeholder while unsealed). */
  no: string;
  /** Display name. */
  name: string;
  /** Domicile city line. */
  domicile?: string;
  /** Motto line. */
  motto?: string;
  /** Issued marker (block / "AWAITING SEAL" / a provisional status). */
  issued: string;
  /**
   * When true, the card becomes an NFT-style FLIPPABLE passport: click / Enter /
   * Space flips between the data page and an engraved reverse. Default false
   * keeps the static preview (mint draft).
   */
  flippable?: boolean;
}

/** ICAO-style machine-readable zone lines, derived from the holder name + number. */
function sanitizeMrz(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "<")
    .replace(/^<+|<+$/g, "");
}
function mrzLines(name: string, no: string): [string, string] {
  const nm = sanitizeMrz(name) || "PENDING<CITIZEN";
  const num = sanitizeMrz(!no || no === "—" ? "PENDING" : no);
  const line1 = `P<CRP${nm}`.padEnd(32, "<").slice(0, 32);
  const line2 = `${num.padEnd(9, "<")}CRP<${nm}`.padEnd(32, "<").slice(0, 32);
  return [line1, line2];
}

function Field({
  label,
  value,
  no,
}: {
  label: string;
  value: string;
  no?: boolean;
}): React.ReactElement {
  return (
    <div>
      <div className={styles.passportFieldLabel}>{label}</div>
      <div className={`${styles.passportFieldValue}${no ? ` ${styles.passportFieldNo}` : ""}`}>
        {value}
      </div>
    </div>
  );
}

/** The passport DATA PAGE (front). */
function PassportFace({
  no,
  name,
  domicile,
  motto,
  issued,
  hint,
}: PassportPreviewProps & { hint?: boolean }): React.ReactElement {
  const [mrz1, mrz2] = mrzLines(name, no);
  return (
    <div className={`${styles.passport} ${styles.passportFace}`}>
      <div className={styles.passportGuilloche} aria-hidden="true" />
      <div className={styles.passportWatermark} aria-hidden="true">
        CR
      </div>

      <div className={styles.passportHeader}>
        <span className={styles.passportEmblem} aria-hidden="true">
          ◈
        </span>
        <div className={styles.passportTitle}>
          <b>CRYPTREPUBLIC</b>
          <span>DIGITAL PASSPORT · THE NETWORK STATE</span>
        </div>
        <div className={styles.passportType}>
          TYPE / CODE
          <b>P · CRP</b>
        </div>
      </div>

      <div className={styles.passportBody}>
        <div className={styles.passportPortrait} aria-hidden="true">
          <div className={styles.passportSeal}>CR</div>
          <div className={styles.passportChip}>⬢</div>
          <div className={styles.passportSbt}>SOULBOUND</div>
        </div>
        <div className={styles.passportFields}>
          <div className={styles.passportFieldLabel}>Surname / Given names</div>
          <div className={styles.passportFieldName}>{name}</div>
          <div className={styles.passportFieldGrid}>
            <Field label="Nationality" value="CRYPTREPUBLIC" />
            <Field label="Domicile" value={domicile || "—"} />
            <Field label="Date of issue" value={issued} />
            <Field label="Passport №" value={no} no />
            {motto ? <Field label="Motto" value={motto} /> : null}
            <Field label="Authority" value="THE REPUBLIC" />
          </div>
        </div>
      </div>

      <div className={styles.passportMrz}>
        <div>{mrz1}</div>
        <div>{mrz2}</div>
      </div>

      {hint ? (
        <span className={styles.passportFlipHint} aria-hidden="true">
          ⟳ FLIP
        </span>
      ) : null}
    </div>
  );
}

/** The engraved REVERSE — seal, motto, the soulbound covenant, and a security strip. */
function PassportBack({
  no,
  motto,
  issued,
}: Pick<PassportPreviewProps, "no" | "motto" | "issued">): React.ReactElement {
  return (
    <div className={`${styles.passport} ${styles.passportBack}`}>
      <div className={styles.passportGuilloche} aria-hidden="true" />
      <div className={styles.passportHeader}>
        <span className={styles.passportEmblem} aria-hidden="true">
          ◈
        </span>
        <div className={styles.passportTitle}>
          <b>CRYPTREPUBLIC</b>
          <span>OFFICIAL REVERSE · CRPASS</span>
        </div>
      </div>
      <div className={styles.passportBackBody}>
        <div className={styles.passportSealLg} aria-hidden="true">
          CR
        </div>
        <div className={styles.passportBackMotto}>{motto || "Civis Cryptrepublicae"}</div>
        <div className={styles.passportBackFlag}>◆ SOULBOUND · NON-TRANSFERABLE ◆</div>
        <p className={styles.passportBackNote}>
          This credential is bound to its holder and to the chain. It cannot be sold, sent, or
          transferred.
        </p>
        <div className={styles.passportFieldGrid}>
          <Field label="Issuing authority" value="THE REPUBLIC" />
          <Field label="Issued" value={issued} />
          <Field label="Chain" value="BASE" />
          <Field label="Passport №" value={no} no />
        </div>
        <div className={styles.passportBarcode} aria-hidden="true" />
      </div>
      <span className={styles.passportFlipHint} aria-hidden="true">
        ⟳ FLIP
      </span>
    </div>
  );
}

/**
 * The CryptRepublic digital passport preview. Used in the mint flow (draft,
 * updates live), on "Your Passport" (sealed), and as the provisional pre-mint
 * card. With `flippable`, it becomes an NFT-style flip card (data page ⇄
 * engraved reverse).
 */
export function PassportPreview(props: PassportPreviewProps): React.ReactElement {
  const { flippable, ...face } = props;
  const [flipped, setFlipped] = useState(false);

  if (!flippable) return <PassportFace {...face} />;

  return (
    <button
      type="button"
      className={styles.passportFlip}
      data-testid="passport-flip"
      aria-pressed={flipped}
      aria-label={
        flipped ? "Show the front of the passport" : "Flip the passport to see the reverse"
      }
      onClick={() => setFlipped((f) => !f)}
    >
      <div className={`${styles.passportFlipInner} ${flipped ? styles.flipped : ""}`}>
        <PassportFace {...face} hint />
        <PassportBack no={face.no} motto={face.motto} issued={face.issued} />
      </div>
    </button>
  );
}
