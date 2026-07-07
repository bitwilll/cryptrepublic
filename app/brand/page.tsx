import type { Metadata } from "next";
import { Crest } from "@/components/brand/Crest";
import { GovStrip } from "@/components/marketing/GovStrip";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Breadcrumb } from "@/components/registry/Breadcrumb";
import { CommissaryGrid } from "@/components/registry/CommissaryGrid";
import { COMMISSARY_CATEGORIES, commissaryByCategory } from "@/lib/content/commissary";
import styles from "@/components/registry/registry.module.css";

export const metadata: Metadata = {
  title: "State Brand & Commissary — CryptRepublic",
  description:
    "The brand kit of the Republic — crest, palette, typography, usage rules — and the Commissary catalogue with register-of-interest.",
};

/** the ratified palette, hex values from styles/tokens.css */
const PALETTE: readonly { name: string; token: string; hex: string; dark?: boolean }[] = [
  { name: "Navy", token: "--navy", hex: "#0a1929", dark: true },
  { name: "Navy II", token: "--navy2", hex: "#0a2540", dark: true },
  { name: "Ink", token: "--ink", hex: "#0f1f33", dark: true },
  { name: "Republic Blue", token: "--blue", hex: "#1957d3", dark: true },
  { name: "Blue Deep", token: "--blue-d", hex: "#0e3a9b", dark: true },
  { name: "Cyan", token: "--cyan", hex: "#00b3e6" },
  { name: "Gold", token: "--gold", hex: "#c8a96a" },
  { name: "Gold Deep", token: "--gold-d", hex: "#9d8246" },
  { name: "Paper", token: "--paper", hex: "#f6f7f9" },
  { name: "Card", token: "--card", hex: "#ffffff" },
  { name: "Line", token: "--line", hex: "#e5eaef" },
  { name: "Muted", token: "--muted", hex: "#5a6a7d", dark: true },
  { name: "Success", token: "--success", hex: "#187a50", dark: true },
];

/**
 * /brand — State Brand & Commissary (Wave 15). Top: the brand kit (crest,
 * palette, typography, usage rules) as server-rendered specimens. Below: the
 * Commissary catalogue with the register-of-interest client island.
 */
export default function BrandPage() {
  const grouped = commissaryByCategory();
  const groups = COMMISSARY_CATEGORIES.map((category) => ({
    category,
    items: grouped[category],
  }));

  return (
    <>
      <Crest tone="dark" className="page-watermark" alt="" />
      <GovStrip />
      <SiteHeader />
      <main id="main-content">
        <div className={`wrap ${styles.page}`}>
          <Breadcrumb trail={[{ label: "Brand & Commissary" }]} />
          <h1 className={styles.pageTitle}>State Brand & Commissary</h1>
          <p className={styles.lede}>
            The visual instruments of the Republic — the crest, the ratified palette, and the state
            faces — followed by the Commissary: the goods of the state, open for register of
            interest.
          </p>

          <section className={styles.sectionGap} aria-label="The crest">
            <div className={styles.kindHead}>
              <h2>The crest</h2>
              <span className={styles.branchCount}>
                Two tones · never redrawn · never distorted
              </span>
            </div>
            <div className={styles.crestPanels}>
              <figure
                className={`${styles.crestPanel} ${styles.crestPanelLight}`}
                style={{ margin: 0 }}
              >
                <Crest tone="dark" height={150} alt="The CryptRepublic crest, ink on light" />
                <figcaption>Ink variant — light surfaces</figcaption>
              </figure>
              <figure
                className={`${styles.crestPanel} ${styles.crestPanelDark}`}
                style={{ margin: 0 }}
              >
                <Crest tone="light" height={150} alt="The CryptRepublic crest, parchment on navy" />
                <figcaption>Parchment variant — dark surfaces</figcaption>
              </figure>
            </div>
          </section>

          <section className={styles.sectionGap} aria-label="The palette">
            <div className={styles.kindHead}>
              <h2>The palette</h2>
              <span className={styles.branchCount}>{PALETTE.length} ratified tokens</span>
            </div>
            <div className={styles.swatchGrid}>
              {PALETTE.map((c) => (
                <div key={c.token} className={styles.swatch}>
                  <div
                    className={styles.swatchColor}
                    style={{ background: c.hex }}
                    aria-hidden="true"
                  />
                  <dl>
                    <dt>{c.name}</dt>
                    <dd>{c.token}</dd>
                    <dd>{c.hex.toUpperCase()}</dd>
                  </dl>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.sectionGap} aria-label="Typography">
            <div className={styles.kindHead}>
              <h2>Typography</h2>
              <span className={styles.branchCount}>Two faces, no exceptions</span>
            </div>
            <div className={styles.typeGrid}>
              <div className={styles.typeSpecimen}>
                <h3>Archivo</h3>
                <small>--sans · headings 900, uppercase · body 400–700</small>
                <p className={styles.typeSampleSans}>The Republic counts its citizens</p>
              </div>
              <div className={styles.typeSpecimen}>
                <h3>IBM Plex Mono</h3>
                <small>--mono · serials, codes, labels, kickers</small>
                <p className={styles.typeSampleMono}>
                  PASSPORT № CR-048392
                  <br />
                  BLOCK 21 408 932 · RATIFIED MMXXVI
                  <br />
                  0x1957…D3C8 · SEVEN WITNESSES
                </p>
              </div>
            </div>
          </section>

          <section className={styles.sectionGap} aria-label="Usage rules">
            <div className={styles.kindHead}>
              <h2>Usage rules</h2>
              <span className={styles.branchCount}>Binding on every organ of state</span>
            </div>
            <ol className={styles.rules}>
              <li>
                <b>R-01</b>
                <span>
                  The crest is reproduced from the issued assets only — never redrawn, recolored,
                  rotated, or stretched. Aspect ratio is preserved absolutely.
                </span>
              </li>
              <li>
                <b>R-02</b>
                <span>
                  Ink variant on light surfaces; parchment variant on navy or photographic dark.
                  Clear space around the crest is no less than half its height.
                </span>
              </li>
              <li>
                <b>R-03</b>
                <span>
                  Every corner is square. The geometry of the Republic admits no rounded corners, in
                  print or on screen.
                </span>
              </li>
              <li>
                <b>R-04</b>
                <span>
                  Headings set in Archivo at weight 900, uppercase. Serials, references, and
                  micro-labels set in IBM Plex Mono, letter-spaced.
                </span>
              </li>
              <li>
                <b>R-05</b>
                <span>
                  Gold is an accent of office — rules, seals, and markers — never body text on light
                  ground.
                </span>
              </li>
              <li>
                <b>R-06</b>
                <span>
                  No third party may imply endorsement by the Republic. Misuse of the brand or seal
                  is a Grade II offence under the Penal Code.
                </span>
              </li>
            </ol>
          </section>

          <section className={styles.sectionGap} aria-label="The Commissary">
            <div className={styles.branchHead}>
              <h2>The Commissary</h2>
              <span className={styles.branchCount}>
                {groups.reduce((n, g) => n + g.items.length, 0)} catalogued items · register of
                interest
              </span>
            </div>
            <p className={styles.branchBlurb}>
              The goods of the state, from insignia to provisions. The Commissary is a register of
              interest while provisioning is arranged — no checkout, no payments, and the Republic
              moves no funds. Registering interest requires citizenship sign-in and may be withdrawn
              at any time.
            </p>
            <CommissaryGrid groups={groups} />
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
