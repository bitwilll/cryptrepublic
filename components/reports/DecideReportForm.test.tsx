// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DecideReportForm } from "./DecideReportForm";

/**
 * DecideReportForm (Wave 17) — the shared band-validated decision form.
 * Asserts live band validation (grade V penalty −50 shows the band error and
 * blocks submission), the required verify note, the two-step confirm (a valid
 * submit ARMS; only the confirm fires onSubmit; edits disarm), and the
 * dismiss path's optional note.
 */

function setup(onSubmit = vi.fn()) {
  render(
    <DecideReportForm
      idPrefix="t1"
      suggestedGrade="II"
      busy={false}
      error={null}
      onSubmit={onSubmit}
    />,
  );
  return onSubmit;
}

describe("DecideReportForm — verify band validation", () => {
  it("rejects a grade V penalty of −50 live (outside −100..−60) and blocks submission", () => {
    const onSubmit = setup();
    fireEvent.change(screen.getByTestId("t1-grade-select"), { target: { value: "V" } });
    expect(screen.getByTestId("t1-forfeit-warning")).toBeTruthy(); // grade V warns about forfeiture
    fireEvent.change(screen.getByTestId("t1-penalty-input"), { target: { value: "-50" } });
    fireEvent.blur(screen.getByTestId("t1-penalty-input"));
    expect(screen.getByText("Grade V penalties must be between -100 and -60.")).toBeTruthy();

    fireEvent.change(screen.getByTestId("t1-note-input"), { target: { value: "Established." } });
    fireEvent.click(screen.getByTestId("t1-submit"));
    expect(screen.queryByTestId("t1-confirm-box")).toBeNull(); // never armed
    expect(onSubmit).not.toHaveBeenCalled();

    // The same penalty is VALID for grade IV (−60..−30).
    fireEvent.change(screen.getByTestId("t1-grade-select"), { target: { value: "IV" } });
    expect(screen.queryByText(/penalties must be between/)).toBeNull();
  });

  it("requires a note to verify", () => {
    const onSubmit = setup();
    fireEvent.change(screen.getByTestId("t1-penalty-input"), { target: { value: "-10" } });
    fireEvent.click(screen.getByTestId("t1-submit"));
    expect(screen.getByText("Verification requires a note.")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("two-step: a valid submit arms; confirm fires the payload; an edit disarms", () => {
    const onSubmit = setup();
    fireEvent.change(screen.getByTestId("t1-penalty-input"), { target: { value: "-10" } });
    fireEvent.change(screen.getByTestId("t1-note-input"), {
      target: { value: "Misrepresentation established." },
    });
    fireEvent.click(screen.getByTestId("t1-submit"));
    expect(onSubmit).not.toHaveBeenCalled(); // armed, not fired
    expect(screen.getByTestId("t1-confirm-box")).toBeTruthy();

    // An edit disarms the pending confirmation.
    fireEvent.change(screen.getByTestId("t1-penalty-input"), { target: { value: "-12" } });
    expect(screen.queryByTestId("t1-confirm-box")).toBeNull();

    fireEvent.click(screen.getByTestId("t1-submit"));
    fireEvent.click(screen.getByTestId("t1-confirm"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      action: "verify",
      grade: "II",
      penalty: -12,
      note: "Misrepresentation established.",
    });
  });
});

describe("DecideReportForm — dismiss", () => {
  it("dismisses with an optional note omitted when blank", () => {
    const onSubmit = setup();
    fireEvent.click(screen.getByTestId("t1-mode-dismiss"));
    fireEvent.click(screen.getByTestId("t1-submit"));
    expect(screen.getByTestId("t1-confirm-box")).toBeTruthy();
    fireEvent.click(screen.getByTestId("t1-confirm"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ action: "dismiss" });
  });
});
