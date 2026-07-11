import type { Metadata } from "next";
import { InvestApp } from "@/components/invest/InvestApp";

export const metadata: Metadata = {
  title: "Projects & Investment — CryptRepublic",
  description:
    "Citizen fundraising for citizen projects. Endorse filings, pledge to active fundraisers, and track your own — pledges are recorded commitments; settlement is wallet-to-wallet and the Republic never holds funds.",
};

/**
 * Projects & investment (Wave 16). Server Component mounting the client
 * island; the dashboard layout provides the session gate + shell chrome.
 * Everything on this page is a REGISTRY ROW — no funds are held or moved
 * anywhere in this vertical.
 */
export default function InvestPage() {
  return <InvestApp />;
}
