// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import NotFound from "./not-found";

/**
 * 404 page (Wave 8 A3): in-voice copy + links back to the marketing home and
 * the dashboard.
 */
describe("app/not-found.tsx", () => {
  it("renders the in-voice 404 with links to / and /dashboard", () => {
    render(<NotFound />);
    expect(screen.getByText(/RECORD NOT FOUND/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /THIS TERRITORY IS UNCHARTED/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /RETURN TO THE REPUBLIC/i })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: /CITIZEN DASHBOARD/i })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });
});
