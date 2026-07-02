import { Spark } from "@/components/ui/Spark";

/**
 * Count + sparkline tile (Wave 10 C2). HONESTY: `value:null` renders "—" plus
 * a "chain unavailable" note — never a fabricated number; a missing/short
 * `points` series renders Spark's flat baseline — never a fabricated curve.
 */
export function CountTile({
  label,
  value,
  points,
  testid = "count-tile",
}: {
  label: string;
  value: number | null;
  points?: readonly number[];
  testid?: string;
}) {
  return (
    <div
      role="group"
      aria-label={`${label}: ${value ?? "unavailable"}`}
      data-testid={testid}
      style={{ minWidth: 120, flex: "1 1 120px" }}
    >
      <div style={{ fontFamily: "var(--mono)", fontSize: 28, fontWeight: 800 }}>{value ?? "—"}</div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginTop: 2,
        }}
      >
        {label}
      </div>
      {value === null && (
        <div
          data-testid={`${testid}-unavailable`}
          style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}
        >
          chain unavailable
        </div>
      )}
      <Spark points={points ?? []} height={36} />
    </div>
  );
}
