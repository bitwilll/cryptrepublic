import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Crest } from "@/components/brand/Crest";
import { GovStrip } from "@/components/marketing/GovStrip";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Breadcrumb } from "@/components/registry/Breadcrumb";
import { DocumentBody } from "@/components/registry/DocumentBody";
import {
  DOCUMENT_KIND_LABELS,
  docSerial,
  documentBySlug,
  documentsWithBody,
} from "@/lib/content/documents";
import styles from "@/components/registry/registry.module.css";

/**
 * /documents/[slug] — one official document, statically rendered from
 * lib/content/documents.ts. Only documents WITH a body have a page; unknown
 * slugs and specimen-only stationery 404.
 */

export function generateStaticParams(): { slug: string }[] {
  return documentsWithBody().map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = documentBySlug(slug);
  if (!doc || !doc.body) return { title: "Document not found — CryptRepublic" };
  return {
    title: `${doc.title} — Registry of Official Documents — CryptRepublic`,
    description: doc.summary,
  };
}

export default async function DocumentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = documentBySlug(slug);
  if (!doc || !doc.body) notFound();

  return (
    <>
      <Crest tone="dark" className="page-watermark" alt="" />
      <GovStrip />
      <SiteHeader />
      <main id="main-content">
        <div className={`wrap ${styles.page}`}>
          <Breadcrumb trail={[{ label: "Documents", href: "/documents" }, { label: doc.title }]} />
          <header className={styles.docHeader}>
            <div className={styles.docCitation}>
              <span>Registry № {docSerial(doc.slug)}</span>
              <span>{DOCUMENT_KIND_LABELS[doc.kind]}</span>
              <span>Ratified MMXXVI</span>
            </div>
            <h1>{doc.title}</h1>
            <p>{doc.summary}</p>
          </header>
          <div className={styles.docBody}>
            <DocumentBody text={doc.body} />
          </div>
          <Link className={styles.docReturn} href="/documents">
            ← Return to the documents registry
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
