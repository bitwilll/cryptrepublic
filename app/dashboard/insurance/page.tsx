import type { Metadata } from "next";
import { InsuranceApp } from "@/components/insurance/InsuranceApp";

export const metadata: Metadata = {
  title: "Citizen Insurance — CryptRepublic",
  description:
    "Register applications for asset and health cover under the Republic's mutual-cover programme. No premiums are collected during the registration period.",
};

/**
 * Citizen insurance office (Wave 15 B). Server shell; the application forms and
 * ledger are a client island. A registry of applications only — no premiums,
 * no payouts, no funds.
 */
export default function InsurancePage() {
  return (
    <section className="block">
      <div className="wrap">
        <div className="kicker">INSURANCE OFFICE</div>
        <InsuranceApp />
      </div>
    </section>
  );
}
