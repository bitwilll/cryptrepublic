// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * ExternalWalletPanel (Wave 11 B2). wagmi + services are mocked. Asserts the
 * honest states: connect buttons / no-connector note / connection-cancelled,
 * the checksummed connected address + balances, the WRONG-CHAIN guard blocking
 * send, the happy send path (sendEvmExternal → hash → receipt), and a wallet
 * rejection surfacing as an error (never a false success).
 */

const ADDR = "0x00000000000000000000000000000000000000a1";
const ADDR_SUM = "0x00000000000000000000000000000000000000A1";
const TO = "0x1111111111111111111111111111111111111111";
const HASH = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

const h = vi.hoisted(() => ({
  connected: false,
  address: undefined as string | undefined,
  chainId: 84532,
  connectors: [{ uid: "u1", id: "injected", name: "Browser wallet" }] as unknown[],
  connectAsync: null as unknown as ReturnType<typeof vi.fn>,
  switchChain: null as unknown as ReturnType<typeof vi.fn>,
  walletClient: { account: { address: "0xA1" } } as unknown,
  sendExternal: null as unknown as ReturnType<typeof vi.fn>,
  receiptStatus: "success" as string,
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({
    address: h.address,
    isConnected: h.connected,
    connector: h.connected ? { name: "Browser wallet" } : undefined,
  }),
  useConnect: () => ({ connectors: h.connectors, connectAsync: h.connectAsync }),
  useDisconnect: () => ({ disconnect: vi.fn() }),
  useChainId: () => h.chainId,
  useSwitchChain: () => ({ switchChain: h.switchChain, isPending: false }),
  useWalletClient: () => ({ data: h.walletClient }),
}));

vi.mock("@/lib/config/chain", () => ({
  activeChain: () => ({ primaryChainId: 84532 }),
}));

vi.mock("@/config/chains.config", () => ({
  evmEntry: () => ({
    viemChain: { name: "Base Sepolia", nativeCurrency: { symbol: "ETH", decimals: 18 } },
  }),
}));

vi.mock("@/lib/wallet/services/portfolio", () => ({
  loadPortfolio: async () => ({
    totalUsd: 1,
    assets: [
      {
        symbol: "ETH",
        name: "Ether",
        decimals: 18,
        balanceDisplay: "1.0",
        balance: 10n ** 18n,
        usdValue: 3240,
        address: undefined,
      },
    ],
  }),
}));

vi.mock("@/lib/wallet/services/send", () => ({
  previewEvmSend: vi.fn(async (req: { chainId: number }) => ({
    to: TO,
    amount: "1",
    token: "native",
    chainId: req.chainId,
    feeEstimate: "21000",
  })),
  sendEvmExternal: vi.fn(async (...args: unknown[]) => h.sendExternal(...args)),
}));

vi.mock("@/lib/wallet/services/sendView", () => ({
  sendableTokens: () => [],
  toSendConfirmVM: () => ({
    to: TO,
    amountDisplay: "1",
    tokenSymbol: "ETH",
    chainName: "Base Sepolia",
    feeDisplay: "0.00002",
    feeSymbol: "ETH",
  }),
}));

vi.mock("@/lib/wallet/services/evmClients", () => ({
  publicClientFor: () => ({
    waitForTransactionReceipt: async () => ({ status: h.receiptStatus }),
  }),
}));

import { ExternalWalletPanel } from "./ExternalWalletPanel";

beforeEach(() => {
  h.connected = false;
  h.address = undefined;
  h.chainId = 84532;
  h.connectors = [{ uid: "u1", id: "injected", name: "Browser wallet" }];
  h.connectAsync = vi.fn(async () => {});
  h.switchChain = vi.fn();
  h.sendExternal = vi.fn(async () => HASH);
  h.receiptStatus = "success";
});

function connect() {
  h.connected = true;
  h.address = ADDR;
}

async function fillAndReview() {
  fireEvent.change(screen.getByTestId("ext-recipient"), { target: { value: TO } });
  fireEvent.change(screen.getByTestId("ext-amount"), { target: { value: "1" } });
  fireEvent.click(screen.getByTestId("ext-review"));
  await waitFor(() => expect(screen.getByTestId("ext-send-confirm")).toBeInTheDocument());
}

describe("ExternalWalletPanel", () => {
  it("disconnected → a connect button per connector", () => {
    render(<ExternalWalletPanel />);
    expect(screen.getByTestId("connect-injected")).toHaveTextContent(/Browser wallet/);
    expect(screen.queryByTestId("external-address")).not.toBeInTheDocument();
  });

  it("no connectors → the honest empty note (never a crash)", () => {
    h.connectors = [];
    render(<ExternalWalletPanel />);
    expect(screen.getByTestId("no-connectors")).toHaveTextContent(/no wallet connector/i);
  });

  it("a rejected connect shows a retryable inline error", async () => {
    h.connectAsync = vi.fn(async () => {
      throw new Error("User rejected");
    });
    render(<ExternalWalletPanel />);
    fireEvent.click(screen.getByTestId("connect-injected"));
    await waitFor(() =>
      expect(screen.getByTestId("connect-error")).toHaveTextContent(/cancelled/i),
    );
    // The connect button is still there — retryable.
    expect(screen.getByTestId("connect-injected")).toBeInTheDocument();
  });

  it("connected on the right chain → checksummed address + balances, no wrong-chain banner", async () => {
    connect();
    render(<ExternalWalletPanel />);
    expect(screen.getByTestId("external-address")).toHaveTextContent(ADDR_SUM);
    expect(screen.queryByTestId("wrong-chain")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("token-row-ETH")).toBeInTheDocument());
  });

  it("WRONG chain → switch prompt + send blocked", () => {
    connect();
    h.chainId = 1;
    render(<ExternalWalletPanel />);
    expect(screen.getByTestId("wrong-chain")).toHaveTextContent(/wrong network/i);
    expect(screen.getByTestId("ext-review")).toBeDisabled();
    fireEvent.click(screen.getByTestId("switch-chain"));
    expect(h.switchChain).toHaveBeenCalledWith({ chainId: 84532 });
  });

  it("send happy path → sendEvmExternal → hash + confirmed receipt", async () => {
    connect();
    render(<ExternalWalletPanel />);
    await fillAndReview();
    fireEvent.click(screen.getByTestId("ext-confirm-sign"));
    await waitFor(() => expect(screen.getByTestId("ext-send-tx")).toHaveTextContent(HASH));
    await waitFor(() =>
      expect(screen.getByTestId("ext-send-status")).toHaveTextContent(/confirmed/i),
    );
    expect(h.sendExternal).toHaveBeenCalledTimes(1);
  });

  it("a wallet rejection surfaces as an error — no false success", async () => {
    connect();
    h.sendExternal = vi.fn(async () => {
      throw new Error("User rejected the request.");
    });
    render(<ExternalWalletPanel />);
    await fillAndReview();
    fireEvent.click(screen.getByTestId("ext-confirm-sign"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/rejected/i));
    expect(screen.queryByTestId("ext-send-tx")).not.toBeInTheDocument();
  });
});
