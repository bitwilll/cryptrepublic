// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Modal } from "./Modal";

/**
 * Modal renders children, the Close button fires onClose, Escape closes,
 * focus moves into the dialog on open and RETURNS to the trigger on unmount
 * (a11y, Wave 8 A2), the dialog is labelled by its visible h2 via
 * aria-labelledby, and a re-render with a NEW onClose identity (EmbassiesApp's
 * 12s poll tick) does NOT steal focus from a control inside the dialog.
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

  it("moves focus into the dialog on open", () => {
    render(
      <Modal title="Cast vote" onClose={() => {}}>
        <p>body</p>
      </Modal>,
    );
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  it("restores focus to the previously focused element on unmount", () => {
    render(<button type="button">trigger</button>);
    const trigger = screen.getByRole("button", { name: /trigger/i });
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = render(
      <Modal title="Cast vote" onClose={() => {}}>
        <p>body</p>
      </Modal>,
    );
    expect(document.activeElement).toBe(screen.getByRole("dialog"));

    unmount();
    expect(document.activeElement).toBe(trigger);
  });

  it("is labelled by the visible h2 via aria-labelledby (not aria-label)", () => {
    render(
      <Modal title="Cast vote" onClose={() => {}}>
        <p>body</p>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    const heading = screen.getByRole("heading", { name: /cast vote/i });
    // Mechanism-specific (post-review addendum 9): the accessible name must
    // resolve via aria-labelledby pointing at the h2 — not a bare aria-label.
    expect(heading.id).toBeTruthy();
    expect(dialog).toHaveAttribute("aria-labelledby", heading.id);
    expect(dialog).not.toHaveAttribute("aria-label");
    // GREEN supplement: the accessible name still resolves.
    expect(screen.getByRole("dialog", { name: /cast vote/i })).toBeInTheDocument();
  });

  it("does NOT steal focus when re-rendered with a new onClose identity (12s poll tick)", () => {
    const { rerender } = render(
      <Modal title="Propose embassy" onClose={() => {}}>
        <input aria-label="City" />
      </Modal>,
    );
    const input = screen.getByLabelText("City");
    input.focus();
    expect(document.activeElement).toBe(input);

    // EmbassiesApp re-renders every 12s via useChainInfo's poll and hands the
    // modal a FRESH inline onClose closure each tick.
    rerender(
      <Modal title="Propose embassy" onClose={() => {}}>
        <input aria-label="City" />
      </Modal>,
    );
    expect(document.activeElement).toBe(input);
  });
});
