// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
// Stub the QR image encoder — the codec itself is covered by its own test; here
// we only assert the panel renders an image + matchCode and drives the poll.
vi.mock("@/lib/auth/qrLogin/codec", () => ({
  encodeQrLoginToDataUrl: async () => "data:image/png;base64,FAKEQR",
}));

import { QrLoginPanel } from "./QrLoginPanel";

const START_BODY = {
  challengeId: "c1",
  nonce: "nnn",
  matchCode: "ABC234",
  domain: "localhost:3000",
  uri: "http://localhost:3000",
  chainId: 84532,
};

function jsonRes(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

function fetchCalls(): unknown[][] {
  return (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
}
const startCalls = () =>
  fetchCalls().filter((c) => String(c[0]).includes("/api/auth/qr/start")).length;

const originalFetch = globalThis.fetch;
let statusBody: { status: string; next?: string };

beforeEach(() => {
  push.mockReset();
  statusBody = { status: "pending" };
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/auth/qr/start")) return jsonRes(START_BODY);
    if (url.includes("/api/auth/qr/status")) return jsonRes(statusBody);
    return jsonRes({});
  }) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("QrLoginPanel (device A)", () => {
  it("renders the QR image + matchCode after start", async () => {
    render(<QrLoginPanel />);
    await waitFor(() => expect(screen.getByTestId("qr-login-image")).toBeInTheDocument());
    expect(screen.getByTestId("qr-login-image")).toHaveAttribute(
      "src",
      "data:image/png;base64,FAKEQR",
    );
    expect(screen.getByTestId("qr-login-matchcode")).toHaveTextContent("ABC234");
  });

  it("redirects when the poll returns approved", async () => {
    statusBody = { status: "approved", next: "/dashboard" };
    render(<QrLoginPanel />);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
  });

  it("shows a refresh affordance when the code expires, and refresh re-starts", async () => {
    statusBody = { status: "expired" };
    render(<QrLoginPanel />);
    await waitFor(() => expect(screen.getByTestId("qr-login-expired")).toBeInTheDocument());
    const before = startCalls();
    fireEvent.click(screen.getByTestId("qr-login-refresh"));
    await waitFor(() => expect(startCalls()).toBeGreaterThan(before));
  });
});
