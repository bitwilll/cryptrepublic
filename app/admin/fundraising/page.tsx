import type { Metadata } from "next";
import { FundraisingDeskApp } from "@/components/admin/FundraisingDeskApp";

export const metadata: Metadata = {
  title: "Fundraising desk — CryptRepublic admin",
  description:
    "Review citizen fundraising proposals, monitor active projects and pledges, and close " +
    "completed campaigns. Registry rows only — the Republic never holds funds.",
};

/** Fundraising desk (Wave 16). The layout guard already gates + wraps in AdminShell. */
export default function AdminFundraisingPage() {
  return <FundraisingDeskApp />;
}
