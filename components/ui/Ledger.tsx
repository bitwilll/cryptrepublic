import type { ReactNode } from "react";

/**
 * Generic table primitive with the mono/uppercase header styling from the
 * mockups' ledgers (governance disbursements / holdings register / activity).
 * Reused by B2/B3/B4. Renders an `empty` slot when there are no rows — never a
 * blank table (state-matrix constraint #9).
 */
export interface LedgerColumn<Row> {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  render?: (row: Row) => ReactNode;
}

export function Ledger<Row extends Record<string, unknown>>({
  columns,
  rows,
  empty = "No entries yet.",
  getRowKey,
}: {
  columns: readonly LedgerColumn<Row>[];
  rows: readonly Row[];
  empty?: ReactNode;
  getRowKey?: (row: Row, index: number) => string;
}) {
  if (rows.length === 0) {
    return (
      <div
        data-testid="ledger-empty"
        style={{ padding: "20px 0", color: "var(--muted)", fontSize: 13 }}
      >
        {empty}
      </div>
    );
  }

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr>
          {columns.map((c) => (
            <th
              key={c.key}
              style={{
                textAlign: c.align ?? "left",
                padding: "8px 10px",
                borderBottom: "1px solid var(--line)",
                fontFamily: "var(--mono)",
                fontSize: 10,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--muted)",
                fontWeight: 700,
              }}
            >
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={getRowKey ? getRowKey(row, i) : i}>
            {columns.map((c) => (
              <td
                key={c.key}
                style={{
                  textAlign: c.align ?? "left",
                  padding: "10px",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                {c.render ? c.render(row) : String(row[c.key] ?? "")}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
