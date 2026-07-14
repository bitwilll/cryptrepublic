// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@simplewebauthn/browser", () => ({ startAuthentication: vi.fn() }));
vi.mock("@/components/auth/QrLoginPanel", () => ({
  QrLoginPanel: () => <div data-testid="qr-panel-stub" />,
}));

import { AuthForm } from "./AuthForm";

/**
 * Registration-policy states of the auth form (Cabinet flags). The server is
 * the enforcement authority — these tests only pin the MIRROR: CLOSED swaps
 * the register pane for the suspension notice; REFERRAL_ONLY renders a
 * REQUIRED code field that gates client-side validation and rides the POST.
 */

function jsonRes(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

const originalFetch = globalThis.fetch;
let flags: Record<string, boolean>;
let registerBodies: unknown[];

beforeEach(() => {
  push.mockReset();
  flags = {};
  registerBodies = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/flags")) return jsonRes({ flags });
    if (url.includes("/api/auth/register")) {
      registerBodies.push(JSON.parse(String(init?.body ?? "{}")));
      return jsonRes({ ok: true, next: "/dashboard/mint" });
    }
    return jsonRes({});
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function openRegister(): void {
  fireEvent.click(screen.getByRole("tab", { name: /register/i }));
}

describe("AuthForm registration policy", () => {
  it("OPEN (default): register pane renders normally, no code field", async () => {
    render(<AuthForm />);
    openRegister();
    expect(await screen.findByLabelText(/full or chosen name/i)).toBeTruthy();
    expect(screen.queryByTestId("register-ref-code")).toBeNull();
    expect(screen.queryByTestId("registrations-closed")).toBeNull();
  });

  it("CLOSED: the register pane is replaced by the suspension notice; sign-in stays", async () => {
    flags = { registration_open: false };
    render(<AuthForm />);
    openRegister();
    expect(await screen.findByTestId("registrations-closed")).toBeTruthy();
    expect(screen.getByText(/closed/i)).toBeTruthy();
    expect(screen.queryByLabelText(/full or chosen name/i)).toBeNull();
    // sign-in tab unaffected
    fireEvent.click(screen.getByRole("tab", { name: /sign in/i }));
    expect(screen.getByLabelText(/e-mail of record/i)).toBeTruthy();
  });

  it("REFERRAL_ONLY: the code field is required — empty blocks submit, filled rides the POST", async () => {
    flags = { registration_open: true, registration_referral_only: true };
    render(<AuthForm />);
    openRegister();
    const codeInput = await screen.findByTestId("register-ref-code");

    fireEvent.change(screen.getByLabelText(/full or chosen name/i), {
      target: { value: "Test Citizen" },
    });
    fireEvent.change(screen.getByLabelText(/e-mail of record/i), {
      target: { value: "t@example.org" },
    });
    fireEvent.change(screen.getByLabelText(/choose a passphrase/i), {
      target: { value: "a very long passphrase" },
    });

    // empty code → client validation blocks; no register call leaves the form
    fireEvent.click(screen.getByRole("button", { name: /create record/i }));
    await waitFor(() => expect(registerBodies).toHaveLength(0));

    fireEvent.change(codeInput, { target: { value: "code123abc" } });
    fireEvent.click(screen.getByRole("button", { name: /create record/i }));
    await waitFor(() => expect(registerBodies).toHaveLength(1));
    expect(registerBodies[0]).toMatchObject({ refCode: "code123abc" });
  });
});
