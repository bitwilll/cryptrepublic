// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CountTile } from "./CountTile";

/**
 * CountTile (Wave 10 C2): a count + Spark sparkline. `value:null` → an honest
 * "—" + "chain unavailable" note (NEVER a fake number); `<2` points → Spark's
 * flat-baseline empty state (no fabricated curve).
 */

describe("CountTile", () => {
  it("renders the real value with an aria-label naming it", () => {
    render(<CountTile label="Users" value={42} testid="users-tile" />);
    const tile = screen.getByTestId("users-tile");
    expect(tile).toHaveTextContent("42");
    expect(tile.getAttribute("aria-label")).toBe("Users: 42");
  });

  it("value:null → '—' + the chain-unavailable note, never a fabricated number", () => {
    render(<CountTile label="Citizens" value={null} testid="citizens-tile" />);
    const tile = screen.getByTestId("citizens-tile");
    expect(tile).toHaveTextContent("—");
    expect(screen.getByTestId("citizens-tile-unavailable")).toHaveTextContent(/chain unavailable/i);
    expect(tile.getAttribute("aria-label")).toBe("Citizens: unavailable");
  });

  it("<2 sparkline points → the flat baseline (spark-empty), no fabricated curve", () => {
    render(<CountTile label="Users" value={42} testid="users-tile" />);
    expect(screen.getByTestId("spark-empty")).toBeInTheDocument();
  });

  it("a real ≥2-point series renders a sparkline (no spark-empty)", () => {
    render(<CountTile label="Users" value={42} points={[1, 3, 2, 5]} testid="users-tile" />);
    expect(screen.queryByTestId("spark-empty")).not.toBeInTheDocument();
  });
});
