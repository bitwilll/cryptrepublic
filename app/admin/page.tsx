import type { Metadata } from "next";
import { AdminOverviewApp } from "@/components/admin/AdminOverviewApp";

export const metadata: Metadata = {
  title: "Admin overview — CryptRepublic",
  description: "Role-gated back office: counts and the recent audit trail.",
};

/** Admin overview (Wave 9 C1). The layout guard already gates + wraps in AdminShell. */
export default function AdminOverviewPage() {
  return <AdminOverviewApp />;
}
