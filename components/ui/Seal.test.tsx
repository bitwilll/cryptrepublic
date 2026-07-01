import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Seal } from "./Seal";

describe("Seal", () => {
  it("renders an svg at the requested size", () => {
    const { container } = render(<Seal size={30} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("width", "30");
  });
});
