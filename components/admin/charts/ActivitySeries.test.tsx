// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ActivitySeries } from "./ActivitySeries";

/**
 * ActivitySeries (Wave 10 C2): small inline-SVG bar series for audit-activity
 * AND (reused) census-by-city. Same a11y contract as BarChart (role="img",
 * <title>/<desc>, visually-hidden table). CENSUS HONESTY: rendered with the
 * seeded title, the visible title AND the accessible alternative must both
 * carry the SEEDED/demonstrative/not-live wording — seeded geography is never
 * presented as real citizen distribution.
 */

const DAYS = [
  { label: "2026-06-30", value: 0 },
  { label: "2026-07-01", value: 3 },
  { label: "2026-07-02", value: 1 },
];

const SEEDED_TITLE = "Census by city (SEEDED — demonstrative, not live census)";

describe("ActivitySeries", () => {
  it("renders an <svg role='img'> named by the title, with <title>/<desc> carrying the values", () => {
    render(<ActivitySeries data={DAYS} title="Audit activity (14 days)" testid="audit-series" />);
    const svg = screen.getByRole("img", { name: /audit activity/i });
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg.querySelector("title")?.textContent).toMatch(/audit activity/i);
    expect(svg.querySelector("desc")?.textContent).toMatch(/2026-07-01: 3/);
  });

  it("renders a visually-hidden data table listing every label→value", () => {
    render(<ActivitySeries data={DAYS} title="Audit activity (14 days)" testid="audit-series" />);
    const table = screen.getByTestId("audit-series-table");
    expect(table.tagName.toLowerCase()).toBe("table");
    expect(table.style.position).toBe("absolute");
    const row = within(table).getByText("2026-07-01").closest("tr")!;
    expect(within(row).getByText("3")).toBeInTheDocument();
  });

  it("CENSUS HONESTY: the seeded title appears in the VISIBLE title AND the accessible alternative", () => {
    render(
      <ActivitySeries
        data={[{ label: "LIS", value: 1204 }]}
        title={SEEDED_TITLE}
        testid="census-series"
      />,
    );
    // Visible figcaption.
    expect(screen.getByTestId("census-series-title")).toHaveTextContent(/SEEDED/);
    expect(screen.getByTestId("census-series-title")).toHaveTextContent(/not live/i);
    // SVG accessible name + desc.
    const svg = screen.getByRole("img", { name: /SEEDED/ });
    expect(svg.querySelector("title")?.textContent).toMatch(/demonstrative/i);
    // Hidden-table caption.
    const table = screen.getByTestId("census-series-table");
    expect(within(table).getByText(/SEEDED/)).toBeInTheDocument();
  });

  it("zero data → honest empty note, no SVG", () => {
    render(<ActivitySeries data={[]} title="Audit activity (14 days)" testid="audit-series" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByTestId("audit-series-empty")).toHaveTextContent(/no activity/i);
  });
});
