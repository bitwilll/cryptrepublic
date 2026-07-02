import type { Metadata } from "next";
import { ApplicationsApp } from "@/components/admin/ApplicationsApp";

export const metadata: Metadata = {
  title: "Applications — CryptRepublic admin",
  description: "Citizenship-application review queue, filtered by the real status machine.",
};

/** Applications list (Wave 9 C2). The layout guard already gates + wraps in AdminShell. */
export default function AdminApplicationsPage() {
  return <ApplicationsApp />;
}
