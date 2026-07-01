// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * SendModal tests. `previewEvmSend`/`sendEvm` and `sendableTokens`/`toSendConfirmVM`
 * are mocked so the two-phase flow + checksum gating + the $CRYPT picker entry are
 * exercised without a live chain.
 */

const h = vi.hoisted(() => ({
  cryptRegistered: true,
  sendEvmCalls: [] as unknown[],
}));

const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const CRYPT = "0x3333333333333333333333333333333333333333";
const VALID_TO = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const FROM = "0x00000000000000000000000000000000000000A1";

vi.mock("@/config/chains.config", () => ({
  evmEntry: () => ({
    viemChain: {
      name: "Base Sepolia",
      nativeCurrency: { symbol: "ETH", decimals: 18, name: "Ether" },
    },
  }),
}));

vi.mock("@/lib/wallet/services/sendView", () => ({
  sendableTokens: () => {
    const base = [{ symbol: "USDC", decimals: 6, address: USDC }];
    return h.cryptRegistered ? [...base, { symbol: "CRYPT", decimals: 18, address: CRYPT }] : base;
  },
  toSendConfirmVM: (preview: {
    to: string;
    amount: string;
    token: string;
    feeEstimate: string;
  }) => {
    const symbol =
      preview.token === "native"
        ? "ETH"
        : preview.token.toLowerCase() === CRYPT.toLowerCase()
          ? "CRYPT"
          : "USDC";
    return {
      to: VALID_TO,
      chainName: "Base Sepolia",
      chainId: 84532,
      tokenSymbol: symbol,
      amountDisplay: "1",
      feeDisplay: "0.0001",
      feeSymbol: "ETH",
    };
  },
}));

vi.mock("@/lib/wallet/services/send", () => ({
  previewEvmSend: async (req: { token?: string }) => ({
    to: VALID_TO,
    amount: "1000000000000000000",
    token: req.token ?? "native",
    chainId: 84532,
    feeEstimate: "100000000000000",
  }),
  sendEvm: async (req: unknown) => {
    h.sendEvmCalls.push(req);
    return "0xhash";
  },
}));

import { SendModal } from "./SendModal";

beforeEach(() => {
  h.cryptRegistered = true;
  h.sendEvmCalls = [];
});

describe("SendModal", () => {
  it("disables Review until the recipient is a valid address", () => {
    render(<SendModal chainId={84532} from={FROM} requireUnlock={() => true} onClose={() => {}} />);
    const review = screen.getByTestId("review-send");
    expect(review).toBeDisabled();
    fireEvent.change(screen.getByTestId("recipient-input"), { target: { value: "0xbad" } });
    expect(review).toBeDisabled();
    fireEvent.change(screen.getByTestId("recipient-input"), { target: { value: VALID_TO } });
    expect(review).toBeEnabled();
  });

  it("shows a human-readable confirm (not raw wei) then sends once on Confirm & sign", async () => {
    render(<SendModal chainId={84532} from={FROM} requireUnlock={() => true} onClose={() => {}} />);
    fireEvent.change(screen.getByTestId("recipient-input"), { target: { value: VALID_TO } });
    fireEvent.change(screen.getByTestId("amount-input"), { target: { value: "1" } });
    fireEvent.click(screen.getByTestId("review-send"));

    await waitFor(() => expect(screen.getByTestId("send-confirm")).toBeInTheDocument());
    expect(screen.getByTestId("confirm-amount")).toHaveTextContent("1 ETH");
    expect(screen.getByTestId("confirm-chain")).toHaveTextContent("Base Sepolia");
    expect(screen.getByTestId("confirm-fee")).toHaveTextContent("0.0001 ETH");
    // NOT raw wei
    expect(screen.getByTestId("confirm-amount")).not.toHaveTextContent("1000000000000000000");

    fireEvent.click(screen.getByTestId("confirm-sign"));
    await waitFor(() => expect(h.sendEvmCalls).toHaveLength(1));
  });

  it("includes $CRYPT in the picker when registered; its confirm shows CRYPT", async () => {
    h.cryptRegistered = true;
    render(<SendModal chainId={84532} from={FROM} requireUnlock={() => true} onClose={() => {}} />);
    const picker = screen.getByTestId("token-picker") as HTMLSelectElement;
    const options = Array.from(picker.options).map((o) => o.textContent);
    expect(options.join(" ")).toMatch(/CRYPT/);

    fireEvent.change(picker, { target: { value: CRYPT } });
    fireEvent.change(screen.getByTestId("recipient-input"), { target: { value: VALID_TO } });
    fireEvent.change(screen.getByTestId("amount-input"), { target: { value: "1" } });
    fireEvent.click(screen.getByTestId("review-send"));
    await waitFor(() => expect(screen.getByTestId("confirm-amount")).toHaveTextContent("1 CRYPT"));
  });

  it("omits $CRYPT (no throw) when not registered", () => {
    h.cryptRegistered = false;
    render(<SendModal chainId={84532} from={FROM} requireUnlock={() => true} onClose={() => {}} />);
    const picker = screen.getByTestId("token-picker") as HTMLSelectElement;
    const options = Array.from(picker.options).map((o) => o.textContent);
    expect(options.join(" ")).not.toMatch(/CRYPT/);
  });

  it("does NOT send when locked (requireUnlock returns false)", async () => {
    render(
      <SendModal chainId={84532} from={FROM} requireUnlock={() => false} onClose={() => {}} />,
    );
    fireEvent.change(screen.getByTestId("recipient-input"), { target: { value: VALID_TO } });
    fireEvent.change(screen.getByTestId("amount-input"), { target: { value: "1" } });
    fireEvent.click(screen.getByTestId("review-send"));
    await waitFor(() => expect(screen.getByTestId("send-confirm")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("confirm-sign"));
    // gated — no send
    await new Promise((r) => setTimeout(r, 20));
    expect(h.sendEvmCalls).toHaveLength(0);
  });
});
