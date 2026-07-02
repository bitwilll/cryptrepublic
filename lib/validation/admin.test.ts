// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  suspendSchema,
  kycSetSchema,
  sessionsRevokeSchema,
  applicationReviewSchema,
} from "@/lib/validation/admin";

describe("admin validation schemas (B1 — users/applications)", () => {
  describe("suspendSchema", () => {
    it("accepts { suspended: boolean }", () => {
      expect(suspendSchema.safeParse({ suspended: true }).success).toBe(true);
      expect(suspendSchema.safeParse({ suspended: false }).success).toBe(true);
    });
    it("rejects unknown keys (strict) and wrong types", () => {
      expect(suspendSchema.safeParse({ suspended: true, role: "ADMIN" }).success).toBe(false);
      expect(suspendSchema.safeParse({ suspended: "yes" }).success).toBe(false);
      expect(suspendSchema.safeParse({}).success).toBe(false);
    });
  });

  describe("kycSetSchema", () => {
    it("accepts every KycStatus member", () => {
      for (const kycStatus of ["NONE", "PENDING", "APPROVED", "REJECTED"]) {
        expect(kycSetSchema.safeParse({ kycStatus }).success).toBe(true);
      }
    });
    it("rejects an unknown status", () => {
      expect(kycSetSchema.safeParse({ kycStatus: "NOPE" }).success).toBe(false);
    });
    it("has NO role field — a body containing role is rejected by strictness (no promotion path)", () => {
      expect(kycSetSchema.safeParse({ kycStatus: "APPROVED", role: "ADMIN" }).success).toBe(false);
    });
  });

  describe("sessionsRevokeSchema", () => {
    it("accepts { sessionId } XOR { all: true }", () => {
      expect(sessionsRevokeSchema.safeParse({ sessionId: "abc" }).success).toBe(true);
      expect(sessionsRevokeSchema.safeParse({ all: true }).success).toBe(true);
    });
    it("rejects both keys together, all:false, and empty bodies", () => {
      expect(sessionsRevokeSchema.safeParse({ sessionId: "abc", all: true }).success).toBe(false);
      expect(sessionsRevokeSchema.safeParse({ all: false }).success).toBe(false);
      expect(sessionsRevokeSchema.safeParse({}).success).toBe(false);
    });
  });

  describe("applicationReviewSchema", () => {
    it("accepts kycStatus and/or reviewNote", () => {
      expect(applicationReviewSchema.safeParse({ kycStatus: "APPROVED" }).success).toBe(true);
      expect(applicationReviewSchema.safeParse({ reviewNote: "checked" }).success).toBe(true);
      expect(
        applicationReviewSchema.safeParse({ kycStatus: "REJECTED", reviewNote: "docs missing" })
          .success,
      ).toBe(true);
    });
    it("requires at least one key", () => {
      expect(applicationReviewSchema.safeParse({}).success).toBe(false);
    });
    it("rejects chain-state keys by strictness (constraint #6 — admin cannot fake chain state)", () => {
      expect(
        applicationReviewSchema.safeParse({ kycStatus: "APPROVED", status: "SEALED" }).success,
      ).toBe(false);
      expect(
        applicationReviewSchema.safeParse({ reviewNote: "x", citizenTokenId: "9" }).success,
      ).toBe(false);
      expect(
        applicationReviewSchema.safeParse({ reviewNote: "x", sealTxHash: "0xabc" }).success,
      ).toBe(false);
    });
    it("bounds reviewNote at 2000 chars", () => {
      expect(applicationReviewSchema.safeParse({ reviewNote: "x".repeat(2000) }).success).toBe(
        true,
      );
      expect(applicationReviewSchema.safeParse({ reviewNote: "x".repeat(2001) }).success).toBe(
        false,
      );
    });
  });
});
