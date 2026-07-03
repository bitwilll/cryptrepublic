// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * AirgappedSendModal (Wave 11 C4) — the honest state machine: compose →
 * unsigned QR + human summary; too-large → BC-UR follow-up guard (no QR);
 * a scanned signed payload broadcasts and "sent" appears ONLY on a confirmed
 * receipt; garbage input and reverts surface as errors with retry — never a
 * false "sent".
 */

const TO = "0x1111111111111111111111111111111111111111";
const FROM = "0x00000000000000000000000000000000000000A1" as const;
const HASH = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
const RAW = `0x02${"ab".repeat(50)}`;

const h = vi.hoisted(() => ({
  buildThrows: null as string | null,
  broadcastThrows: null as string | null,
  receiptStatus: "success" as string,
  broadcastCalls: [] as unknown[][],
}));

vi.mock("@/lib/wallet/airgapped/build", () => ({
  buildUnsignedTx: vi.fn(async (req: { chainId: number; to: string; amount: bigint }) => {
    if (h.buildThrows) throw new Error(h.buildThrows);
    return {
      v: 1,
      t: "cr-eth-tx-unsigned",
      chainId: req.chainId,
      tx: {
        to: req.to,
        value: req.amount,
        nonce: 7,
        gas: 21000n,
        maxFeePerGas: 1_000_000_000n,
        maxPriorityFeePerGas: 1_000_000n,
      },
    };
  }),
}));

vi.mock("@/lib/wallet/airgapped/broadcast", () => ({
  broadcastSignedRaw: vi.fn(async (...args: unknown[]) => {
    h.broadcastCalls.push(args);
    if (h.broadcastThrows) throw new Error(h.broadcastThrows);
    return HASH;
  }),
}));

// Real codec (validates signed payloads, renders QR via mocked qrcode).
vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn(async () => "data:image/png;base64,stub") },
}));

vi.mock("@/lib/wallet/services/evmClients", () => ({
  publicClientFor: () => ({
    waitForTransactionReceipt: vi.fn(async () => ({ status: h.receiptStatus })),
  }),
}));

import { AirgappedSendModal } from "./AirgappedSendModal";
import { buildUnsignedTx } from "@/lib/wallet/airgapped/build";

beforeEach(() => {
  h.buildThrows = null;
  h.broadcastThrows = null;
  h.receiptStatus = "success";
  h.broadcastCalls = [];
});

async function composeAndBuild() {
  fireEvent.change(screen.getByTestId("ag-recipient"), { target: { value: TO } });
  fireEvent.change(screen.getByTestId("ag-amount"), { target: { value: "1" } });
  fireEvent.click(screen.getByTestId("ag-build"));
  await waitFor(() => expect(screen.getByTestId("ag-unsigned")).toBeInTheDocument());
}

async function toScanner() {
  await composeAndBuild();
  fireEvent.click(screen.getByTestId("ag-have-signed"));
  await waitFor(() => expect(screen.getByTestId("qr-scanner")).toBeInTheDocument());
  // No camera in jsdom — the tests exercise the paste path.
  fireEvent.click(screen.getByTestId("paste-instead"));
  await waitFor(() => expect(screen.getByTestId("qr-paste-input")).toBeInTheDocument());
}

describe("AirgappedSendModal", () => {
  it("compose → unsigned QR + honest human summary + copyable envelope text", async () => {
    render(<AirgappedSendModal chainId={84532} from={FROM} onClose={() => {}} />);
    await composeAndBuild();
    expect(buildUnsignedTx).toHaveBeenCalled();
    expect(screen.getByTestId("ag-unsigned-qr")).toHaveAttribute(
      "src",
      expect.stringMatching(/^data:image/),
    );
    expect(screen.getByTestId("ag-summary-to")).toHaveTextContent(TO);
    expect(screen.getByTestId("ag-summary-amount")).toHaveTextContent(/1/);
    expect((screen.getByTestId("ag-unsigned-text") as HTMLTextAreaElement).value).toContain(
      "cr-eth-tx-unsigned",
    );
    // The badge is honest about custody.
    expect(screen.getByTestId("watchonly-badge")).toBeInTheDocument();
  });

  it("too-large envelope → the BC-UR follow-up guard, no QR, back is possible", async () => {
    h.buildThrows = "Transaction too large for one QR (3001 bytes > 2953) — multi-part follow-up.";
    render(<AirgappedSendModal chainId={84532} from={FROM} onClose={() => {}} />);
    fireEvent.change(screen.getByTestId("ag-recipient"), { target: { value: TO } });
    fireEvent.change(screen.getByTestId("ag-amount"), { target: { value: "1" } });
    fireEvent.click(screen.getByTestId("ag-build"));
    await waitFor(() => expect(screen.getByTestId("ag-toolarge")).toBeInTheDocument());
    expect(screen.queryByTestId("ag-unsigned-qr")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    await waitFor(() => expect(screen.getByTestId("airgapped-compose")).toBeInTheDocument());
  });

  it("a scanned signed payload broadcasts; 'sent' appears ONLY after a confirmed receipt", async () => {
    render(<AirgappedSendModal chainId={84532} from={FROM} onClose={() => {}} />);
    await toScanner();
    fireEvent.change(screen.getByTestId("qr-paste-input"), { target: { value: RAW } });
    fireEvent.click(screen.getByTestId("qr-paste-submit"));
    await waitFor(() => expect(screen.getByTestId("ag-sent")).toBeInTheDocument());
    expect(screen.getByTestId("ag-sent-hash")).toHaveTextContent(HASH);
    expect(h.broadcastCalls[0]).toEqual([84532, RAW]);
  });

  it("garbage scan → clear error, NO broadcast, NO 'sent'", async () => {
    render(<AirgappedSendModal chainId={84532} from={FROM} onClose={() => {}} />);
    await toScanner();
    fireEvent.change(screen.getByTestId("qr-paste-input"), { target: { value: "junk-not-hex" } });
    fireEvent.click(screen.getByTestId("qr-paste-submit"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/invalid/i));
    expect(h.broadcastCalls).toHaveLength(0);
    expect(screen.queryByTestId("ag-sent")).not.toBeInTheDocument();
  });

  it("a REVERTED receipt is an error with retry — never 'sent'", async () => {
    h.receiptStatus = "reverted";
    render(<AirgappedSendModal chainId={84532} from={FROM} onClose={() => {}} />);
    await toScanner();
    fireEvent.change(screen.getByTestId("qr-paste-input"), { target: { value: RAW } });
    fireEvent.click(screen.getByTestId("qr-paste-submit"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/reverted/i));
    expect(screen.queryByTestId("ag-sent")).not.toBeInTheDocument();
    // Retry surface: the scanner is available again.
    expect(screen.getByTestId("qr-scanner")).toBeInTheDocument();
  });

  it("a broadcast error surfaces honestly and is retryable", async () => {
    h.broadcastThrows = "nonce too low";
    render(<AirgappedSendModal chainId={84532} from={FROM} onClose={() => {}} />);
    await toScanner();
    fireEvent.change(screen.getByTestId("qr-paste-input"), { target: { value: RAW } });
    fireEvent.click(screen.getByTestId("qr-paste-submit"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/nonce too low/i));
    expect(screen.queryByTestId("ag-sent")).not.toBeInTheDocument();
    expect(screen.getByTestId("qr-scanner")).toBeInTheDocument();
  });
});
