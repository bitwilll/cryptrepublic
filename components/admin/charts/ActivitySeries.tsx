import { ChartTitle, DataTable, type ChartDatum } from "./BarChart";

/**
 * Small inline-SVG bar series (Wave 10 C2) — audit-activity-over-time and
 * (reused) census-by-city. Same a11y contract as BarChart: role="img" +
 * aria-label + <title>/<desc> + a visually-hidden data table. CENSUS HONESTY:
 * the caller passes the SEEDED/demonstrative title when the data is
 * CityCensus.seededCount — it flows into the visible caption, the SVG name,
 * and the table caption, so seeded geography is never shown as live census.
 * viewBox + width:100% — never a horizontal-overflow source.
 */
const W = 520;
const H = 120;
const PAD_T = 14;
const PAD_B = 22;
const PAD_X = 8;

export function ActivitySeries({
  data,
  title,
  testid = "activity-series",
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
          No activity yet.
        </p>
      </figure>
    );
  }

  const max = Math.max(1, ...data.map((d) => d.value));
  const slot = (W - PAD_X * 2) / data.length;
  const barW = Math.max(2, slot * 0.55);
  const desc = data.map((d) => `${d.label}: ${d.value}`).join("; ");
  // Dense series (14 day-buckets) label only the ends; short ones label all.
  const labelEvery = data.length <= 10 ? 1 : data.length - 1;

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
          return (
            <g key={d.label}>
              <rect x={x} y={H - PAD_B - h} width={barW} height={h} fill="var(--gold)" />
              {i % labelEvery === 0 && (
                <text
                  x={PAD_X + i * slot + slot / 2}
                  y={H - PAD_B + 14}
                  textAnchor="middle"
                  fontSize={8}
                  fontFamily="var(--mono)"
                  fill="var(--muted)"
                >
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <DataTable data={data} title={title} testid={testid} />
    </figure>
  );
}
