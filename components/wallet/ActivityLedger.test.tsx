// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TxRow } from "@/lib/wallet/services/history";
import { ActivityLedger } from "./ActivityLedger";

/**
 * ActivityLedger tests. Renders REAL history rows (no fabricated demo data),
 * shows the correct direction (in → RECEIVE, out → SEND), links to the explorer
 * when a base is provided, and shows an empty state when there are no rows.
 */

const IN: TxRow = {
  hash: "0xaaa",
  from: "0x1111111111111111111111111111111111111111",
  to: "0x2222222222222222222222222222222222222222",
  value: "100",
  timestamp: 1_700_000_000_000,
  direction: "in",
};
const OUT: TxRow = {
  hash: "0xbbb",
  from: "0x2222222222222222222222222222222222222222",
  to: "0x3333333333333333333333333333333333333333",
  value: "250",
  timestamp: 1_700_000_100_000,
  direction: "out",
};

describe("ActivityLedger", () => {
  it("renders rows with the correct direction", () => {
    render(<ActivityLedger rows={[IN, OUT]} explorerBase={null} />);
    expect(screen.getByTestId("activity-dir-0xaaa")).toHaveTextContent("RECEIVE");
    expect(screen.getByTestId("activity-dir-0xbbb")).toHaveTextContent("SEND");
    expect(screen.getByTestId("activity-row-0xaaa")).toHaveTextContent("100");
    expect(screen.getByTestId("activity-row-0xbbb")).toHaveTextContent("250");
    expect(screen.queryByTestId("activity-empty")).not.toBeInTheDocument();
  });

  it("links to the explorer when a base is provided", () => {
    render(<ActivityLedger rows={[IN]} explorerBase="https://basescan.org" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://basescan.org/tx/0xaaa");
  });

  it("renders NO explorer link when no base is provided", () => {
    render(<ActivityLedger rows={[IN]} explorerBase={null} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no rows", () => {
    render(<ActivityLedger rows={[]} explorerBase={null} />);
    expect(screen.getByTestId("activity-empty")).toHaveTextContent(/no on-chain activity/i);
  });
});
