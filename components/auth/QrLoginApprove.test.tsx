// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/wallet/embedded/session", () => ({
  getAccounts: () => ({
    evm: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    solana: "",
    bitcoin: "",
  }),
  withEvmSigner: async (
    fn: (a: { signMessage: (o: { message: string }) => Promise<string> }) => Promise<string>,
  ) => fn({ signMessage: async () => "0xdeadbeef" }),
}));
vi.mock("@/lib/config/chain", () => ({ activeChain: () => ({ primaryChainId: 84532 }) }));

import { encodeQrLogin, type QrLoginEnvelope } from "@/lib/auth/qrLogin/codec";
import { QrLoginApprove } from "./QrLoginApprove";

const env: QrLoginEnvelope = {
  v: 1,
  t: "cr-wallet-login",
  challengeId: "c1",
  nonce: "abc123def456ghi789", // ≥8 alphanumeric — siwe rejects shorter nonces
  matchCode: "ABC234",
  domain: "cryptrepublic.com",
  uri: "https://cryptrepublic.com",
  chainId: 84532,
};

function fetchCalls(): unknown[][] {
  return (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
}
function approveCall(): unknown[] | undefined {
  return fetchCalls().find((c) => String(c[0]).includes("/api/auth/qr/approve"));
}

const originalFetch = globalThis.fetch;
let approveOk = true;
let approveBody: unknown = { ok: true };

beforeEach(() => {
  approveOk = true;
  approveBody = { ok: true };
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("/api/auth/qr/approve")) {
      return { ok: approveOk, json: async () => approveBody } as unknown as Response;
    }
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function paste(text: string) {
  fireEvent.click(screen.getByTestId("paste-instead"));
  fireEvent.change(screen.getByTestId("qr-paste-input"), { target: { value: text } });
  fireEvent.click(screen.getByTestId("qr-paste-submit"));
}

describe("QrLoginApprove (device B)", () => {
  it("decodes a pasted code → shows matchCode + domain; confirm signs + approves", async () => {
    render(<QrLoginApprove requireUnlock={() => true} />);
    paste(encodeQrLogin(env));
    await waitFor(() =>
      expect(screen.getByTestId("qr-approve-matchcode")).toHaveTextContent("ABC234"),
    );
    expect(screen.getByTestId("qr-approve-domain")).toHaveTextContent("cryptrepublic.com");

    fireEvent.click(screen.getByTestId("qr-approve-confirm"));
    await waitFor(() => expect(screen.getByTestId("qr-approve-done")).toBeInTheDocument());

    const call = approveCall();
    expect(call).toBeDefined();
    const body = JSON.parse((call![1] as { body: string }).body) as {
      challengeId: string;
      message: string;
      signature: string;
    };
    expect(body.challengeId).toBe("c1");
    expect(body.signature).toBe("0xdeadbeef");
    expect(body.message).toContain("cryptrepublic.com"); // SIWE bound to the envelope domain
  });

  it("garbage input → an error alert (never a confirm card)", async () => {
    render(<QrLoginApprove requireUnlock={() => true} />);
    paste("not a login code");
    await waitFor(() => expect(screen.getByTestId("qr-approve-error")).toBeInTheDocument());
    expect(screen.queryByTestId("qr-approve-matchcode")).not.toBeInTheDocument();
    expect(approveCall()).toBeUndefined();
  });

  it("a server rejection surfaces the error message", async () => {
    approveOk = false;
    approveBody = { error: "This login request is no longer valid." };
    render(<QrLoginApprove requireUnlock={() => true} />);
    paste(encodeQrLogin(env));
    await waitFor(() => expect(screen.getByTestId("qr-approve-confirm")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("qr-approve-confirm"));
    await waitFor(() =>
      expect(screen.getByTestId("qr-approve-error")).toHaveTextContent(/no longer valid/i),
    );
  });

  it("does not approve while the wallet stays locked (requireUnlock false)", async () => {
    render(<QrLoginApprove requireUnlock={() => false} />);
    paste(encodeQrLogin(env));
    await waitFor(() => expect(screen.getByTestId("qr-approve-confirm")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("qr-approve-confirm"));
    await new Promise((r) => setTimeout(r, 0));
    expect(approveCall()).toBeUndefined();
  });
});
