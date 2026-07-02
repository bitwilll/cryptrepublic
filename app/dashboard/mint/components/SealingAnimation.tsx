"use client";

/**
 * Ported from dash-mint.jsx <SealingAnimation>. Tokenized (uses var(--gold) /
 * var(--line)). The keyframes are scoped inside the SVG <style> (no inline
 * script; CSP-safe). Shown during the REAL pending→mined seal window.
 */
export function SealingAnimation(): React.ReactElement {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
      <style>{`
        @keyframes cr-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
        @keyframes cr-pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
        .cr-ring { transform-origin: 60px 60px; animation: cr-spin 4s linear infinite; }
        .cr-ring-r { animation: cr-spin 6s linear infinite reverse; transform-origin: 60px 60px; }
        .cr-pulse { animation: cr-pulse 1.4s ease-in-out infinite; }
        /* Belt-and-braces (Wave 8 A2): the global tokens.css reduced-motion
           kill-switch (* { animation: none !important }) already cascades into
           inline SVG; this local guard keeps the component safe standalone. */
        @media (prefers-reduced-motion: reduce) {
          .cr-ring, .cr-ring-r, .cr-pulse { animation: none; }
        }
      `}</style>
      <circle cx="60" cy="60" r="54" fill="none" stroke="var(--line)" strokeWidth="1" />
      <g className="cr-ring">
        <circle
          cx="60"
          cy="60"
          r="48"
          fill="none"
          stroke="var(--gold)"
          strokeWidth="1.4"
          strokeDasharray="4 8"
        />
      </g>
      <g className="cr-ring-r">
        <circle
          cx="60"
          cy="60"
          r="38"
          fill="none"
          stroke="var(--gold)"
          strokeWidth="1"
          strokeDasharray="2 5"
          opacity="0.6"
        />
      </g>
      <g className="cr-pulse">
        <polygon
          points="60,30 84,42 84,78 60,90 36,78 36,42"
          fill="none"
          stroke="var(--gold)"
          strokeWidth="1.6"
        />
      </g>
      <text
        x="60"
        y="68"
        textAnchor="middle"
        fontFamily="var(--serif)"
        fontSize="28"
        fill="var(--gold)"
      >
        CR
      </text>
    </svg>
  );
}
