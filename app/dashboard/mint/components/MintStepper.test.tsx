// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MintStepper, MINT_STEPS } from "./MintStepper";

describe("MintStepper", () => {
  it("renders all four step labels", () => {
    render(<MintStepper step={0} />);
    for (const label of MINT_STEPS) {
      expect(screen.getByText(label.toUpperCase())).toBeInTheDocument();
    }
  });

  it("marks steps before the active one as done (✓) and the active as its number", () => {
    render(<MintStepper step={2} />);
    // steps 0 and 1 done → ✓
    expect(screen.getByTestId("step-badge-0").textContent).toBe("✓");
    expect(screen.getByTestId("step-badge-1").textContent).toBe("✓");
    // active step 2 shows its number
    expect(screen.getByTestId("step-badge-2").textContent).toBe("03");
    // future step 3 shows its number
    expect(screen.getByTestId("step-badge-3").textContent).toBe("04");
  });

  it("marks every badge done when sealed", () => {
    render(<MintStepper step={3} sealed />);
    for (let i = 0; i < MINT_STEPS.length; i++) {
      expect(screen.getByTestId(`step-badge-${i}`).textContent).toBe("✓");
    }
  });
});
