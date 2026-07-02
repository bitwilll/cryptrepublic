// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WalletModeSelect } from "./WalletModeSelect";

describe("WalletModeSelect", () => {
  it("renders three mode cards as real buttons (keyboard-focusable)", () => {
    render(<WalletModeSelect onSelect={() => {}} />);
    for (const id of ["mode-embedded", "mode-hardware", "mode-watchonly"]) {
      const card = screen.getByTestId(id);
      expect(card.tagName).toBe("BUTTON");
    }
  });

  it("clicking each card fires onSelect with the right mode", () => {
    const onSelect = vi.fn();
    render(<WalletModeSelect onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("mode-embedded"));
    fireEvent.click(screen.getByTestId("mode-hardware"));
    fireEvent.click(screen.getByTestId("mode-watchonly"));
    expect(onSelect.mock.calls.map((c) => c[0])).toEqual(["embedded", "hardware", "watchonly"]);
  });
});
