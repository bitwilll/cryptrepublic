// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ErrorPage from "./error";

/**
 * Global error boundary (Wave 8 A3): in-voice copy, a RETRY button wired to
 * `reset()`, a link home — and NEVER the raw `error.message` (no internals
 * leaked to the citizen).
 */
describe("app/error.tsx", () => {
  it("renders the in-voice fault copy without leaking error internals", () => {
    const error = Object.assign(new Error("secret internal detail"), {
      digest: "digest-123",
    });
    render(<ErrorPage error={error} reset={() => {}} />);
    expect(
      screen.getByRole("heading", { name: /THE REPUBLIC ENCOUNTERED AN ERROR/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/SYSTEM FAULT/i)).toBeInTheDocument();
    expect(screen.queryByText(/secret internal detail/i)).toBeNull();
  });

  it("RETRY calls reset() and a link leads home", () => {
    const reset = vi.fn();
    const error = Object.assign(new Error("boom"), { digest: "d" });
    render(<ErrorPage error={error} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: /RETRY/i }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: /RETURN TO THE REPUBLIC/i })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
