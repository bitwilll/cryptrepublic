import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { AuthForm } from "@/app/auth/AuthForm";

describe("<AuthForm />", () => {
  it("defaults to sign-in with the pinned labels/text and toggles to register", () => {
    render(<AuthForm />);
    expect(screen.getByRole("tab", { name: /SIGN IN/i })).toHaveAttribute("aria-selected", "true");
    // sign-in labels (htmlFor+id pairing must resolve these)
    expect(screen.getByLabelText(/E-MAIL OF RECORD/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/PASSPHRASE/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /AUTHENTICATE/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/FULL OR CHOSEN NAME/i)).toBeNull();
    // toggle to register
    fireEvent.click(screen.getByRole("tab", { name: /REGISTER/i }));
    expect(screen.getByLabelText(/FULL OR CHOSEN NAME/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/CHOOSE A PASSPHRASE/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /MINT/i })).toBeInTheDocument();
  });
  it("renders the three wallet options and the console", () => {
    render(<AuthForm />);
    expect(screen.getByRole("button", { name: /MetaMask/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /WalletConnect/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ledger/i })).toBeInTheDocument();
    expect(screen.getByRole("log")).toHaveAttribute("aria-live", "polite");
  });

  it("shows a visible busy state (label swap + aria-busy) while registration is pending", async () => {
    // A never-resolving fetch keeps the submission in-flight so the busy state
    // is observable (Wave 8 A3 — the button previously only disabled).
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise<Response>(() => {}));
    try {
      render(<AuthForm />);
      fireEvent.click(screen.getByRole("tab", { name: /REGISTER/i }));
      fireEvent.change(screen.getByLabelText(/FULL OR CHOSEN NAME/i), {
        target: { value: "Test Citizen" },
      });
      fireEvent.change(screen.getByLabelText(/E-MAIL OF RECORD/i), {
        target: { value: "busy-state@example.org" },
      });
      fireEvent.change(screen.getByLabelText(/CHOOSE A PASSPHRASE/i), {
        target: { value: "correct horse battery staple" },
      });
      fireEvent.click(screen.getByRole("button", { name: /MINT/i }));

      const busyBtn = await screen.findByRole("button", { name: /TRANSMITTING/i });
      expect(busyBtn).toBeDisabled();
      expect(busyBtn).toHaveAttribute("aria-busy", "true");
      // the idle label is gone while in flight
      expect(screen.queryByRole("button", { name: /CREATE RECORD & PROCEED TO MINT/i })).toBeNull();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("shows the sign-in busy label while authentication is pending", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise<Response>(() => {}));
    try {
      render(<AuthForm />);
      fireEvent.change(screen.getByLabelText(/E-MAIL OF RECORD/i), {
        target: { value: "busy-state@example.org" },
      });
      fireEvent.change(screen.getByLabelText(/PASSPHRASE/i), {
        target: { value: "correct horse battery staple" },
      });
      fireEvent.click(screen.getByRole("button", { name: /AUTHENTICATE/i }));

      const busyBtn = await screen.findByRole("button", { name: /AUTHENTICATING/i });
      expect(busyBtn).toBeDisabled();
      expect(busyBtn).toHaveAttribute("aria-busy", "true");
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
