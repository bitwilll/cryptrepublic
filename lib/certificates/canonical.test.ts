// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  canonicalPayload,
  normalizeText,
  sha256Hex,
  sha256HexOfText,
  CERTIFICATE_PAYLOAD_HEADER,
} from "./canonical";
import { base32, certificateSerial, SERIAL_PATTERN } from "./serial";

/**
 * Canonicalization (Wave 15 — Identity). The signed payload must be byte-stable
 * across platforms: fixed field order, LF-normalized text, lowercased hash.
 * Serials are deterministic base32 derivations of the record id.
 */

const HASH = "0x" + "ab".repeat(32);

describe("canonicalPayload", () => {
  it("builds the exact five-line v1 layout", () => {
    const p = canonicalPayload({
      kind: "MESSAGE",
      title: "Oath of office",
      subject: "I affirm the constitution.",
      contentHash: HASH,
    });
    expect(p).toBe(
      `${CERTIFICATE_PAYLOAD_HEADER}\n` +
        "KIND: MESSAGE\n" +
        "TITLE: Oath of office\n" +
        "SUBJECT: I affirm the constitution.\n" +
        `SHA-256: ${HASH}`,
    );
  });

  it("is stable: identical inputs yield identical strings", () => {
    const fields = {
      kind: "DOCUMENT" as const,
      title: "Deed",
      subject: "deed.pdf",
      contentHash: HASH,
    };
    expect(canonicalPayload(fields)).toBe(canonicalPayload({ ...fields }));
  });

  it("normalizes CRLF and CR to LF in title and subject", () => {
    const crlf = canonicalPayload({
      kind: "MESSAGE",
      title: "line1\r\nline2",
      subject: "a\rb",
      contentHash: HASH,
    });
    const lf = canonicalPayload({
      kind: "MESSAGE",
      title: "line1\nline2",
      subject: "a\nb",
      contentHash: HASH,
    });
    expect(crlf).toBe(lf);
    expect(crlf).not.toContain("\r");
  });

  it("lowercases the content hash", () => {
    const upper = canonicalPayload({
      kind: "MESSAGE",
      title: "T.i.t",
      subject: "s",
      contentHash: "0x" + "AB".repeat(32),
    });
    expect(upper).toContain(`SHA-256: ${HASH}`);
  });

  it("preserves unicode content verbatim", () => {
    const p = canonicalPayload({
      kind: "MESSAGE",
      title: "Республика — 共和国",
      subject: "Ẑ𝔢phyr ünïcode ✓",
      contentHash: HASH,
    });
    expect(p).toContain("TITLE: Республика — 共和国");
    expect(p).toContain("SUBJECT: Ẑ𝔢phyr ünïcode ✓");
  });
});

describe("normalizeText / hashing", () => {
  it("normalizeText converts every line-ending style to LF", () => {
    expect(normalizeText("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
  });

  it("sha256HexOfText matches the known SHA-256 of 'abc'", async () => {
    expect(await sha256HexOfText("abc")).toBe(
      "0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("sha256HexOfText hashes the NORMALIZED text (CRLF == LF)", async () => {
    expect(await sha256HexOfText("a\r\nb")).toBe(await sha256HexOfText("a\nb"));
  });

  it("sha256Hex hashes raw bytes (empty input has the canonical empty digest)", async () => {
    expect(await sha256Hex(new Uint8Array(0))).toBe(
      "0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

describe("certificateSerial", () => {
  it("derives a stable CR-<year>-<base32×6> serial from the id", () => {
    const s = certificateSerial("ck2qwer1234567zxcv", new Date("2026-07-07T00:00:00Z"));
    expect(s).toMatch(SERIAL_PATTERN);
    expect(s.startsWith("CR-2026-")).toBe(true);
    // deterministic
    expect(certificateSerial("ck2qwer1234567zxcv", new Date("2026-07-07T00:00:00Z"))).toBe(s);
  });

  it("different ids yield different codes", () => {
    const d = new Date("2026-01-01T00:00:00Z");
    expect(certificateSerial("aaaa-bbbb-cccc-0001", d)).not.toBe(
      certificateSerial("aaaa-bbbb-cccc-0002", d),
    );
  });

  it("base32 encodes RFC 4648 test vectors", () => {
    const enc = (s: string) => base32(new TextEncoder().encode(s));
    expect(enc("")).toBe("");
    expect(enc("f")).toBe("MY");
    expect(enc("fo")).toBe("MZXQ");
    expect(enc("foo")).toBe("MZXW6");
    expect(enc("foob")).toBe("MZXW6YQ");
    expect(enc("fooba")).toBe("MZXW6YTB");
    expect(enc("foobar")).toBe("MZXW6YTBOI");
  });
});
