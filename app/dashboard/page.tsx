import type { Metadata } from "next";
import { CitizenHomeApp } from "@/components/home/CitizenHomeApp";

export const metadata: Metadata = {
  title: "Citizen Dashboard — CryptRepublic",
  description:
    "Your standing in the Republic: obligations, the ledger of the Republic, and the live census — read honestly from chain.",
};

/**
 * Citizen home (§7.5). Server Component that mounts the client island. The
 * dashboard layout already wraps every page in DashboardShell (session/citizen
 * context + shell chrome) — this page does NOT re-mount it.
 */
export default function DashboardHomePage() {
  return <CitizenHomeApp />;
}
