// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { canonicalPayload, sha256HexOfText } from "@/lib/certificates/canonical";

/**
 * CertificatesApp (Wave 15 — Identity). The embedded-wallet session module is
 * mocked (unlocked, signs via a fake account — no key material anywhere);
 * fetch is mocked. Asserts: the MESSAGE flow hashes + signs the CANONICAL
 * payload and POSTs it; the issued deed shows the serial + verification URL;
 * a signature-mismatch 400 surfaces with the verify-wallet hint; the list
 * renders with status badges and revoke is two-step (arm → confirm → POST).
 */

const h = vi.hoisted(() => ({
  unlocked: true,
  hasWallet: true,
  signedMessages: [] as string[],
  postOk: true,
  postError: "Signature does not match a linked wallet.",
  posted: [] as unknown[],
  revoked: [] as string[],
  certificates: [] as unknown[],
}));

vi.mock("@/lib/wallet/embedded/session", () => ({
  loadPublicAccounts: async () =>
    h.hasWallet ? { evm: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" } : null,
  isUnlocked: () => h.unlocked,
  unlock: async () => ({ evm: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" }),
  withEvmSigner: async (fn: (account: unknown) => Promise<unknown>) =>
    fn({
      signMessage: async ({ message }: { message: string }) => {
        h.signedMessages.push(message);
        return "0x" + "ab".repeat(65);
      },
    }),
}));

import { CertificatesApp } from "./CertificatesApp";

const originalFetch = globalThis.fetch;

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  h.unlocked = true;
  h.hasWallet = true;
  h.postOk = true;
  h.signedMessages = [];
  h.posted = [];
  h.revoked = [];
  h.certificates = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/certificates") && init?.method === "POST") {
      h.posted.push(JSON.parse(String(init.body)));
      if (!h.postOk) return jsonRes({ error: h.postError }, 400);
      const body = JSON.parse(String(init.body)) as Record<string, string>;
      return jsonRes({
        ok: true,
        certificate: {
          serial: "CR-2026-ABC234",
          kind: body.kind,
          title: body.title,
          subject: body.subject,
          contentHash: body.contentHash,
          signerAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
          signature: body.signature,
          issuedAt: new Date().toISOString(),
          revokedAt: null,
        },
      });
    }
    if (url.includes("/revoke") && init?.method === "POST") {
      h.revoked.push(url);
      return jsonRes({ ok: true });
    }
    if (url.endsWith("/api/certificates")) {
      return jsonRes({ certificates: h.certificates });
    }
    return jsonRes({});
  }) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("CertificatesApp — issuance", () => {
  it("signs the CANONICAL payload for a MESSAGE and shows the deed with serial + verify URL", async () => {
    render(<CertificatesApp />);
    fireEvent.change(await screen.findByTestId("cert-title"), {
      target: { value: "Statement of record" },
    });
    fireEvent.change(screen.getByTestId("cert-message"), {
      target: { value: "I attest this statement." },
    });
    fireEvent.click(screen.getByTestId("cert-issue"));

    await waitFor(() => expect(screen.getByTestId("certificate-deed")).toBeInTheDocument());

    const expectedHash = await sha256HexOfText("I attest this statement.");
    expect(h.signedMessages).toEqual([
      canonicalPayload({
        kind: "MESSAGE",
        title: "Statement of record",
        subject: "I attest this statement.",
        contentHash: expectedHash,
      }),
    ]);
    const posted = h.posted[0] as { contentHash: string; signature: string };
    expect(posted.contentHash).toBe(expectedHash);
    expect(posted.signature).toMatch(/^0x/);

    expect(screen.getByTestId("deed-serial")).toHaveTextContent("CR-2026-ABC234");
    expect(screen.getByTestId("deed-verify-url")).toHaveTextContent(
      "/verify?serial=CR-2026-ABC234",
    );
  });

  it("rejects a short title client-side without signing", async () => {
    render(<CertificatesApp />);
    fireEvent.change(await screen.findByTestId("cert-title"), { target: { value: "ab" } });
    fireEvent.click(screen.getByTestId("cert-issue"));
    expect(await screen.findByTestId("cert-error")).toHaveTextContent(/3 to 120/i);
    expect(h.signedMessages).toHaveLength(0);
  });

  it("surfaces a signature-mismatch 400 with the verify-wallet hint", async () => {
    h.postOk = false;
    render(<CertificatesApp />);
    fireEvent.change(await screen.findByTestId("cert-title"), {
      target: { value: "Statement of record" },
    });
    fireEvent.change(screen.getByTestId("cert-message"), { target: { value: "Text." } });
    fireEvent.click(screen.getByTestId("cert-issue"));
    expect(await screen.findByTestId("cert-error")).toHaveTextContent(
      /verify this wallet .* under wallet & chain/i,
    );
  });

  it("without a wallet, asks the citizen to create one first (never signs)", async () => {
    h.hasWallet = false;
    render(<CertificatesApp />);
    fireEvent.change(await screen.findByTestId("cert-title"), {
      target: { value: "Statement of record" },
    });
    fireEvent.change(screen.getByTestId("cert-message"), { target: { value: "Text." } });
    fireEvent.click(screen.getByTestId("cert-issue"));
    expect(await screen.findByTestId("cert-error")).toHaveTextContent(/sovereign wallet/i);
    expect(h.signedMessages).toHaveLength(0);
  });

  it("a locked wallet opens the unlock dialog instead of signing", async () => {
    h.unlocked = false;
    render(<CertificatesApp />);
    fireEvent.change(await screen.findByTestId("cert-title"), {
      target: { value: "Statement of record" },
    });
    fireEvent.change(screen.getByTestId("cert-message"), { target: { value: "Text." } });
    fireEvent.click(screen.getByTestId("cert-issue"));
    expect(await screen.findByRole("dialog", { name: /unlock wallet/i })).toBeInTheDocument();
    expect(h.signedMessages).toHaveLength(0);
  });

  it("the DOCUMENT mode shows the never-leaves-your-device note", async () => {
    render(<CertificatesApp />);
    fireEvent.click(await screen.findByTestId("mode-document"));
    expect(screen.getByTestId("cert-file")).toBeInTheDocument();
    expect(screen.getByText(/file never leaves your device/i)).toBeInTheDocument();
  });
});

describe("CertificatesApp — list & revoke", () => {
  it("lists certificates with status badges and revokes only after arming", async () => {
    h.certificates = [
      {
        serial: "CR-2026-AAAAAA",
        kind: "MESSAGE",
        title: "Active one",
        subject: "s",
        contentHash: "0x" + "ab".repeat(32),
        signerAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        signature: "0x1234",
        issuedAt: new Date().toISOString(),
        revokedAt: null,
      },
      {
        serial: "CR-2026-BBBBBB",
        kind: "DOCUMENT",
        title: "Withdrawn one",
        subject: "deed.pdf",
        contentHash: "0x" + "cd".repeat(32),
        signerAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        signature: "0x1234",
        issuedAt: new Date().toISOString(),
        revokedAt: new Date().toISOString(),
      },
    ];
    render(<CertificatesApp />);
    const rows = await screen.findAllByTestId("certificate-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Issued")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Revoked")).toBeInTheDocument();

    const revokeBtn = screen.getByTestId("revoke-CR-2026-AAAAAA");
    fireEvent.click(revokeBtn); // arm
    expect(h.revoked).toHaveLength(0);
    expect(revokeBtn).toHaveTextContent(/confirm revoke/i);
    fireEvent.click(revokeBtn); // confirm
    await waitFor(() => expect(h.revoked).toHaveLength(1));
    expect(h.revoked[0]).toContain("/api/certificates/CR-2026-AAAAAA/revoke");
  });
});
