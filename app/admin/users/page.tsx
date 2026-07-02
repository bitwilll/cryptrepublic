import type { Metadata } from "next";
import { UsersApp } from "@/components/admin/UsersApp";

export const metadata: Metadata = {
  title: "Users — CryptRepublic admin",
  description: "Search and manage registered users (allowlisted fields only).",
};

/** Users list (Wave 9 C2). The layout guard already gates + wraps in AdminShell. */
export default function AdminUsersPage() {
  return <UsersApp />;
}
