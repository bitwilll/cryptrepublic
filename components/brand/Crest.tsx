import styles from "./Crest.module.css";

/**
 * The CryptRepublic crest — the baroque two-cherubs engraving, as a transparent
 * alpha-matte PNG so it drops cleanly onto any surface. `tone` picks the ink
 * variant for LIGHT surfaces or the parchment-white variant for DARK ones.
 */
export function Crest({
  tone = "dark",
  height = 40,
  className,
  alt = "CryptRepublic",
}: {
  tone?: "dark" | "light";
  height?: number;
  className?: string;
  alt?: string;
}): React.ReactElement {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- local transparent brand asset
    <img
      src={tone === "light" ? "/brand/crest-light.png" : "/brand/crest-dark.png"}
      alt={alt}
      className={`${styles.crest} ${className ?? ""}`}
      style={{ height }}
      draggable={false}
    />
  );
}
