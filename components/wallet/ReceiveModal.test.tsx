// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { getAddress } from "viem";

/**
 * ReceiveModal tests. `receiveQrDataUrl` is mocked to a data URL. Asserts the
 * checksummed address renders, the QR <img> is a data: URL, and COPY writes the
 * checksummed address to the clipboard. No send affordance.
 */

vi.mock("@/lib/wallet/receive", () => ({
  receiveQrDataUrl: async () => "data:image/png;base64,QQ==",
}));

import { ReceiveModal } from "./ReceiveModal";

const LOWER = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
const CHECKSUMMED = getAddress(LOWER);

beforeEach(() => {
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe("ReceiveModal", () => {
  it("renders the checksummed address and a QR data: image", async () => {
    render(<ReceiveModal address={LOWER} onClose={() => {}} />);
    expect(screen.getByTestId("receive-address")).toHaveTextContent(CHECKSUMMED);
    await waitFor(() => {
      const img = screen.getByTestId("receive-qr") as HTMLImageElement;
      expect(img.src.startsWith("data:")).toBe(true);
    });
  });

  it("COPY writes the CHECKSUMMED address to the clipboard", async () => {
    render(<ReceiveModal address={LOWER} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(CHECKSUMMED));
  });

  it("has NO send/transfer affordance", () => {
    render(<ReceiveModal address={LOWER} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: /send|transfer/i })).not.toBeInTheDocument();
  });
});
