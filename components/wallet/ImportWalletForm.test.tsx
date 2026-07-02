// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  importCalls: [] as unknown[][],
  importThrows: null as string | null,
  vaultExists: false,
}));

vi.mock("@/lib/wallet/embedded/session", () => ({
  importWallet: vi.fn(async (...args: unknown[]) => {
    h.importCalls.push(args);
    if (h.importThrows) throw new Error(h.importThrows);
    return { accounts: { evm: "0xE", solana: "S", bitcoin: "B" } };
  }),
}));

vi.mock("@/lib/wallet/embedded/storage", () => ({
  hasVault: vi.fn(async () => h.vaultExists),
}));

import { ImportWalletForm } from "./ImportWalletForm";

const M =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon " +
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon " +
  "abandon abandon abandon art";
const PASS = "a-long-enough-passphrase";

beforeEach(() => {
  h.importCalls = [];
  h.importThrows = null;
  h.vaultExists = false;
});

function fill() {
  fireEvent.change(screen.getByLabelText(/recovery phrase/i), { target: { value: M } });
  fireEvent.change(screen.getByLabelText(/vault passphrase/i), { target: { value: PASS } });
}

describe("ImportWalletForm", () => {
  it("submits a valid phrase → importWallet(pass, phrase, 'Primary', false) → onImported", async () => {
    const onImported = vi.fn();
    render(<ImportWalletForm onImported={onImported} />);
    fill();
    fireEvent.click(screen.getByTestId("import-submit"));
    await waitFor(() => expect(onImported).toHaveBeenCalled());
    expect(h.importCalls[0]).toEqual([PASS, M, "Primary", false]);
    // The textarea is cleared on success (the phrase is never left around).
    expect((screen.getByLabelText(/recovery phrase/i) as HTMLTextAreaElement).value).toBe("");
  });

  it("shows an inline alert when importWallet rejects (invalid phrase) — no success callback", async () => {
    h.importThrows = "Invalid recovery phrase. Check the words and try again.";
    const onImported = vi.fn();
    render(<ImportWalletForm onImported={onImported} />);
    fill();
    fireEvent.click(screen.getByTestId("import-submit"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/invalid/i));
    expect(onImported).not.toHaveBeenCalled();
  });

  it("rejects a short passphrase client-side without calling importWallet", async () => {
    render(<ImportWalletForm onImported={() => {}} />);
    fireEvent.change(screen.getByLabelText(/recovery phrase/i), { target: { value: M } });
    fireEvent.change(screen.getByLabelText(/vault passphrase/i), { target: { value: "short" } });
    fireEvent.click(screen.getByTestId("import-submit"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/at least 12/i));
    expect(h.importCalls).toHaveLength(0);
  });

  it("an existing vault gates submit behind the explicit OVERWRITE confirmation", async () => {
    h.vaultExists = true;
    render(<ImportWalletForm onImported={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("overwrite-confirm")).toBeInTheDocument());
    fill();
    expect(screen.getByTestId("import-submit")).toBeDisabled();
    fireEvent.click(screen.getByTestId("overwrite-confirm"));
    expect(screen.getByTestId("import-submit")).toBeEnabled();
    fireEvent.click(screen.getByTestId("import-submit"));
    await waitFor(() => expect(h.importCalls).toHaveLength(1));
    // overwrite=true flows through only after the confirmed checkbox.
    expect(h.importCalls[0]![3]).toBe(true);
  });
});
