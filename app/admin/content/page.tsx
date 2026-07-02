import type { Metadata } from "next";
import { ContentApp } from "@/components/admin/ContentApp";

export const metadata: Metadata = {
  title: "Content — CryptRepublic admin",
  description:
    "Tabbed CRUD over the DB-served content groups + comment moderation (honesty rules enforced).",
};

/** Content registry (Wave 9 C3). The layout guard already gates + wraps in AdminShell. */
export default function AdminContentPage() {
  return <ContentApp />;
}
