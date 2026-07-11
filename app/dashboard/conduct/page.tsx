import type { Metadata } from "next";
import Link from "next/link";
import { FileReportApp } from "@/components/reports/FileReportApp";
import styles from "@/components/reports/reports.module.css";

export const metadata: Metadata = {
  title: "Conduct reports — CryptRepublic",
  description:
    "File a conduct report against a Civic ID, follow your filings, and read the verified " +
    "charges on your own record. Reports are weighed by the Protectors under the Penal Code.",
};

export default function ConductPage() {
  return (
    <div className={`wrap ${styles.stack}`}>
      <div>
        <div className="kicker">CIVIC CONDUCT</div>
        <h2 style={{ fontSize: 32, marginTop: 10 }}>Conduct reports</h2>
        <p style={{ color: "var(--muted)", marginTop: 8, maxWidth: 560 }}>
          The Republic polices itself. A citizen may report another citizen&rsquo;s conduct by Civic
          ID; a sitting Protector or the Cabinet verifies or dismisses it under the{" "}
          <Link href="/documents/penal-code" style={{ color: "var(--blue)" }}>
            Penal Code
          </Link>
          . Verified penalties enter the subject&rsquo;s trust score — nothing else does.
        </p>
      </div>

      <FileReportApp />
    </div>
  );
}
