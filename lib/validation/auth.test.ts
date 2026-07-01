import { describe, it, expect } from "vitest";
import { registerSchema, loginSchema, applicationSchema, normalizeEmail } from "./auth";

describe("auth zod schemas", () => {
  it("accepts a valid register payload", () => {
    expect(
      registerSchema.safeParse({ email: "a@b.co", passphrase: "x".repeat(12), name: "Ann" })
        .success,
    ).toBe(true);
  });
  it("rejects short passphrase and unknown fields", () => {
    expect(
      registerSchema.safeParse({ email: "a@b.co", passphrase: "short", name: "Ann" }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({
        email: "a@b.co",
        passphrase: "x".repeat(12),
        name: "Ann",
        role: "ADMIN",
      }).success,
    ).toBe(false);
  });
  it("login accepts any non-empty passphrase but a valid email", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", passphrase: "y" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "nope", passphrase: "y" }).success).toBe(false);
  });
  it("application rejects unknown fields", () => {
    expect(
      applicationSchema.safeParse({
        name: "Ann",
        domicileCity: "Lagos",
        hostCountry: "NG",
        extra: 1,
      }).success,
    ).toBe(false);
  });
  it("normalizeEmail lowercases and trims", () => {
    expect(normalizeEmail("  A@B.CO ")).toBe("a@b.co");
  });
});
