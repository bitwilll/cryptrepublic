// @vitest-environment node
import { describe, it, expect } from "vitest";
import { verify } from "@node-rs/argon2";
import { hashPassword, verifyPassword, DUMMY_HASH } from "./password";

describe("password (argon2id)", () => {
  it("hashes to an argon2id encoded string and verifies the right password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true);
  });
  it("rejects the wrong password", async () => {
    const hash = await hashPassword("passphrase-one-two-three");
    expect(await verifyPassword(hash, "wrong-passphrase")).toBe(false);
  });
  it("DUMMY_HASH is a valid argon2id hash that never matches", async () => {
    expect(DUMMY_HASH.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(DUMMY_HASH, "anything")).toBe(false);
  });
  it("DUMMY_HASH resolves to false via the RAW verify WITHOUT throwing (timing side-channel guard)", async () => {
    // A throw would be far faster than a real argon2 verify, re-opening the enumeration
    // timing side-channel. So the raw @node-rs/argon2 `verify` must RESOLVE to false,
    // not reject. This fails if DUMMY_HASH is a malformed/invalid literal.
    await expect(verify(DUMMY_HASH, "anything")).resolves.toBe(false);
  });
});
