import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mint Your Passport — CryptRepublic",
};

export default function MintPage() {
  return (
    <section className="block">
      <div className="wrap">
        <div className="kicker">PASSPORT MINT</div>
        <h1 style={{ marginTop: 12 }}>Mint Your Passport — coming in Wave 5</h1>
        <p style={{ color: "var(--muted)", marginTop: 16, maxWidth: 560 }}>
          Your citizen record is a DRAFT application. The on-chain passport mint flow lands in Wave
          5.
        </p>
      </div>
    </section>
  );
}
