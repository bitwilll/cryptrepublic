// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

const startRegistrationMock = vi.fn();
vi.mock("@simplewebauthn/browser", () => ({
  startRegistration: (...args: unknown[]) => startRegistrationMock(...args),
}));

import { PasskeysSurface } from "./PasskeysSurface";

interface State {
  credentials: {
    id: string;
    label: string | null;
    deviceType: string;
    backedUp: boolean;
    createdAt: string;
    lastUsedAt: string | null;
  }[];
  passkey2faEnabled: boolean;
}

function jsonRes(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}
function fetchCalls(): unknown[][] {
  return (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
}
function lastBody(match: string): Record<string, unknown> | null {
  const call = [...fetchCalls()].reverse().find((c) => String(c[0]).includes(match));
  if (!call) return null;
  return JSON.parse((call[1] as { body: string }).body);
}

const originalFetch = globalThis.fetch;
let state: State;

beforeEach(() => {
  startRegistrationMock.mockReset();
  startRegistrationMock.mockResolvedValue({ id: "new-cred", response: {} });
  state = { credentials: [], passkey2faEnabled: false };
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/webauthn/credentials/delete")) {
      const { credentialId } = JSON.parse(String(init?.body ?? "{}"));
      state.credentials = state.credentials.filter((c) => c.id !== credentialId);
      if (state.credentials.length === 0) state.passkey2faEnabled = false;
      return jsonRes({
        ok: true,
        remaining: state.credentials.length,
        passkey2faEnabled: state.passkey2faEnabled,
      });
    }
    if (url.includes("/webauthn/credentials")) return jsonRes(state);
    if (url.includes("/webauthn/register/options")) return jsonRes({ options: { challenge: "c" } });
    if (url.includes("/webauthn/register/verify")) {
      state.credentials.push({
        id: "new-cred",
        label: "MacBook",
        deviceType: "multiDevice",
        backedUp: true,
        createdAt: "2026-07-06T00:00:00.000Z",
        lastUsedAt: null,
      });
      return jsonRes({ ok: true });
    }
    if (url.includes("/webauthn/2fa")) {
      const { enabled } = JSON.parse(String(init?.body ?? "{}"));
      state.passkey2faEnabled = enabled;
      return jsonRes({ ok: true, passkey2faEnabled: enabled });
    }
    return jsonRes({});
  }) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("PasskeysSurface", () => {
  it("shows the empty state, then enrolling adds a passkey to the list", async () => {
    render(<PasskeysSurface />);
    await waitFor(() => expect(screen.getByTestId("passkey-empty")).toBeInTheDocument());

    fireEvent.change(screen.getByTestId("passkey-label"), { target: { value: "MacBook" } });
    fireEvent.click(screen.getByTestId("passkey-enroll"));

    await waitFor(() => expect(screen.getByTestId("passkey-row")).toBeInTheDocument());
    expect(screen.getByTestId("passkey-list")).toHaveTextContent("MacBook");
    // register/verify carried the label.
    expect(lastBody("/register/verify")).toMatchObject({ label: "MacBook" });
  });

  it("the require-passkey toggle is disabled with no passkeys and enables once one exists", async () => {
    render(<PasskeysSurface />);
    await waitFor(() => expect(screen.getByTestId("passkey-2fa-toggle")).toBeInTheDocument());
    expect(screen.getByTestId("passkey-2fa-toggle")).toBeDisabled(); // no passkeys yet

    fireEvent.click(screen.getByTestId("passkey-enroll"));
    await waitFor(() => expect(screen.getByTestId("passkey-2fa-toggle")).not.toBeDisabled());

    fireEvent.click(screen.getByTestId("passkey-2fa-toggle"));
    await waitFor(() => expect(screen.getByTestId("passkey-2fa-toggle")).toBeChecked());
    expect(lastBody("/webauthn/2fa")).toEqual({ enabled: true });
  });

  it("deleting the last passkey removes the row (and the server auto-disables the flag)", async () => {
    state = {
      credentials: [
        {
          id: "k1",
          label: "Key 1",
          deviceType: "singleDevice",
          backedUp: false,
          createdAt: "2026-07-06T00:00:00.000Z",
          lastUsedAt: null,
        },
      ],
      passkey2faEnabled: true,
    };
    render(<PasskeysSurface />);
    await waitFor(() => expect(screen.getByTestId("passkey-row")).toBeInTheDocument());
    expect(screen.getByTestId("passkey-2fa-toggle")).toBeChecked();

    fireEvent.click(within(screen.getByTestId("passkey-row")).getByTestId("passkey-delete"));
    await waitFor(() => expect(screen.getByTestId("passkey-empty")).toBeInTheDocument());
    expect(screen.getByTestId("passkey-2fa-toggle")).not.toBeChecked();
  });
});
