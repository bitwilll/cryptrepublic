// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { encodeFunctionData, erc20Abi } from "viem";

/**
 * OfflineSignModal (Wave 11 C5). THE ERC-20 HONESTY TEST lives here: an
 * ERC-20 envelope's raw tx.to is the TOKEN CONTRACT and tx.value is 0 — the
 * modal MUST display the calldata-decoded recipient + amount (plus the token
 * contract for verification), never the raw fields. Also: sign → signed QR;
 * NO broadcast affordance anywhere; garbage input refused.
 */

const TO = "0x1111111111111111111111111111111111111111";
const TOKEN = "0x2222222222222222222222222222222222222222";

const h = vi.hoisted(() => ({
  signCalls: [] as unknown[],
  signThrows: null as string | null,
}));

vi.mock("@/lib/wallet/airgapped/sign", () => ({
  signUnsignedEnvelope: vi.fn(async (env: unknown) => {
    h.signCalls.push(env);
    if (h.signThrows) throw new Error(h.signThrows);
    return { v: 1, t: "cr-eth-tx-signed", raw: `0x02${"ab".repeat(50)}` };
  }),
}));

vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn(async () => "data:image/png;base64,stub") },
}));

vi.mock("@/lib/wallet/services/sendView", () => ({
  sendableTokens: () => [{ symbol: "CRYPT", decimals: 18, address: TOKEN }],
}));

vi.mock("@/config/chains.config", () => ({
  evmEntry: () => ({
    viemChain: { name: "Base Sepolia", nativeCurrency: { symbol: "ETH", decimals: 18 } },
  }),
}));

import { OfflineSignModal } from "./OfflineSignModal";

function unsignedEnvelopeText(tx: Record<string, unknown>): string {
  return JSON.stringify({
    v: 1,
    t: "cr-eth-tx-unsigned",
    chainId: 84532,
    tx: {
      nonce: 3,
      gas: "21000",
      maxFeePerGas: "1000000000",
      maxPriorityFeePerGas: "1000000",
      ...tx,
    },
  });
}

const NATIVE_TEXT = unsignedEnvelopeText({ to: TO, value: (10n ** 18n).toString() });
const ERC20_TEXT = unsignedEnvelopeText({
  to: TOKEN, // the RAW to is the token contract…
  value: "0", // …and the raw value is 0
  data: encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [TO, 5n * 10n ** 18n],
  }),
});

beforeEach(() => {
  h.signCalls = [];
  h.signThrows = null;
});

async function pasteEnvelope(text: string) {
  fireEvent.click(screen.getByTestId("paste-instead"));
  fireEvent.change(screen.getByTestId("qr-paste-input"), { target: { value: text } });
  fireEvent.click(screen.getByTestId("qr-paste-submit"));
}

describe("OfflineSignModal", () => {
  it("a NATIVE envelope reviews with recipient = tx.to and the real amount", async () => {
    render(<OfflineSignModal onClose={() => {}} />);
    await pasteEnvelope(NATIVE_TEXT);
    await waitFor(() => expect(screen.getByTestId("offline-review")).toBeInTheDocument());
    expect(screen.getByTestId("offline-recipient")).toHaveTextContent(TO);
    expect(screen.getByTestId("offline-amount")).toHaveTextContent(/1 ETH/);
    expect(screen.queryByTestId("offline-token-contract")).not.toBeInTheDocument();
  });

  it("ERC-20 HONESTY: shows the DECODED recipient + amount + symbol — never the token contract as recipient or 0", async () => {
    render(<OfflineSignModal onClose={() => {}} />);
    await pasteEnvelope(ERC20_TEXT);
    await waitFor(() => expect(screen.getByTestId("offline-review")).toBeInTheDocument());
    // The recipient is the transfer arg — NOT the raw tx.to (token contract).
    expect(screen.getByTestId("offline-recipient")).toHaveTextContent(TO);
    expect(screen.getByTestId("offline-recipient")).not.toHaveTextContent(TOKEN);
    // The amount is the transfer amount — NOT the raw 0 value.
    expect(screen.getByTestId("offline-amount")).toHaveTextContent(/5 CRYPT/);
    // The token contract is surfaced separately for verification.
    expect(screen.getByTestId("offline-token-contract")).toHaveTextContent(TOKEN);
  });

  it("confirm → signUnsignedEnvelope → the signed QR + copyable text render", async () => {
    render(<OfflineSignModal onClose={() => {}} />);
    await pasteEnvelope(NATIVE_TEXT);
    await waitFor(() => expect(screen.getByTestId("offline-sign-confirm")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("offline-sign-confirm"));
    await waitFor(() => expect(screen.getByTestId("offline-signed")).toBeInTheDocument());
    expect(h.signCalls).toHaveLength(1);
    expect(screen.getByTestId("offline-signed-qr")).toHaveAttribute(
      "src",
      expect.stringMatching(/^data:image/),
    );
    expect((screen.getByTestId("offline-signed-text") as HTMLTextAreaElement).value).toContain(
      "cr-eth-tx-signed",
    );
  });

  it("has NO broadcast affordance anywhere (the offline device never touches the network)", async () => {
    render(<OfflineSignModal onClose={() => {}} />);
    await pasteEnvelope(NATIVE_TEXT);
    await waitFor(() => expect(screen.getByTestId("offline-review")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("offline-sign-confirm"));
    await waitFor(() => expect(screen.getByTestId("offline-signed")).toBeInTheDocument());
    expect(
      screen.queryByRole("button", { name: /broadcast|send|submit/i }),
    ).not.toBeInTheDocument();
  });

  it("garbage input is refused with a clear error (stays scanning)", async () => {
    render(<OfflineSignModal onClose={() => {}} />);
    await pasteEnvelope("total garbage");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/invalid/i));
    expect(screen.queryByTestId("offline-review")).not.toBeInTheDocument();
  });

  it("a LOCKED wallet surfaces the unlock-gated error from the signer", async () => {
    h.signThrows = "Wallet is locked. Re-unlock to sign.";
    render(<OfflineSignModal onClose={() => {}} />);
    await pasteEnvelope(NATIVE_TEXT);
    await waitFor(() => expect(screen.getByTestId("offline-sign-confirm")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("offline-sign-confirm"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/locked/i));
    expect(screen.queryByTestId("offline-signed")).not.toBeInTheDocument();
  });
});
