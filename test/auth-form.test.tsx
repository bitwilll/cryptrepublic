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
});
