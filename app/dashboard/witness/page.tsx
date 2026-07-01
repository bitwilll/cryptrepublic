import type { Metadata } from "next";
import { AppProviders } from "@/components/providers/AppProviders";
import WitnessSurface from "./WitnessSurface";

export const metadata: Metadata = {
  title: "Witness an Applicant — CryptRepublic",
};

/**
 * Server shell for the minimal witness-signing surface. An existing citizen signs
 * an applicant's EIP-712 Attestation with their OWN wallet; the server never
 * signs. Full social witness-discovery UX is a documented follow-up (spec §7.4).
 */
export default function WitnessPage() {
  return (
    <section className="block">
      <div className="wrap">
        <div className="kicker">WITNESS</div>
        <AppProviders>
          <WitnessSurface />
        </AppProviders>
      </div>
    </section>
  );
}
