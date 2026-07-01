// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * SwapBridgeModal tests. Swap/bridge is a clearly-labeled TESTNET-MOCK in Wave 6:
 * a prominent banner MUST render, the mock `estOut` shows after a quote, and there
 * is NO execute/sign button (no signer path). `getSwapQuote` is mocked so the
 * quote is deterministic regardless of the ambient chain env.
 */

const getSwapQuote = vi.fn();
vi.mock("@/lib/wallet/services/swap", () => ({
  getSwapQuote: (...args: unknown[]) => getSwapQuote(...args),
}));

import { SwapBridgeModal } from "./SwapBridgeModal";

beforeEach(() => {
  getSwapQuote.mockReset();
});

describe("SwapBridgeModal", () => {
  it("renders the non-dismissible TESTNET-MOCK banner", () => {
    render(<SwapBridgeModal mode="swap" onClose={() => {}} />);
    const banner = screen.getByTestId("testnet-mock-banner");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/testnet mock/i);
    expect(banner).toHaveTextContent(/no funds move/i);
  });

  it("shows the mock estOut after requesting a quote", async () => {
    getSwapQuote.mockResolvedValue({
      mock: true,
      label: "TESTNET MOCK",
      fromToken: "ETH",
      toToken: "CRYPT",
      estOut: "990000",
    });
    render(<SwapBridgeModal mode="swap" onClose={() => {}} />);
    fireEvent.change(screen.getByTestId("swap-amount"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /get mock quote/i }));
    await waitFor(() => {
      const quote = screen.getByTestId("swap-quote");
      expect(quote).toHaveTextContent("990000");
      expect(quote).toHaveTextContent(/CRYPT/);
    });
    expect(getSwapQuote).toHaveBeenCalledTimes(1);
  });

  it("has NO execute/sign button — quote only", () => {
    render(<SwapBridgeModal mode="swap" onClose={() => {}} />);
    expect(
      screen.queryByRole("button", { name: /execute|sign|swap now|bridge now|confirm/i }),
    ).not.toBeInTheDocument();
    // The only actionable buttons are the quote request and Close.
    const buttons = screen.getAllByRole("button").map((b) => b.textContent?.toLowerCase() ?? "");
    expect(buttons).toEqual(expect.arrayContaining([expect.stringMatching(/get mock quote/)]));
    expect(buttons.some((t) => /execute|sign/.test(t))).toBe(false);
  });

  it("surfaces a graceful message when the quote source throws (mainnet)", async () => {
    getSwapQuote.mockRejectedValue(new Error("lands in a later wave"));
    render(<SwapBridgeModal mode="bridge" onClose={() => {}} />);
    fireEvent.change(screen.getByTestId("swap-amount"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /get mock quote/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/later wave/i));
    // Still no execution path was offered.
    expect(screen.queryByRole("button", { name: /execute|sign/i })).not.toBeInTheDocument();
  });
});
