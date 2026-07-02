// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { BarChart } from "./BarChart";

/**
 * BarChart (Wave 10 C2): a self-contained inline SVG (role="img", aria-label,
 * <title>/<desc>) PLUS a visually-hidden <table> as the accessible data
 * alternative. Zero data → an honest empty note, never a fabricated chart.
 */

const DATA = [
  { label: "DRAFT", value: 5 },
  { label: "ATTESTED", value: 0 },
  { label: "SEALED", value: 7 },
];

describe("BarChart", () => {
  it("renders an <svg role='img'> with the title as accessible name + <title>/<desc>", () => {
    render(<BarChart data={DATA} title="Applications by status" testid="apps-chart" />);
    const svg = screen.getByRole("img", { name: /applications by status/i });
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg.querySelector("title")?.textContent).toMatch(/applications by status/i);
    expect(svg.querySelector("desc")?.textContent).toMatch(/DRAFT: 5/);
    expect(svg.querySelector("desc")?.textContent).toMatch(/SEALED: 7/);
  });

  it("renders a visually-hidden data table listing every label→value", () => {
    render(<BarChart data={DATA} title="Applications by status" testid="apps-chart" />);
    const table = screen.getByTestId("apps-chart-table");
    expect(table.tagName.toLowerCase()).toBe("table");
    // sr-only, not display:none — assistive tech must still read it.
    expect(table.style.position).toBe("absolute");
    for (const d of DATA) {
      const row = within(table).getByText(d.label).closest("tr")!;
      expect(within(row).getByText(String(d.value))).toBeInTheDocument();
    }
  });

  it("renders the visible title (figcaption)", () => {
    render(<BarChart data={DATA} title="Applications by status" testid="apps-chart" />);
    expect(screen.getByTestId("apps-chart-title")).toHaveTextContent("Applications by status");
  });

  it("zero data → honest empty note, no SVG, no fabricated bars", () => {
    render(<BarChart data={[]} title="Applications by status" testid="apps-chart" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByTestId("apps-chart-empty")).toHaveTextContent(/no data/i);
  });

  it("all-zero values still render honestly (zero-height bars, real 0s in the table)", () => {
    render(
      <BarChart
        data={[
          { label: "A", value: 0 },
          { label: "B", value: 0 },
        ]}
        title="Zeros"
        testid="zeros"
      />,
    );
    const table = screen.getByTestId("zeros-table");
    expect(within(table).getAllByText("0")).toHaveLength(2);
  });
});
