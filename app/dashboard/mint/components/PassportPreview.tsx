"use client";
import { useState } from "react";
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
  /** Issued marker (block / "AWAITING SEAL" / a provisional status). */
  issued: string;
  /**
   * When true, the card becomes an NFT-style FLIPPABLE card: click / Enter /
   * Space flips between the passport face and a designed reverse (seal + motto +
   * soulbound mark). Default false keeps the static preview (mint draft) byte
   * for byte unchanged.
   */
  flippable?: boolean;
}

/** The passport FACE — the original design (ported from dash-mint.jsx). */
function PassportFace({
  no,
  name,
  domicile,
  motto,
  issued,
  hint,
}: PassportPreviewProps & { hint?: boolean }): React.ReactElement {
  return (
    <div className={`${styles.passport} ${styles.passportFace}`}>
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
      {hint ? (
        <span className={styles.passportFlipHint} aria-hidden="true">
          ⟳ FLIP
        </span>
      ) : null}
    </div>
  );
}

/** The passport REVERSE — a seal + motto + the soulbound mark. */
function PassportBack({
  no,
  motto,
  issued,
}: Pick<PassportPreviewProps, "no" | "motto" | "issued">): React.ReactElement {
  return (
    <div className={`${styles.passport} ${styles.passportBack}`}>
      <div className={styles.passportHead}>
        <span>CRYPTREPUBLIC · REVERSE</span>
        <span>CRPASS</span>
      </div>
      <div className={styles.passportSeal} aria-hidden="true">
        CR
      </div>
      <div className={styles.passportBackMotto}>{motto || "Civis Cryptrepublicae"}</div>
      <div className={styles.passportBackFlag}>SOULBOUND · NON-TRANSFERABLE</div>
      <div className={styles.passportRow}>
        <span>ISSUED</span>
        <span>{issued}</span>
      </div>
      <div className={styles.passportRow}>
        <span>AUTHORITY</span>
        <span>THE REPUBLIC</span>
      </div>
      <div className={styles.passportNo}>№ {no}</div>
      <span className={styles.passportFlipHint} aria-hidden="true">
        ⟳ FLIP
      </span>
    </div>
  );
}

/**
 * The live passport preview. Used in the mint flow (draft, updates live), on
 * "Your Passport" (sealed), and as the provisional pre-mint card. With
 * `flippable`, it becomes an NFT-style flip card (front + designed reverse).
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
