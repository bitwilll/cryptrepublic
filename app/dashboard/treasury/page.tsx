import type { Metadata } from "next";
import { TreasuryApp } from "@/components/treasury/TreasuryApp";

export const metadata: Metadata = {
  title: "Treasury — CryptRepublic",
  description:
    "Real on-chain reserves, governance-ratified allocation targets, and executed disbursements. Read-only.",
};

/**
 * Treasury (§7.9) — read-only. Server Component mounting the client island. The
 * dashboard layout already wraps every page in DashboardShell.
 */
export default function DashboardTreasuryPage() {
  return <TreasuryApp />;
}
