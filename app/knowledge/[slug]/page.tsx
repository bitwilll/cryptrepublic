import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Crest } from "@/components/brand/Crest";
import { GovStrip } from "@/components/marketing/GovStrip";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Breadcrumb } from "@/components/registry/Breadcrumb";
import { DocumentBody } from "@/components/registry/DocumentBody";
import { KNOWLEDGE, knowledgeBySlug, sectionAnchor } from "@/lib/content/knowledge";
import { registryItem } from "@/lib/content/registry";
import styles from "@/components/registry/registry.module.css";

/**
 * /knowledge/[slug] — one encyclopedia entry with a table of contents and
 * related-service cross-links into /services#<registry-id>. Statically
 * rendered from lib/content/knowledge.ts; unknown slugs 404.
 */

export function generateStaticParams(): { slug: string }[] {
  return KNOWLEDGE.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = knowledgeBySlug(slug);
  if (!article) return { title: "Entry not found — CryptRepublic" };
  return {
    title: `${article.title} — The State Encyclopedia — CryptRepublic`,
    description: article.standfirst,
  };
}

export default async function KnowledgeArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = knowledgeBySlug(slug);
  if (!article) notFound();

  const related = article.related
    .map((id) => registryItem(id))
    .filter((i): i is NonNullable<typeof i> => i !== undefined);

  return (
    <>
      <Crest tone="dark" className="page-watermark" alt="" />
      <GovStrip />
      <SiteHeader />
      <main id="main-content">
        <div className={`wrap ${styles.page}`}>
          <Breadcrumb
            trail={[{ label: "Knowledge", href: "/knowledge" }, { label: article.title }]}
          />
          <h1 className={styles.pageTitle}>{article.title}</h1>
          <p className={styles.standfirst}>{article.standfirst}</p>

          <div className={styles.articleLayout}>
            <nav className={styles.toc} aria-label="Table of contents">
              <strong>In this entry</strong>
              <ol>
                {article.sections.map((s, i) => (
                  <li key={s.heading}>
                    <a href={`#${sectionAnchor(s.heading)}`}>
                      <span className={styles.tocIndex}>{String(i + 1).padStart(2, "0")}</span>
                      {s.heading}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <div className={styles.articleBody}>
              {article.sections.map((s) => (
                <section key={s.heading} id={sectionAnchor(s.heading)}>
                  <h2>{s.heading}</h2>
                  <DocumentBody text={s.body} />
                </section>
              ))}

              {related.length > 0 && (
                <div className={styles.related}>
                  <strong>Related services in the registry</strong>
                  <div className={styles.relatedChips}>
                    {related.map((item) => (
                      <Link key={item.id} href={`/services#${item.id}`}>
                        {item.title}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <Link className={styles.docReturn} href="/knowledge">
                ← Return to the encyclopedia
              </Link>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
