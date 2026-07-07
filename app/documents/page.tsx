import type { Metadata } from "next";
import Link from "next/link";
import { Crest } from "@/components/brand/Crest";
import { GovStrip } from "@/components/marketing/GovStrip";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Breadcrumb } from "@/components/registry/Breadcrumb";
import {
  DOCUMENTS,
  DOCUMENT_KIND_LABELS,
  docSerial,
  type DocumentKind,
  type StateDocument,
} from "@/lib/content/documents";
import styles from "@/components/registry/registry.module.css";

export const metadata: Metadata = {
  title: "Registry of Official Documents — CryptRepublic",
  description:
    "Statutes, ceremonial texts, legal instruments, and state stationery of the Republic, in full text.",
};

const KIND_ORDER: readonly DocumentKind[] = [
  "statute",
  "ceremonial",
  "instrument",
  "legal",
  "stationery",
];

/** section headings (proper plurals — never "Stationerys") */
const KIND_HEADINGS: Record<DocumentKind, string> = {
  statute: "Statutes",
  ceremonial: "Ceremonial texts",
  instrument: "Instruments",
  legal: "Legal texts",
  stationery: "Stationery",
};

/**
 * /documents — the Registry of Official Documents (Wave 15). A gazette-style
 * index of every instrument on the Cabinet's board; documents with full text
 * link to /documents/[slug], and the three text-less stationery items render
 * below as CSS specimens (borders + typography only — square corners).
 */
export default function DocumentsPage() {
  const byKind = Object.fromEntries(KIND_ORDER.map((k) => [k, [] as StateDocument[]])) as Record<
    DocumentKind,
    StateDocument[]
  >;
  for (const d of DOCUMENTS) byKind[d.kind].push(d);

  return (
    <>
      <Crest tone="dark" className="page-watermark" alt="" />
      <GovStrip />
      <SiteHeader />
      <main>
        <div className={`wrap ${styles.page}`}>
          <Breadcrumb trail={[{ label: "Documents" }]} />
          <h1 className={styles.pageTitle}>Registry of Official Documents</h1>
          <p className={styles.lede}>
            The written state: statutes, ceremonial texts, instruments, legal terms, and stationery,
            each under its registry number. Ratified MMXXVI by the Cabinet of the Republic.
          </p>

          {KIND_ORDER.map((kind) => {
            const docs = byKind[kind];
            if (docs.length === 0) return null;
            return (
              <section
                key={kind}
                className={styles.sectionGap}
                aria-label={DOCUMENT_KIND_LABELS[kind]}
              >
                <div className={styles.kindHead}>
                  <h2>{KIND_HEADINGS[kind]}</h2>
                  <span className={styles.branchCount}>
                    {docs.length} instrument{docs.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className={styles.docList}>
                  {docs.map((doc) => (
                    <article key={doc.slug} className={styles.docRow}>
                      <div className={styles.docSerial}>
                        {docSerial(doc.slug)}
                        <small>Ratified MMXXVI</small>
                      </div>
                      <div>
                        <h3>{doc.title}</h3>
                        <p>{doc.summary}</p>
                      </div>
                      {doc.body ? (
                        <Link className={styles.docRead} href={`/documents/${doc.slug}`}>
                          Read the document →
                        </Link>
                      ) : (
                        <span className={styles.docSpecimenTag}>Specimen below</span>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}

          <section className={styles.sectionGap} aria-label="Stationery specimens">
            <div className={styles.kindHead}>
              <h2>Stationery specimens</h2>
              <span className={styles.branchCount}>Issued forms — rendered to scale of intent</span>
            </div>
            <div className={styles.specimenGrid}>
              <figure className={styles.specimenBox} style={{ margin: 0 }}>
                <figcaption className={styles.specimenLabel}>
                  {docSerial("letterhead")} · Letterhead
                </figcaption>
                <div className={styles.letterhead} aria-hidden="true">
                  <div className={styles.letterheadTop}>
                    <Crest tone="dark" height={44} alt="" />
                    <div className={styles.letterheadWordmark}>
                      <b>CryptRepublic</b>
                      <span>Office of the Registrar · Network State №001</span>
                    </div>
                    <div className={styles.letterheadRef}>
                      Ref №<br />
                      Block
                      <br />
                      Date
                    </div>
                  </div>
                  <div className={styles.letterheadRuleLines}>
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className={styles.letterheadFoot}>
                    <span>cryptrepublic.com</span>
                    <span>Ratified MMXXVI</span>
                  </div>
                </div>
              </figure>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <figure className={styles.specimenBox} style={{ margin: 0, flex: 1 }}>
                  <figcaption className={styles.specimenLabel}>
                    {docSerial("business-card")} · Business card
                  </figcaption>
                  <div className={styles.bizcard} aria-hidden="true">
                    <div className={styles.bizName}>[Citizen Name]</div>
                    <div className={styles.bizOffice}>Office of the Republic</div>
                    <div className={styles.bizMeta}>
                      <span>PASSPORT № CR-XXXXXX</span>
                      <span>CRYPTREPUBLIC.COM</span>
                    </div>
                  </div>
                </figure>
                <figure className={styles.specimenBox} style={{ margin: 0, flex: 1 }}>
                  <figcaption className={styles.specimenLabel}>
                    {docSerial("state-stamp")} · State stamp
                  </figcaption>
                  <div className={styles.stampWrap} aria-hidden="true">
                    <div className={styles.stamp}>
                      <span>★ ★ ★</span>
                      <b>
                        CryptRepublic
                        <br />
                        State Registry
                      </b>
                      <i>MMXXVI</i>
                      <span>Ratified · Sealed</span>
                    </div>
                  </div>
                </figure>
              </div>
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
