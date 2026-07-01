// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Modal } from "./Modal";

/**
 * Modal renders children, the Close button fires onClose, and Escape closes.
 */
describe("Modal", () => {
  it("renders children", () => {
    render(
      <Modal title="Cast vote" onClose={() => {}}>
        <p>modal body</p>
      </Modal>,
    );
    expect(screen.getByText(/modal body/i)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("Close button fires onClose", () => {
    const onClose = vi.fn();
    render(
      <Modal title="Cast vote" onClose={onClose}>
        <p>body</p>
      </Modal>,
    );
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("Escape closes", () => {
    const onClose = vi.fn();
    render(
      <Modal title="Cast vote" onClose={onClose}>
        <p>body</p>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
