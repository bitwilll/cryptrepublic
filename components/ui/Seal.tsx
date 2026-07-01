export function Seal({ size = 30, color = "var(--gold)" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" fill="none" aria-hidden="true">
      <polygon
        points="15,1 25,5 29,15 25,25 15,29 5,25 1,15 5,5"
        stroke={color}
        strokeWidth="1.8"
        fill="none"
      />
      <text x="15" y="19.5" textAnchor="middle" fontFamily="var(--mono)" fontSize="11" fill={color}>
        CR
      </text>
    </svg>
  );
}
