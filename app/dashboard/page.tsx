import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Citizen Dashboard — CryptRepublic",
};

export default function DashboardPage() {
  return (
    <section className="block">
      <div className="wrap">
        <div className="kicker">CITIZEN CONSOLE</div>
        <h1 style={{ marginTop: 12 }}>Citizen Dashboard</h1>
        <p style={{ color: "var(--muted)", marginTop: 16, maxWidth: 560 }}>
          You are authenticated. The full citizen dashboard arrives in Wave 7.
        </p>
        <p style={{ marginTop: 24 }}>
          <Link className="btn btn-primary" href="/dashboard/mint">
            Proceed to mint →
          </Link>
        </p>
      </div>
    </section>
  );
}
