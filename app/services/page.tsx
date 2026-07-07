import type { Metadata } from "next";
import Link from "next/link";
import { Crest } from "@/components/brand/Crest";
import { GovStrip } from "@/components/marketing/GovStrip";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Breadcrumb } from "@/components/registry/Breadcrumb";
import { StatusChip } from "@/components/registry/StatusChip";
import {
  REGISTRY_BRANCH_LABELS,
  registryByBranch,
  type RegistryBranch,
  type RegistryItem,
} from "@/lib/content/registry";
import styles from "@/components/registry/registry.module.css";

export const metadata: Metadata = {
  title: "Citizen Services Directory — CryptRepublic",
  description:
    "The State Registry: every service and utility of the Republic, its status, and where to open it.",
};

const BRANCH_ORDER: readonly RegistryBranch[] = ["services", "utilities"];

function ServiceCard({ item }: { item: RegistryItem }) {
  return (
    <article className={styles.card} id={item.id}>
      <div className={styles.cardTop}>
        <h3 className={styles.cardTitle}>{item.title}</h3>
        <StatusChip status={item.status} />
      </div>
      <p className={styles.cardSummary}>{item.summary}</p>
      {item.detail && <p className={styles.cardDetail}>{item.detail}</p>}
      {item.capabilities && item.capabilities.length > 0 && (
        <ul className={styles.caps}>
          {item.capabilities.map((cap) => (
            <li key={cap.title}>
              {cap.title}
              {cap.summary && <span className={styles.capNote}> — {cap.summary}</span>}
            </li>
          ))}
        </ul>
      )}
      {item.href &&
        (item.external ? (
          <a className={styles.openLink} href={item.href} target="_blank" rel="noopener noreferrer">
            Open service ↗
          </a>
        ) : (
          <Link className={styles.openLink} href={item.href}>
            Open service →
          </Link>
        ))}
    </article>
  );
}

/**
 * /services — the public Citizen Services Directory (Wave 15). Renders the
 * ENTIRE State Registry (lib/content/registry.ts — the Miro board's .COM tree)
 * grouped by branch, with the four-status legend. Server component; no island.
 */
export default function ServicesPage() {
  const groups = registryByBranch();
  return (
    <>
      <Crest tone="dark" className="page-watermark" alt="" />
      <GovStrip />
      <SiteHeader />
      <main id="main-content">
        <div className={`wrap ${styles.page}`}>
          <Breadcrumb trail={[{ label: "Services" }]} />
          <h1 className={styles.pageTitle}>Citizen Services Directory</h1>
          <p className={styles.lede}>
            The State Registry in full: every service and utility of the Republic, transcribed from
            the Cabinet&apos;s ratified plan. Statuses are the registry&apos;s own — nothing here is
            promised that is not on the record.
          </p>

          <div className={styles.legend} role="list" aria-label="Status legend">
            <div className={styles.legendItem} role="listitem">
              <StatusChip status="live" />
              <p>Operational today. The link opens the service.</p>
            </div>
            <div className={styles.legendItem} role="listitem">
              <StatusChip status="beta" />
              <p>Operational with reduced scope while hardening completes.</p>
            </div>
            <div className={styles.legendItem} role="listitem">
              <StatusChip status="in-development" />
              <p>Being built now, under the current wave of works.</p>
            </div>
            <div className={styles.legendItem} role="listitem">
              <StatusChip status="planned" />
              <p>Ratified intent — scheduled, not yet in development.</p>
            </div>
          </div>

          {BRANCH_ORDER.map((branch) => {
            const items = groups[branch];
            const live = items.filter((i) => i.status === "live").length;
            const label = REGISTRY_BRANCH_LABELS[branch];
            return (
              <section
                key={branch}
                id={branch}
                className={styles.sectionGap}
                aria-label={label.title}
              >
                <div className={styles.branchHead}>
                  <h2>{label.title}</h2>
                  <span className={styles.branchCount}>
                    {items.length} registered · {live} in service
                  </span>
                </div>
                <p className={styles.branchBlurb}>{label.blurb}</p>
                <div className={styles.cardGrid}>
                  {items.map((item) => (
                    <ServiceCard key={item.id} item={item} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
