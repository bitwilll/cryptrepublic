import type { Metadata } from "next";
import { GovernanceApp } from "@/components/governance/GovernanceApp";

export const metadata: Metadata = {
  title: "Constitution & Votes — CryptRepublic",
  description:
    "Amendments in session: on-chain tallies and state, one-citizen-one-vote. Cast your oath on chain.",
};

/**
 * Governance / Constitution & votes (§7.8). Server Component mounting the client
 * island. The dashboard layout already wraps every page in DashboardShell.
 */
export default function DashboardGovernancePage() {
  return <GovernanceApp />;
}
