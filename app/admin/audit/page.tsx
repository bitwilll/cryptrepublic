import type { Metadata } from "next";
import { AuditViewer } from "@/components/admin/AuditViewer";

export const metadata: Metadata = {
  title: "Audit log — CryptRepublic admin",
  description: "Read-only administrative audit trail: filter and paginate.",
};

/** Audit viewer (Wave 9 C1). Read-only; rows are written by the mutations themselves. */
export default function AdminAuditPage() {
  return <AuditViewer />;
}
