import type { Metadata } from "next";
import { ConductDeskApp } from "@/components/admin/ConductDeskApp";

export const metadata: Metadata = {
  title: "Conduct desk — CryptRepublic admin",
  description:
    "Review submitted conduct reports, enter graded verifications under the Penal Code, and " +
    "browse the verified and dismissed ledgers. Every decision is audit-logged.",
};

/** Conduct desk (Wave 17). The layout guard already gates + wraps in AdminShell. */
export default function AdminReportsPage() {
  return <ConductDeskApp />;
}
