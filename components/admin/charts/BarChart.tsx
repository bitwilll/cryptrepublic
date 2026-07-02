import { srOnly } from "../bits";

/**
 * Self-contained inline-SVG bar chart (Wave 10 C2) — applications-by-status.
 * No external script, no inline event handlers, no animation (CSP + reduced-
 * motion safe by construction). a11y: role="img" + aria-label + <title>/<desc>
 * AND a visually-hidden <table> as the real data alternative (addendum #7).
 * Scales via viewBox + width:100% — never a horizontal-overflow source.
 */
export interface ChartDatum {
  label: string;
  value: number;
}

const W = 520;
const H = 190;
const PAD_T = 18;
const PAD_B = 30;
const PAD_X = 10;

export function BarChart({
  data,
  title,
  testid = "bar-chart",
}: {
  data: readonly ChartDatum[];
  title: string;
  testid?: string;
}) {
  if (data.length === 0) {
    return (
      <figure style={{ margin: 0 }}>
        <ChartTitle testid={testid}>{title}</ChartTitle>
        <p data-testid={`${testid}-empty`} style={{ color: "var(--muted)", fontSize: 13 }}>
          No data yet.
        </p>
      </figure>
    );
  }

  const max = Math.max(1, ...data.map((d) => d.value));
  const slot = (W - PAD_X * 2) / data.length;
  const barW = Math.min(64, slot * 0.6);
  const desc = data.map((d) => `${d.label}: ${d.value}`).join("; ");

  return (
    <figure style={{ margin: 0 }}>
      <ChartTitle testid={testid}>{title}</ChartTitle>
      <svg
        role="img"
        aria-label={title}
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: "block" }}
      >
        <title>{title}</title>
        <desc>{desc}</desc>
        <line x1={PAD_X} y1={H - PAD_B} x2={W - PAD_X} y2={H - PAD_B} stroke="var(--line)" />
        {data.map((d, i) => {
          const h = (d.value / max) * (H - PAD_T - PAD_B);
          const x = PAD_X + i * slot + (slot - barW) / 2;
          const y = H - PAD_B - h;
          return (
            <g key={d.label}>
              <rect x={x} y={y} width={barW} height={h} fill="var(--navy)" />
              <text
                x={x + barW / 2}
                y={y - 5}
                textAnchor="middle"
                fontSize={12}
                fontFamily="var(--mono)"
                fill="var(--muted)"
              >
                {d.value}
              </text>
              <text
                x={PAD_X + i * slot + slot / 2}
                y={H - PAD_B + 16}
                textAnchor="middle"
                fontSize={9}
                fontFamily="var(--mono)"
                fill="var(--muted)"
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      <DataTable data={data} title={title} testid={testid} />
    </figure>
  );
}

/** Visible chart title — small mono caption above the SVG. */
export function ChartTitle({ children, testid }: { children: string; testid: string }) {
  return (
    <figcaption
      data-testid={`${testid}-title`}
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "var(--muted)",
        marginBottom: 8,
      }}
    >
      {children}
    </figcaption>
  );
}

/** The visually-hidden accessible data alternative (addendum #7). */
export function DataTable({
  data,
  title,
  testid,
}: {
  data: readonly ChartDatum[];
  title: string;
  testid: string;
}) {
  return (
    <table style={srOnly} data-testid={`${testid}-table`}>
      <caption>{title}</caption>
      <thead>
        <tr>
          <th scope="col">Label</th>
          <th scope="col">Value</th>
        </tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.label}>
            <th scope="row">{d.label}</th>
            <td>{d.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
