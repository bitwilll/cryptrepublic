// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DashboardError from "./error";

/**
 * Dashboard segment error boundary (Wave 8 A3): renders inside the shell's
 * content slot with a per-segment RETRY via `reset()`; same in-voice contract
 * as the global boundary (no raw error internals).
 */
describe("app/dashboard/error.tsx", () => {
  it("renders in-voice copy without the raw error message and RETRY calls reset()", () => {
    const reset = vi.fn();
    const error = Object.assign(new Error("stack trace goes here"), {
      digest: "digest-456",
    });
    render(<DashboardError error={error} reset={reset} />);
    expect(screen.getByText(/SYSTEM FAULT/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /THIS SCREEN FAILED TO LOAD/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/stack trace goes here/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /RETRY/i }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: /CITIZEN HOME/i })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });
});
