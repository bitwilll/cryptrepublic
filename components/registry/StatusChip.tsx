import type { RegistryStatus } from "@/lib/content/registry";
import { REGISTRY_STATUS_LABELS } from "@/lib/content/registry";
import styles from "./registry.module.css";

const MARKER: Record<RegistryStatus, string> = {
  live: styles.markerLive,
  beta: styles.markerBeta,
  "in-development": styles.markerDev,
  planned: styles.markerPlanned,
};

/**
 * Registry status chip: a colored square marker + the official label in --ink
 * mono (the marker carries the color so the small text never fights WCAG
 * contrast; the /services legend spells out the four states).
 */
export function StatusChip({ status }: { status: RegistryStatus }): React.ReactElement {
  return (
    <span className={styles.statusChip}>
      <i className={`${styles.marker} ${MARKER[status]}`} aria-hidden="true" />
      {REGISTRY_STATUS_LABELS[status]}
    </span>
  );
}
