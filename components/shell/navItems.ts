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

/** A titled ministry section of the sidebar (Wave 15 — the nav outgrew a flat list). */
export interface NavSection {
  title: string;
  items: readonly NavItem[];
}

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    title: "Republic",
    items: [
      { href: "/dashboard", label: "Citizen home", icon: "home" },
      {
        href: "/dashboard/governance",
        label: "Constitution & votes",
        icon: "gov",
        badge: "proposals",
      },
      { href: "/dashboard/treasury", label: "Treasury", icon: "treasury" },
      { href: "/dashboard/population", label: "Population", icon: "population" },
      { href: "/dashboard/embassies", label: "Embassies", icon: "embassy" },
    ],
  },
  {
    title: "Identity",
    items: [
      { href: "/dashboard/passport", label: "Your passport", icon: "passport" },
      { href: "/dashboard/trust", label: "Trust score", icon: "trust" },
      { href: "/dashboard/certificates", label: "Certificates", icon: "certificate" },
    ],
  },
  {
    title: "Economy",
    items: [
      {
        href: "/dashboard/holdings",
        label: "Sovereign holdings",
        icon: "holdings",
        badge: "dividend",
      },
      { href: "/dashboard/wallet", label: "Wallet & chain", icon: "wallet" },
      { href: "/dashboard/store", label: "Citizen store", icon: "store" },
      { href: "/dashboard/invest", label: "Projects & invest", icon: "treasury" },
      { href: "/dashboard/bitwill", label: "BitWill estate", icon: "bitwill" },
      { href: "/dashboard/insurance", label: "Insurance", icon: "insurance" },
    ],
  },
  {
    title: "Community",
    items: [{ href: "/dashboard/referrals", label: "Referrals & trust", icon: "referrals" }],
  },
] as const;

/** Flat view of every nav item, in section order (kept for tests/back-compat). */
export const NAV_ITEMS: readonly NavItem[] = NAV_SECTIONS.flatMap((s) => [...s.items]);

/** True when `pathname` is the active route for `href` (exact for the root, prefix otherwise). */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}
