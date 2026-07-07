/**
 * Pure SVG sparkline. Extracted from the mockup `Spark`, but WITHOUT the mockup's
 * baked-in `Math.random()` series (constraint #5 — no fabricated data). Callers
 * pass a REAL series (or an explicitly-labeled representative one). Renders an
 * empty/flat state for `[]`.
 */
export function Spark({
  points,
  color = "var(--gold-d)",
  bg = "transparent",
  width = 280,
  height = 50,
}: {
  points: readonly number[];
  color?: string;
  bg?: string;
  width?: number;
  height?: number;
}) {
  if (points.length < 2) {
    // Empty/flat state — a baseline rule, no fabricated curve.
    return (
      <svg
        data-testid="spark-empty"
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: "block", marginTop: 10 }}
      >
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke={color}
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity={0.4}
        />
      </svg>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * width;
  const y = (v: number) => height - 4 - ((v - min) / span) * (height - 8);
  const path = points
    .map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(" ");
  const area = `${path} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: "block", marginTop: 10 }}
    >
      <path d={area} fill={bg} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.4" />
    </svg>
  );
}
