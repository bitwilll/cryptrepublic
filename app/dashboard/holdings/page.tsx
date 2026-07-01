import type { Metadata } from "next";
import { HoldingsApp } from "@/components/holdings/HoldingsApp";

export const metadata: Metadata = {
  title: "Sovereign Holdings — CryptRepublic",
  description:
    "The estate register (demonstrative) and your on-chain dividend claim. Dividends are likely a regulated security.",
};

/**
 * Sovereign holdings / dividends (§7.10). Server Component mounting the client
 * island. The dashboard layout already wraps every page in DashboardShell.
 */
export default function DashboardHoldingsPage() {
  return <HoldingsApp />;
}
