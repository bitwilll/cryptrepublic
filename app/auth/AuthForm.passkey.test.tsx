// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const startAuthenticationMock = vi.fn();
vi.mock("@simplewebauthn/browser", () => ({
  startAuthentication: (...args: unknown[]) => startAuthenticationMock(...args),
}));
// The QR panel fetches on mount if shown — keep it inert here.
vi.mock("@/components/auth/QrLoginPanel", () => ({
  QrLoginPanel: () => <div data-testid="qr-panel-stub" />,
}));

import { AuthForm } from "./AuthForm";

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
function jsonRes(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}
function fetchCalls(): unknown[][] {
  return (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
}

const originalFetch = globalThis.fetch;
let loginBody: unknown;
let loginOk: boolean;

beforeEach(() => {
  push.mockReset();
  startAuthenticationMock.mockReset();
  startAuthenticationMock.mockResolvedValue({ id: "assert-1", response: {} });
  loginBody = { ok: true, next: "/dashboard" };
  loginOk = true;
  const impl: FetchImpl = async (input) => {
    const url = String(input);
    if (url.includes("/api/auth/login")) return jsonRes(loginBody, loginOk, loginOk ? 200 : 401);
    if (url.includes("/api/auth/webauthn/login/options"))
      return jsonRes({ options: { challenge: "c", rpId: "localhost" } });
    if (url.includes("/api/auth/webauthn/login/verify"))
      return jsonRes({ ok: true, next: "/dashboard" });
    return jsonRes({});
  };
  globalThis.fetch = vi.fn(impl) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("AuthForm — passkey sign-in", () => {
  it("the 'Sign in with a passkey' entry runs the ceremony and redirects", async () => {
    render(<AuthForm />);
    fireEvent.click(screen.getByTestId("passkey-login-open"));
    await waitFor(() => expect(startAuthenticationMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    // The ceremony hit options then verify.
    const urls = fetchCalls().map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("/webauthn/login/options"))).toBe(true);
    expect(urls.some((u) => u.includes("/webauthn/login/verify"))).toBe(true);
  });

  it("a require-passkey password login shows the step-up button (NO redirect yet), then completes", async () => {
    loginBody = { ok: true, twoFactor: true }; // password ok, session withheld
    render(<AuthForm />);
    fireEvent.change(screen.getByLabelText(/E-MAIL OF RECORD/i), {
      target: { value: "user@example.org" },
    });
    fireEvent.change(screen.getByLabelText(/PASSPHRASE/i), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.click(screen.getByRole("button", { name: /AUTHENTICATE/i }));

    // Step-up prompt appears; NOT signed in yet.
    await waitFor(() => expect(screen.getByTestId("passkey-2fa-complete")).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();

    // Completing the passkey issues the session and redirects.
    fireEvent.click(screen.getByTestId("passkey-2fa-complete"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
  });

  it("a cancelled passkey ceremony does not redirect", async () => {
    startAuthenticationMock.mockRejectedValue(new Error("NotAllowedError"));
    render(<AuthForm />);
    fireEvent.click(screen.getByTestId("passkey-login-open"));
    await waitFor(() => expect(startAuthenticationMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(push).not.toHaveBeenCalled();
    // The verify endpoint was never reached.
    expect(
      fetchCalls()
        .map((c) => String(c[0]))
        .some((u) => u.includes("/verify")),
    ).toBe(false);
  });
});
