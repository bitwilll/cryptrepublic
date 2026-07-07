import Link from "next/link";
import styles from "./registry.module.css";

/**
 * The mono registry breadcrumb ("REPUBLIC / SERVICES"). Server component.
 * `trail` follows "REPUBLIC" (always linked home); entries with an href link,
 * the final entry is plain text by convention.
 */
export function Breadcrumb({
  trail,
}: {
  trail: readonly { label: string; href?: string }[];
}): React.ReactElement {
  return (
    <nav aria-label="Breadcrumb" className={styles.crumb}>
      <Link href="/">Republic</Link>
      {trail.map((t) => (
        <span key={t.label}>
          {" / "}
          {t.href ? <Link href={t.href}>{t.label}</Link> : t.label}
        </span>
      ))}
    </nav>
  );
}
