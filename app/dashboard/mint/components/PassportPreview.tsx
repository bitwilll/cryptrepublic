"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { identicon, fingerprint, passportSeed } from "@/lib/passport/identity";
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
   * The holder's stable identity (their verified wallet address when known) —
   * seeds the UNIQUE front QR code and the UNIQUE generative NFT on the reverse.
   * Absent → a name-derived fallback so the art still renders.
   */
  identity?: string;
  /** When true, the card becomes an NFT-style FLIPPABLE passport (data page ⇄ reverse). */
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

/** The UNIQUE generative NFT artwork — a symmetric identicon, stable per seed. */
function IdenticonArt({ seed }: { seed: string }): React.ReactElement {
  const { cells, color, size } = identicon(seed, 7);
  const dim = 100;
  const c = dim / size;
  return (
    <svg viewBox={`0 0 ${dim} ${dim}`} data-testid="passport-nft" aria-hidden="true">
      {cells.flatMap((row, y) =>
        row.map((on, x) =>
          on ? (
            <rect
              key={`${x}-${y}`}
              x={x * c}
              y={y * c}
              width={c + 0.4}
              height={c + 0.4}
              rx={1}
              fill={color}
            />
          ) : null,
        ),
      )}
    </svg>
  );
}

/** The passport DATA PAGE (front) — with the unique QR in the portrait column. */
function PassportFace({
  no,
  name,
  domicile,
  motto,
  issued,
  qrUrl,
  hint,
}: Omit<PassportPreviewProps, "identity" | "flippable"> & {
  qrUrl: string | null;
  hint?: boolean;
}): React.ReactElement {
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
        <div className={styles.passportPortrait}>
          <div className={styles.passportSeal} aria-hidden="true">
            CR
          </div>
          {qrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- data: URL QR, not a remote asset
            <img
              className={styles.passportQr}
              src={qrUrl}
              alt="Passport verification QR"
              data-testid="passport-qr"
            />
          ) : (
            <div
              className={styles.passportQrPlaceholder}
              data-testid="passport-qr"
              aria-hidden="true"
            />
          )}
          <div className={styles.passportSbt} aria-hidden="true">
            SOULBOUND
          </div>
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

/** The engraved REVERSE — the unique sovereign NFT, the covenant, and NFT identity. */
function PassportBack({
  no,
  motto,
  issued,
  seed,
}: Pick<PassportPreviewProps, "no" | "motto" | "issued"> & {
  seed: string;
}): React.ReactElement {
  return (
    <div className={`${styles.passport} ${styles.passportBack}`}>
      <div className={styles.passportGuilloche} aria-hidden="true" />
      <div className={styles.passportHeader}>
        <span className={styles.passportEmblem} aria-hidden="true">
          ◈
        </span>
        <div className={styles.passportTitle}>
          <b>CRYPTREPUBLIC</b>
          <span>SOVEREIGN CREDENTIAL · CRPASS</span>
        </div>
      </div>
      <div className={styles.passportBackBody}>
        <div className={styles.passportNft}>
          <IdenticonArt seed={seed} />
        </div>
        <div className={styles.passportNftLabel}>SOVEREIGN NFT · ONE OF ONE</div>
        <div className={styles.passportBackMotto}>{motto || "Civis Cryptrepublicae"}</div>
        <div className={styles.passportBackFlag}>◆ SOULBOUND · NON-TRANSFERABLE ◆</div>
        <div className={styles.passportFieldGrid}>
          <Field label="Standard" value="SBT · ERC-721" />
          <Field label="Token №" value={no} no />
          <Field label="Chain" value="BASE" />
          <Field label="Issued" value={issued} />
        </div>
        <div>
          <div className={styles.passportFieldLabel}>Fingerprint</div>
          <div className={styles.passportFinger}>{fingerprint(seed)}</div>
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
 * The CryptRepublic digital passport preview. A secure data page with a unique
 * QR, and (flippable) an engraved reverse bearing the holder's unique sovereign
 * NFT. Used in the mint flow (draft), on "Your Passport" (sealed), and as the
 * provisional pre-mint card.
 */
export function PassportPreview(props: PassportPreviewProps): React.ReactElement {
  const { flippable, identity, ...face } = props;
  const [flipped, setFlipped] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  const seed = passportSeed(identity, face.name);
  const qrValue = (identity ?? "").trim() || seed;

  useEffect(() => {
    let mounted = true;
    QRCode.toDataURL(qrValue, {
      margin: 1,
      width: 132,
      errorCorrectionLevel: "M",
      color: { dark: "#0b0f16", light: "#eaddbf" },
    })
      .then((url) => {
        if (mounted) setQrUrl(url);
      })
      .catch(() => {
        if (mounted) setQrUrl(null);
      });
    return () => {
      mounted = false;
    };
  }, [qrValue]);

  if (!flippable) return <PassportFace {...face} qrUrl={qrUrl} />;

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
        <PassportFace {...face} qrUrl={qrUrl} hint />
        <PassportBack no={face.no} motto={face.motto} issued={face.issued} seed={seed} />
      </div>
    </button>
  );
}
