import type { Metadata } from "next";
import { PopulationApp } from "@/components/population/PopulationApp";

export const metadata: Metadata = {
  title: "Population — CryptRepublic",
  description:
    "The live census (totalCitizens), a demonstrative world map, and recent inductions from chain.",
};

/**
 * Population / census (§7.11) — read-only, public. Server Component mounting the
 * client island. The dashboard layout already wraps every page in DashboardShell.
 */
export default function DashboardPopulationPage() {
  return <PopulationApp />;
}
