import type { Metadata } from "next";
import { ServicesDeskApp } from "@/components/admin/ServicesDeskApp";

export const metadata: Metadata = {
  title: "Services desk — CryptRepublic admin",
  description:
    "Insurance review queue, store moderation, and programme statistics. Every decision is audit-logged.",
};

/** Services desk (Wave 15 C). The layout guard already gates + wraps in AdminShell. */
export default function AdminServicesPage() {
  return <ServicesDeskApp />;
}
