// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { VerifyApp } from "./VerifyApp";

/**
 * VerifyApp (Wave 15 — Identity). fetch is mocked. Asserts: malformed serials
 * are rejected client-side; VALID / REVOKED / NOT FOUND verdicts render; the
 * deed shows the public fields + honest cached-standing note; DOCUMENT
 * certificates expose the local re-hash checker; a ?serial deep link
 * auto-verifies.
 */

const h = vi.hoisted(() => ({
  status: 200,
  payload: {
    serial: "CR-2026-ABC234",
    kind: "MESSAGE" as string,
    title: "Statement of record",
    subject: "I attest this statement.",
    contentHash: "0x" + "ab".repeat(32),
    signerAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    signature: "0x1234",
    issuedAt: new Date("2026-07-01T00:00:00Z").toISOString(),
    revoked: false,
    revokedAt: null as string | null,
    signatureValid: true,
    signerHeldPassportRecord: true,
  },
  requests: [] as string[],
}));

const originalFetch = globalThis.fetch;

beforeEach(() => {
  h.status = 200;
  h.payload.revoked = false;
  h.payload.revokedAt = null;
  h.payload.signatureValid = true;
  h.payload.kind = "MESSAGE";
  h.requests = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    h.requests.push(String(input));
    if (h.status === 404) return new Response(JSON.stringify({ error: "nf" }), { status: 404 });
    return new Response(JSON.stringify(h.payload), {
      status: h.status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function lookup(serial: string) {
  fireEvent.change(screen.getByTestId("verify-serial"), { target: { value: serial } });
  fireEvent.click(screen.getByTestId("verify-submit"));
}

describe("VerifyApp", () => {
  it("rejects a malformed serial client-side (no request made)", async () => {
    render(<VerifyApp />);
    lookup("not-a-serial");
    expect(await screen.findByRole("alert")).toHaveTextContent(/CR-YYYY-XXXXXX/i);
    expect(h.requests).toHaveLength(0);
  });

  it("VALID: renders the verdict, the deed, and the honest cached-standing note", async () => {
    render(<VerifyApp />);
    lookup("cr-2026-abc234"); // lowercased input is normalized
    expect(await screen.findByTestId("verify-verdict")).toHaveTextContent(/valid/i);
    expect(h.requests[0]).toContain("serial=CR-2026-ABC234");
    expect(screen.getByTestId("verify-deed")).toHaveTextContent("Statement of record");
    expect(screen.getByTestId("verify-deed")).toHaveTextContent("CR-2026-ABC234");
    expect(screen.getByTestId("verify-standing")).toHaveTextContent(
      /sealed-passport record .* cached record, not a live chain read/i,
    );
  });

  it("REVOKED: the record stays visible with the revoked verdict", async () => {
    h.payload.revoked = true;
    h.payload.revokedAt = new Date("2026-07-03T00:00:00Z").toISOString();
    render(<VerifyApp />);
    lookup("CR-2026-ABC234");
    expect(await screen.findByTestId("verify-verdict")).toHaveTextContent(/revoked/i);
    expect(screen.getByTestId("verify-deed")).toBeInTheDocument();
  });

  it("an INVALID stored signature is called out as void", async () => {
    h.payload.signatureValid = false;
    render(<VerifyApp />);
    lookup("CR-2026-ABC234");
    expect(await screen.findByTestId("verify-verdict")).toHaveTextContent(/invalid/i);
  });

  it("NOT FOUND renders for an unknown serial", async () => {
    h.status = 404;
    render(<VerifyApp />);
    lookup("CR-2026-ZZZZZZ");
    expect(await screen.findByTestId("verify-notfound")).toHaveTextContent(/not found/i);
  });

  it("a DOCUMENT certificate exposes the client-side re-hash checker", async () => {
    h.payload.kind = "DOCUMENT";
    h.payload.subject = "deed.pdf";
    render(<VerifyApp />);
    lookup("CR-2026-ABC234");
    await waitFor(() => expect(screen.getByTestId("verify-rehash")).toBeInTheDocument());
    expect(screen.getByTestId("verify-rehash")).toHaveTextContent(/never uploaded/i);
    expect(screen.getByTestId("rehash-file")).toBeInTheDocument();
  });

  it("a ?serial deep link auto-verifies on mount", async () => {
    render(<VerifyApp initialSerial="CR-2026-ABC234" />);
    expect(await screen.findByTestId("verify-verdict")).toHaveTextContent(/valid/i);
    expect(h.requests).toHaveLength(1);
  });
});
