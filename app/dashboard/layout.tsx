import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/guard";
import { DashboardShell } from "@/components/shell/DashboardShell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/auth");
  return <DashboardShell>{children}</DashboardShell>;
}
