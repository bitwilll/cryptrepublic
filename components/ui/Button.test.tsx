import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("renders a primary button with label", () => {
    render(<Button variant="primary">Mint passport</Button>);
    const el = screen.getByRole("button", { name: "Mint passport" });
    expect(el.className).toContain("btn");
    expect(el.className).toContain("btn-primary");
  });

  it("renders as an anchor when as='a' with href", () => {
    render(
      <Button as="a" href="/auth" variant="gold">
        Enter
      </Button>,
    );
    const el = screen.getByRole("link", { name: "Enter" });
    expect(el).toHaveAttribute("href", "/auth");
    expect(el.className).toContain("btn-gold");
  });
});
