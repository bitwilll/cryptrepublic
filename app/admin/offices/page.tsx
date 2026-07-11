import type { Metadata } from "next";
import { OfficesDeskApp } from "@/components/admin/OfficesDeskApp";

export const metadata: Metadata = {
  title: "Offices desk — CryptRepublic admin",
  description:
    "The Council of the Republic roster, letters of appointment, and revocations. Offices are " +
    "honours and display only; every action is entered in the audit log.",
};

/** Offices desk (Wave 16). The layout guard already gates + wraps in AdminShell. */
export default function AdminOfficesPage() {
  return <OfficesDeskApp />;
}
