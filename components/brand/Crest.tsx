import styles from "./Crest.module.css";

/**
 * The CryptRepublic crest — the baroque two-cherubs engraving, as a transparent
 * alpha-matte PNG so it drops cleanly onto any surface. `tone` picks the ink
 * variant for LIGHT surfaces or the parchment-white variant for DARK ones.
 */
export function Crest({
  tone = "dark",
  height,
  className,
  // Default is DECORATIVE: every default consumer sits beside the wordmark.
  // Pass an explicit alt only when the crest stands alone.
  alt = "",
}: {
  /** Fixed render height in px (width follows the natural aspect). Omit to let a
   *  className control the size (e.g. a width-based watermark) — aspect is
   *  always preserved either way. */
  height?: number;
  tone?: "dark" | "light";
  className?: string;
  alt?: string;
}): React.ReactElement {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- local transparent brand asset
    <img
      src={tone === "light" ? "/brand/crest-light.png" : "/brand/crest-dark.png"}
      alt={alt}
      className={`${styles.crest} ${className ?? ""}`}
      style={height !== undefined ? { height } : undefined}
      draggable={false}
    />
  );
}
