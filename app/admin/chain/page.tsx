import type { Metadata } from "next";
import { ChainActionsApp } from "@/components/admin/ChainActionsApp";

export const metadata: Metadata = {
  title: "Chain actions — CryptRepublic admin",
  description:
    "Contract params, confirmed role topology, and the prepared-transaction composer (never signs).",
};

/** Chain actions (Wave 9 C4). The layout guard already gates + wraps in AdminShell. */
export default function AdminChainPage() {
  return <ChainActionsApp />;
}
