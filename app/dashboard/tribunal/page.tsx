import type { Metadata } from "next";
import Link from "next/link";
import {
  PENAL_GRADES,
  PENAL_GRADE_BANDS,
  REPORT_CATEGORIES,
  REPORT_CATEGORY_LABELS,
} from "@/lib/gov/types";
import { TribunalApp } from "@/components/reports/TribunalApp";
import styles from "@/components/reports/reports.module.css";

export const metadata: Metadata = {
  title: "Tribunal — CryptRepublic",
  description:
    "The Protectors' verification docket: weigh submitted conduct reports and enter graded, " +
    "band-checked decisions under the Penal Code. Reserved for sitting verifier offices.",
};

/**
 * /dashboard/tribunal (Wave 17) — the officers' docket. Deliberately OFF the
 * sidebar: office holders learn the route from their appointment letter and
 * the Conduct desk copy. The island handles the 403 for everyone else; the
 * Penal Code band table below is the decision reference.
 */
export default function TribunalPage() {
  return (
    <div className={`wrap ${styles.stack}`}>
      <div>
        <div className="kicker">OFFICE OF THE PROTECTORS</div>
        <h2 style={{ fontSize: 32, marginTop: 10 }}>Tribunal</h2>
        <p style={{ color: "var(--muted)", marginTop: 8, maxWidth: 560 }}>
          Submitted conduct reports await verification. A verified report enters the subject&rsquo;s
          trust score under the Penal Code; a dismissal closes it. Decisions are graded,
          band-checked, and audit-logged — the reporter&rsquo;s identity is withheld from this
          docket.
        </p>
      </div>

      <TribunalApp />

      <section className={styles.card} aria-labelledby="penal-band-title">
        <h2 id="penal-band-title" className={styles.cardTitle}>
          Penal Code bands
        </h2>
        <p className={styles.cardNote}>
          A verified report&rsquo;s penalty must sit inside its grade&rsquo;s band, inclusive. Grade
          V additionally forfeits every office the subject holds.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.bandTable}>
            <thead>
              <tr>
                <th scope="col">Grade</th>
                <th scope="col">Offence</th>
                <th scope="col">Penalty band</th>
              </tr>
            </thead>
            <tbody>
              {PENAL_GRADES.map((g, i) => {
                const band = PENAL_GRADE_BANDS[g];
                const category = REPORT_CATEGORIES[i];
                return (
                  <tr key={g}>
                    <td className={styles.mono} style={{ fontWeight: 700 }}>
                      {g}
                    </td>
                    <td>{category ? REPORT_CATEGORY_LABELS[category] : "—"}</td>
                    <td className={styles.mono}>
                      {band.min} to {band.max}
                      {g === "V" ? " — offices forfeited" : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className={styles.cardNote} style={{ marginTop: 14 }}>
          Full statute: <Link href="/documents/penal-code">the Penal Code</Link> in the documents
          registry.
        </p>
      </section>
    </div>
  );
}
