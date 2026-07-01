import type { Metadata } from "next";
import { EmbassiesApp } from "@/components/embassies/EmbassiesApp";

export const metadata: Metadata = {
  title: "Embassies — CryptRepublic",
  description:
    "The embassy directory. Propose a new embassy on chain (citizens only), then record its details.",
};

/**
 * Embassies (§7.12). Server Component mounting the client island. The dashboard
 * layout already wraps every page in DashboardShell.
 */
export default function DashboardEmbassiesPage() {
  return <EmbassiesApp />;
}
