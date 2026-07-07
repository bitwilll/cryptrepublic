import type { Metadata } from "next";
import Link from "next/link";
import { Crest } from "@/components/brand/Crest";
import { GovStrip } from "@/components/marketing/GovStrip";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Breadcrumb } from "@/components/registry/Breadcrumb";
import { KNOWLEDGE_THEMES, knowledgeByTheme } from "@/lib/content/knowledge";
import styles from "@/components/registry/registry.module.css";

export const metadata: Metadata = {
  title: "The State Encyclopedia — CryptRepublic",
  description:
    "How every organ of the Republic works — identity, trust, treasury, wallet, and the instruments of citizenship.",
};

/**
 * /knowledge — the State Encyclopedia index (Wave 15). Fourteen articles from
 * lib/content/knowledge.ts, grouped by theme. Server component.
 */
export default function KnowledgePage() {
  const grouped = knowledgeByTheme();
  return (
    <>
      <Crest tone="dark" className="page-watermark" alt="" />
      <GovStrip />
      <SiteHeader />
      <main>
        <div className={`wrap ${styles.page}`}>
          <Breadcrumb trail={[{ label: "Knowledge" }]} />
          <h1 className={styles.pageTitle}>The State Encyclopedia</h1>
          <p className={styles.lede}>
            How the Republic actually works — written against the systems as built, not as imagined.
            Fourteen entries, from the oath to the treasury, each traceable to the public record.
          </p>

          {KNOWLEDGE_THEMES.map((theme) => {
            const articles = grouped[theme];
            if (articles.length === 0) return null;
            return (
              <section key={theme} className={styles.sectionGap} aria-label={theme}>
                <div className={styles.themeHead}>
                  <h2>{theme}</h2>
                </div>
                <div className={styles.articleGrid}>
                  {articles.map((a) => (
                    <Link key={a.slug} className={styles.articleCard} href={`/knowledge/${a.slug}`}>
                      <h3>{a.title}</h3>
                      <p>{a.standfirst}</p>
                      <span className={styles.articleMeta}>
                        {a.sections.length} sections · Read the entry →
                      </span>
                    </Link>
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
