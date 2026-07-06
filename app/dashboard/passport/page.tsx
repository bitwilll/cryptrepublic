import type { Metadata } from "next";
import { Crest } from "@/components/brand/Crest";
import { AppProviders } from "@/components/providers/AppProviders";
import PassportView from "./PassportView";

export const metadata: Metadata = {
  title: "Your Passport — CryptRepublic",
};

/**
 * Server shell for "Your Passport". The view is a client island (reads the REAL
 * soulbound token via viem through the `/api/rpc/[chain]` proxy). It resolves the
 * user's address from the embedded public cache or wagmi, and reconciles against
 * the chain — the DB seal cache is never authoritative.
 */
export default function PassportPage() {
  return (
    <section className="block" style={{ position: "relative", overflow: "hidden" }}>
      <Crest tone="dark" className="page-crest" alt="" />
      <div className="wrap" style={{ position: "relative", zIndex: 1 }}>
        <div className="kicker">CITIZEN PASSPORT</div>
        <AppProviders>
          <PassportView />
        </AppProviders>
      </div>
    </section>
  );
}
