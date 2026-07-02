import type { Metadata } from "next";
import { FlagsApp } from "@/components/admin/FlagsApp";

export const metadata: Metadata = {
  title: "Feature flags — CryptRepublic admin",
  description: "Flag rows + declared defaults; toggles are audit-logged.",
};

/** Feature flags (Wave 9 C3). The layout guard already gates + wraps in AdminShell. */
export default function AdminFlagsPage() {
  return <FlagsApp />;
}
