/**
 * Line-art nav icons ported verbatim from the Dashboard.html mockup (lines
 * 170–184). Pure SVG, no external icon dependency (keeps the CSP clean).
 */
export type NavIconKind =
  | "home"
  | "gov"
  | "treasury"
  | "population"
  | "passport"
  | "embassy"
  | "mint"
  | "holdings"
  | "wallet"
  | "referrals"
  | "trust"
  | "certificate"
  | "store"
  | "bitwill"
  | "insurance";

export function NavIcon({
  kind,
  color = "currentColor",
  size = 18,
}: {
  kind: NavIconKind;
  color?: string;
  size?: number;
}) {
  const p = { stroke: color, strokeWidth: 1.6, fill: "none" as const };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ display: "block", flexShrink: 0 }}
      aria-hidden="true"
    >
      {kind === "home" && (
        <g {...p}>
          <path d="M3 11 L12 3 L21 11" />
          <path d="M5 10 V21 H19 V10" />
          <rect x="10" y="14" width="4" height="7" />
        </g>
      )}
      {kind === "gov" && (
        <g {...p}>
          <path d="M3 21 H21" />
          <path d="M3 21 L3 10 L21 10 L21 21" />
          <path d="M2 10 L12 4 L22 10" />
          <line x1="7" y1="10" x2="7" y2="21" />
          <line x1="12" y1="10" x2="12" y2="21" />
          <line x1="17" y1="10" x2="17" y2="21" />
        </g>
      )}
      {kind === "treasury" && (
        <g {...p}>
          <rect x="3" y="6" width="18" height="14" rx="1" />
          <path d="M3 10 H21" />
          <circle cx="12" cy="15" r="2.5" />
        </g>
      )}
      {kind === "population" && (
        <g {...p}>
          <circle cx="12" cy="12" r="9" />
          <ellipse cx="12" cy="12" rx="9" ry="4" />
          <ellipse cx="12" cy="12" rx="4" ry="9" />
        </g>
      )}
      {kind === "passport" && (
        <g {...p}>
          <rect x="5" y="3" width="14" height="18" rx="1" />
          <circle cx="12" cy="10" r="3" />
          <path d="M9 16 H15" />
          <path d="M9 18 H15" />
        </g>
      )}
      {kind === "embassy" && (
        <g {...p}>
          <path d="M3 21 H21" />
          <path d="M5 21 V11" />
          <path d="M19 21 V11" />
          <path d="M3 11 L12 5 L21 11" />
          <rect x="10" y="14" width="4" height="7" />
        </g>
      )}
      {kind === "mint" && (
        <g {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7 V17" />
          <path d="M7 12 H17" />
        </g>
      )}
      {kind === "holdings" && (
        <g {...p}>
          <polygon points="12,3 21,8 21,16 12,21 3,16 3,8" />
          <polyline points="3,8 12,13 21,8" />
          <line x1="12" y1="13" x2="12" y2="21" />
        </g>
      )}
      {kind === "wallet" && (
        <g {...p}>
          <rect x="3" y="7" width="18" height="12" rx="2" />
          <path d="M3 9 H 17 V 5 H 5 Q 3 5 3 7 Z" />
          <circle cx="17" cy="13" r="1.5" fill={color} />
        </g>
      )}
      {kind === "referrals" && (
        <g {...p}>
          <circle cx="6" cy="7" r="2.5" />
          <circle cx="18" cy="7" r="2.5" />
          <circle cx="12" cy="17" r="2.5" />
          <line x1="8" y1="8.5" x2="10.5" y2="15" />
          <line x1="16" y1="8.5" x2="13.5" y2="15" />
        </g>
      )}
      {kind === "trust" && (
        <g {...p}>
          <path d="M12 3 L20 6 V12 C20 16.5 16.5 20 12 21 C7.5 20 4 16.5 4 12 V6 Z" />
          <polyline points="8.5,12 11,14.5 15.5,9.5" />
        </g>
      )}
      {kind === "certificate" && (
        <g {...p}>
          <rect x="4" y="4" width="16" height="13" />
          <path d="M7 8 H17" />
          <path d="M7 11 H13" />
          <circle cx="15.5" cy="15" r="2.2" />
          <path d="M14.5 17 L14 21 L15.5 19.8 L17 21 L16.5 17" />
        </g>
      )}
      {kind === "store" && (
        <g {...p}>
          <path d="M4 9 L5 4 H19 L20 9" />
          <path d="M4 9 H20 V11 C20 12 19 13 18 13 C17 13 16 12 16 11 C16 12 15 13 14 13 C13 13 12 12 12 11 C12 12 11 13 10 13 C9 13 8 12 8 11 C8 12 7 13 6 13 C5 13 4 12 4 11 Z" />
          <path d="M5 13 V20 H19 V13" />
          <rect x="10" y="16" width="4" height="4" />
        </g>
      )}
      {kind === "bitwill" && (
        <g {...p}>
          <path d="M7 3 H17 C18 3 19 4 19 5 V21 L16 19 L12 21 L8 19 L5 21 V5 C5 4 6 3 7 3 Z" />
          <path d="M9 8 H15" />
          <path d="M9 11 H15" />
          <path d="M9 14 H12" />
        </g>
      )}
      {kind === "insurance" && (
        <g {...p}>
          <path d="M12 3 C7 3 3 7 3 12 H21 C21 7 17 3 12 3 Z" />
          <path d="M12 12 V18 C12 20 10.5 21 9 21" />
          <path d="M12 3 V2" />
        </g>
      )}
    </svg>
  );
}
