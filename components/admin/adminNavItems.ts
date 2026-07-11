import type { NavIconKind } from "@/components/shell/NavIcon";
import { isActive } from "@/components/shell/navItems";

/** The admin back-office nav (Wave 9 C1). Real App Router routes under /admin. */
export interface AdminNavItem {
  href: string;
  label: string;
  icon: NavIconKind;
}

export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { href: "/admin", label: "Overview", icon: "home" },
  { href: "/admin/users", label: "Users", icon: "population" },
  { href: "/admin/applications", label: "Applications", icon: "passport" },
  { href: "/admin/content", label: "Content", icon: "holdings" },
  { href: "/admin/flags", label: "Flags", icon: "embassy" },
  { href: "/admin/chain", label: "Chain actions", icon: "wallet" },
  { href: "/admin/services", label: "Services desk", icon: "insurance" },
  { href: "/admin/fundraising", label: "Fundraising", icon: "holdings" },
  { href: "/admin/offices", label: "Offices", icon: "population" },
  { href: "/admin/audit", label: "Audit", icon: "gov" },
] as const;

/** Reuses the shell's isActive; "/admin" (Overview) matches EXACTLY, like "/dashboard". */
export function isAdminActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return isActive(pathname, href);
}
