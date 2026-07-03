import type { NavIconKind } from "./NavIcon";

/** The dashboard sidebar nav items. `href` uses real App Router routes (next/link),
 *  NOT the mockup's `goto(id)` state machine. */
export interface NavItem {
  href: string;
  label: string;
  icon: NavIconKind;
  /** which badge (if any) this item surfaces in the sidebar */
  badge?: "proposals" | "dividend";
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "Citizen home", icon: "home" },
  { href: "/dashboard/governance", label: "Constitution & votes", icon: "gov", badge: "proposals" },
  { href: "/dashboard/treasury", label: "Treasury", icon: "treasury" },
  { href: "/dashboard/population", label: "Population", icon: "population" },
  { href: "/dashboard/passport", label: "Your passport", icon: "passport" },
  { href: "/dashboard/holdings", label: "Sovereign holdings", icon: "holdings", badge: "dividend" },
  { href: "/dashboard/embassies", label: "Embassies", icon: "embassy" },
  { href: "/dashboard/referrals", label: "Referrals & trust", icon: "referrals" },
  { href: "/dashboard/wallet", label: "Wallet & chain", icon: "wallet" },
] as const;

/** True when `pathname` is the active route for `href` (exact for the root, prefix otherwise). */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}
