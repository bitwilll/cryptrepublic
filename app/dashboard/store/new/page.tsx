import type { Metadata } from "next";
import Link from "next/link";
import { NewListingForm } from "@/components/store/NewListingForm";

export const metadata: Metadata = {
  title: "File a Listing — Citizen Store — CryptRepublic",
  description:
    "File a new citizen-to-citizen listing with the Registry. Pricing is intent only; settlement is arranged peer-to-peer and the Republic never holds funds.",
};

/** New-listing filing (Wave 15 store). Server shell around the client form. */
export default function NewListingPage() {
  return (
    <div className="wrap" style={{ padding: "32px 0 64px" }}>
      <Link
        href="/dashboard/store"
        style={{
          fontFamily: "var(--mono)",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--muted)",
          textDecoration: "none",
        }}
      >
        ← Citizen store
      </Link>
      <div style={{ margin: "18px 0 24px" }}>
        <div className="kicker">NEW FILING</div>
        <h2 style={{ fontSize: 32, marginTop: 10 }}>File a listing</h2>
        <p style={{ color: "var(--muted)", marginTop: 8, maxWidth: 560 }}>
          Enter your offer on the Registry. A listing is pricing intent only — settlement is
          arranged citizen-to-citizen; the Republic never holds funds.
        </p>
      </div>
      <NewListingForm />
    </div>
  );
}
