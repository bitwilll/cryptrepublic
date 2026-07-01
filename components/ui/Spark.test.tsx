// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Spark } from "./Spark";

/**
 * Spark renders a <path> for a non-empty series and an explicit empty state for
 * []. It never generates random data (callers pass a real series).
 */
describe("Spark", () => {
  it("renders a line <path> for a non-empty series", () => {
    const { container } = render(<Spark points={[1, 3, 2, 5, 4]} />);
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBeGreaterThan(0);
    // the line path has a non-empty `d`
    const hasLine = Array.from(paths).some((p) => (p.getAttribute("d") ?? "").includes("L"));
    expect(hasLine).toBe(true);
  });

  it("renders an empty/flat state for []", () => {
    const { container, getByTestId } = render(<Spark points={[]} />);
    expect(getByTestId("spark-empty")).toBeInTheDocument();
    // no multi-point line path
    const hasLine = Array.from(container.querySelectorAll("path")).some((p) =>
      (p.getAttribute("d") ?? "").includes("L"),
    );
    expect(hasLine).toBe(false);
  });
});
