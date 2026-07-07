import Link from "next/link";
import { REGISTRY_BRANCH_LABELS, registryByBranch } from "@/lib/content/registry";
import styles from "@/components/registry/registry.module.css";

/**
 * Homepage "STATE SERVICES" strip (Wave 15) — a compact 2-up row (Citizen
 * services / Citizen utilities) with counts derived from the State Registry,
 * plus quick links into the public directories. Server component; sits between
 * GovernanceStrip and EmbassiesStrip (e2e/home.spec.ts counts 9 sections).
 */
export function ServicesStrip() {
  const groups = registryByBranch();
  const branches = (["services", "utilities"] as const).map((branch) => {
    const items = groups[branch];
    const live = items.filter((i) => i.status === "live").length;
    return { branch, items, live, label: REGISTRY_BRANCH_LABELS[branch] };
  });

  return (
    <section className="block" id="state-services" data-screen-label="State services">
      <div className="wrap">
        <div className="sec-head reveal">
          <div className="kicker">State services</div>
          <h2>
            The registry is <em>open.</em>
          </h2>
          <p>
            Every service and utility of the Republic is catalogued in the State Registry, with its
            status on the record — in service, beta, in development, or planned.
          </p>
        </div>
        <div className={`${styles.stripGrid} reveal`}>
          {branches.map(({ branch, items, live, label }) => (
            <Link key={branch} className={styles.stripCard} href={`/services#${branch}`}>
              <span className={styles.stripCount}>
                {items.length} {branch === "services" ? "services" : "utilities"} · {live} in
                service
              </span>
              <h3>{label.title}</h3>
              <p>{label.blurb}</p>
              <span className={styles.stripOpen}>Open the directory →</span>
            </Link>
          ))}
        </div>
        <div className={`${styles.stripLinks} reveal`}>
          <Link href="/services">Full directory</Link>
          <Link href="/documents">Official documents</Link>
          <Link href="/knowledge">State encyclopedia</Link>
          <Link href="/brand">Brand &amp; commissary</Link>
        </div>
      </div>
    </section>
  );
}
