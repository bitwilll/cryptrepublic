// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { getAddress, recoverMessageAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { canonicalBitwillPayload } from "@/lib/bitwill/canonical";

/**
 * BitwillApp tests (Wave 15 A). fetch + the embedded-wallet vault are mocked;
 * the SIGNING IS REAL (a viem test account behind the withEvmSigner mock) so
 * the posted signature actually recovers to the canonical payload — proving
 * the client signs the exact string the server verifies.
 */

const TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const ACCOUNT = privateKeyToAccount(TEST_KEY);

const h = vi.hoisted(() => ({
  unlocked: true,
  hasWallet: true,
  directives: [] as Array<Record<string, unknown>>,
  posts: [] as Array<{ url: string; body: Record<string, unknown> }>,
}));

vi.mock("@/lib/wallet/embedded/session", () => ({
  isUnlocked: () => h.unlocked,
  unlock: async () => {},
  getAccounts: () => (h.hasWallet ? { evm: ACCOUNT.address } : null),
  loadPublicAccounts: async () => (h.hasWallet ? { evm: ACCOUNT.address } : null),
  withEvmSigner: async (fn: (a: typeof ACCOUNT) => Promise<string>) => fn(ACCOUNT),
}));

import { BitwillApp } from "./BitwillApp";

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function activeDirective(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "d1",
    beneficiaryName: "Ada Lovelace",
    beneficiaryContact: "ada@example.com",
    beneficiaryAddress: null,
    assetsMemo: "All CRPT holdings to Ada.",
    directiveHash: `0x${"11".repeat(32)}`,
    signerAddress: ACCOUNT.address,
    status: "ACTIVE",
    createdAt: "2026-07-01T00:00:00.000Z",
    revokedAt: null,
    ...over,
  };
}

beforeEach(() => {
  h.unlocked = true;
  h.hasWallet = true;
  h.directives = [];
  h.posts = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "POST") {
      h.posts.push({ url, body: init?.body ? JSON.parse(String(init.body)) : {} });
      return jsonResponse({ ok: true });
    }
    if (url.includes("/api/bitwill")) return jsonResponse({ directives: h.directives });
    return jsonResponse({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("BitwillApp", () => {
  it("renders the empty state and the exact non-custodial statement", async () => {
    render(<BitwillApp />);
    await waitFor(() => expect(screen.getByTestId("bitwill-empty")).toBeInTheDocument());
    expect(
      screen.getByText(
        /A BitWill directive is\s+a signed declaration of intent filed with the Republic's registry\. It does not and\s+cannot transfer assets — your keys remain yours alone\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("bitwill-file")).toHaveTextContent(/sign & file directive/i);
  });

  it("files a directive: posts the fields + a REAL signature that recovers to the canonical payload", async () => {
    render(<BitwillApp />);
    await waitFor(() => expect(screen.getByTestId("bitwill-empty")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/beneficiary full name/i), {
      target: { value: "Ada Lovelace" },
    });
    fireEvent.change(screen.getByLabelText(/beneficiary contact/i), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/estate memorandum/i), {
      target: { value: "All CRPT holdings to Ada." },
    });
    fireEvent.click(screen.getByTestId("bitwill-file"));

    await waitFor(() => expect(h.posts).toHaveLength(1));
    const { url, body } = h.posts[0]!;
    expect(url).toBe("/api/bitwill");
    expect(body.beneficiaryName).toBe("Ada Lovelace");
    expect(body.signerAddress).toBe(ACCOUNT.address);

    const payload = canonicalBitwillPayload({
      owner: ACCOUNT.address,
      beneficiaryName: "Ada Lovelace",
      beneficiaryContact: "ada@example.com",
      assetsMemo: "All CRPT holdings to Ada.",
    });
    const recovered = await recoverMessageAddress({
      message: payload,
      signature: body.signature as `0x${string}`,
    });
    expect(getAddress(recovered)).toBe(ACCOUNT.address);
  });

  it("prompts an unlock (and does NOT post) when the vault is locked", async () => {
    h.unlocked = false;
    render(<BitwillApp />);
    await waitFor(() => expect(screen.getByTestId("bitwill-empty")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/beneficiary full name/i), {
      target: { value: "Ada Lovelace" },
    });
    fireEvent.change(screen.getByLabelText(/beneficiary contact/i), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/estate memorandum/i), {
      target: { value: "All CRPT holdings to Ada." },
    });
    fireEvent.click(screen.getByTestId("bitwill-file"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/unlock/i);
    expect(h.posts).toHaveLength(0);
  });

  it("shows the ACTIVE directive as a deed and the history ledger with superseded rows", async () => {
    h.directives = [
      activeDirective(),
      activeDirective({
        id: "d0",
        beneficiaryName: "Charles Babbage",
        status: "SUPERSEDED",
        directiveHash: `0x${"22".repeat(32)}`,
        createdAt: "2026-06-01T00:00:00.000Z",
      }),
    ];
    render(<BitwillApp />);
    await waitFor(() => expect(screen.getByTestId("bitwill-active-deed")).toBeInTheDocument());
    const deed = screen.getByTestId("bitwill-active-deed");
    expect(deed).toHaveTextContent("Ada Lovelace");
    expect(deed).toHaveTextContent(`0x${"11".repeat(32)}`);
    expect(deed).toHaveTextContent(ACCOUNT.address);
    // the form now supersedes
    expect(screen.getByTestId("bitwill-file")).toHaveTextContent(/supersede/i);
    // history ledger includes the superseded directive
    expect(screen.getByText("Charles Babbage")).toBeInTheDocument();
    expect(screen.getByText("SUPERSEDED")).toBeInTheDocument();
  });

  it("revoke needs the confirm dialog, then posts to /api/bitwill/revoke", async () => {
    h.directives = [activeDirective()];
    render(<BitwillApp />);
    await waitFor(() => expect(screen.getByTestId("bitwill-revoke")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("bitwill-revoke"));
    expect(h.posts).toHaveLength(0); // nothing posted until confirmed
    fireEvent.click(screen.getByTestId("bitwill-revoke-confirm"));

    await waitFor(() => expect(h.posts).toHaveLength(1));
    expect(h.posts[0]!.url).toBe("/api/bitwill/revoke");
    expect(h.posts[0]!.body).toEqual({});
  });

  it("explains the wallet requirement instead of posting when no wallet exists", async () => {
    h.hasWallet = false;
    render(<BitwillApp />);
    await waitFor(() => expect(screen.getByTestId("bitwill-empty")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/beneficiary full name/i), {
      target: { value: "Ada Lovelace" },
    });
    fireEvent.change(screen.getByLabelText(/beneficiary contact/i), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/estate memorandum/i), {
      target: { value: "All CRPT holdings to Ada." },
    });
    fireEvent.click(screen.getByTestId("bitwill-file"));
    await waitFor(() => expect(screen.getByTestId("bitwill-error")).toBeInTheDocument());
    expect(screen.getByTestId("bitwill-error")).toHaveTextContent(/wallet/i);
    expect(h.posts).toHaveLength(0);
  });
});
