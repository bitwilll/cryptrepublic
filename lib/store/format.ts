/**
 * Client-safe display helpers for the Citizen Store (Wave 15). Pure string
 * work — priceCoin is ALWAYS a decimal string (never parsed into a float for
 * storage; Number() here is display-only padding).
 */

/** "128" → "128.00 $CRYPT"; "9.5" → "9.50 $CRYPT". Input already validated server-side. */
export function formatCoin(priceCoin: string): string {
  const [whole, frac = ""] = priceCoin.split(".");
  const padded = (frac + "00").slice(0, 2);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${grouped}.${padded} $CRYPT`;
}

export const CATEGORY_LABELS: Record<string, string> = {
  GOODS: "Goods",
  SERVICES: "Services",
  COLLECTIBLES: "Collectibles",
  OTHER: "Other",
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
