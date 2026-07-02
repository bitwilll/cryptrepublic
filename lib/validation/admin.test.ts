// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  suspendSchema,
  kycSetSchema,
  sessionsRevokeSchema,
  applicationReviewSchema,
  approveMintSchema,
  assetSchema,
  embassySchema,
  censusSchema,
  allocationSchema,
  constitutionSchema,
  proposalContentSchema,
  flagSchema,
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

  describe("approveMintSchema (Wave 10 — EMPTY body; the server owns every column)", () => {
    it("accepts an empty body ({})", () => {
      expect(approveMintSchema.safeParse({}).success).toBe(true);
    });
    it("rejects chain-cache AND approval fields by strictness (constraint #3 — nothing client-settable)", () => {
      for (const bad of [
        { status: "SEALED" },
        { citizenTokenId: "1" },
        { sealTxHash: "0xabc" },
        { sealedAt: "2026-07-03" },
        { adminApprovedAt: "2026-07-03" },
        { adminApprovedBy: "x" },
        { role: "ADMIN" },
      ]) {
        expect(approveMintSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
      }
    });
  });
});

const VALID_ASSET = {
  ref: "T9-001",
  kind: "re",
  name: "Test Warehouse",
  location: "Lisbon, PT",
  valueUsd: "28400000",
  yieldBps: 480,
  annualYieldUsd: "1363200",
  status: "OWNED",
  acquiredAt: "2026.01.01",
};

describe("admin validation schemas (B2 — content/flags)", () => {
  describe("assetSchema (provenance honesty — constraint #7)", () => {
    it("accepts an honest asset (BigInt columns as decimal strings)", () => {
      expect(assetSchema.safeParse(VALID_ASSET).success).toBe(true);
    });
    it("rejects fabricated on-chain provenance in name/location/status (seed-scrub mirror)", () => {
      expect(
        assetSchema.safeParse({ ...VALID_ASSET, status: "OWNED · TITLED ON CHAIN" }).success,
      ).toBe(false);
      expect(assetSchema.safeParse({ ...VALID_ASSET, location: "Chain · CR-L2" }).success).toBe(
        false,
      );
      expect(assetSchema.safeParse({ ...VALID_ASSET, name: "CryptRepublic L2 Node" }).success).toBe(
        false,
      );
      expect(
        assetSchema.safeParse({ ...VALID_ASSET, status: "titled on chain" }).success, // case-insensitive
      ).toBe(false);
    });
    it("rejects non-numeric BigInt strings and unknown keys", () => {
      expect(assetSchema.safeParse({ ...VALID_ASSET, valueUsd: "28.4M" }).success).toBe(false);
      expect(assetSchema.safeParse({ ...VALID_ASSET, extra: true }).success).toBe(false);
    });
  });

  describe("embassySchema / censusSchema", () => {
    it("accepts bounded rows", () => {
      expect(
        embassySchema.safeParse({
          code: "ZZT",
          name: "Test Embassy",
          neighborhood: "Alfama",
          hours: "09–17",
          foundedAt: "2026",
          brandColor: "#c8a96a",
          city: "Lisbon",
          country: "Portugal",
        }).success,
      ).toBe(true);
      expect(
        censusSchema.safeParse({
          code: "ZZC",
          name: "Testville",
          lat: 38.7,
          long: -9.1,
          hasEmbassy: false,
          seededCount: 12,
        }).success,
      ).toBe(true);
    });
    it("rejects out-of-range coords and unknown keys", () => {
      expect(
        censusSchema.safeParse({
          code: "ZZC",
          name: "T",
          lat: 91,
          long: 0,
          hasEmbassy: false,
          seededCount: 0,
        }).success,
      ).toBe(false);
      expect(
        embassySchema.safeParse({
          code: "ZZT",
          name: "T",
          neighborhood: "A",
          hours: "9",
          foundedAt: "2026",
          brandColor: "#fff",
          city: "L",
          country: "P",
          extra: 1,
        }).success,
      ).toBe(false);
    });
  });

  describe("allocationSchema (bucket pins the on-chain bytes32 encodability — A3 mapping)", () => {
    const valid = { bucket: "test_bucket", label: "Test", targetBps: 100, color: "#fff" };
    it("accepts a seeded-style bucket; 32-char [a-z0-9_] boundary passes", () => {
      expect(allocationSchema.safeParse(valid).success).toBe(true);
      expect(allocationSchema.safeParse({ ...valid, bucket: "a".repeat(32) }).success).toBe(true);
    });
    it("rejects 33 chars, uppercase, spaces, and multi-byte UTF-8 buckets", () => {
      expect(allocationSchema.safeParse({ ...valid, bucket: "a".repeat(33) }).success).toBe(false);
      expect(allocationSchema.safeParse({ ...valid, bucket: "Embassy_Ops" }).success).toBe(false);
      expect(allocationSchema.safeParse({ ...valid, bucket: "embassy ops" }).success).toBe(false);
      expect(allocationSchema.safeParse({ ...valid, bucket: "büdget" }).success).toBe(false);
    });
    it("bounds targetBps to 0..10000", () => {
      expect(allocationSchema.safeParse({ ...valid, targetBps: 10_000 }).success).toBe(true);
      expect(allocationSchema.safeParse({ ...valid, targetBps: 10_001 }).success).toBe(false);
      expect(allocationSchema.safeParse({ ...valid, targetBps: -1 }).success).toBe(false);
    });
  });

  describe("constitutionSchema / proposalContentSchema / flagSchema", () => {
    it("constitution rows validate", () => {
      expect(
        constitutionSchema.safeParse({
          key: "test_key",
          title: "Test",
          body: "Body text.",
          citation: null,
        }).success,
      ).toBe(true);
      expect(constitutionSchema.safeParse({ key: "test_key", title: "T", body: "" }).success).toBe(
        false,
      );
    });
    it("proposal content: title/tag (+ optional body); unknown tag rejected", () => {
      expect(proposalContentSchema.safeParse({ title: "T", tag: "CIVIC" }).success).toBe(true);
      expect(proposalContentSchema.safeParse({ title: "T", tag: "CIVIC", body: "b" }).success).toBe(
        true,
      );
      expect(proposalContentSchema.safeParse({ title: "T", tag: "OTHER" }).success).toBe(false);
      expect(
        proposalContentSchema.safeParse({ title: "T", tag: "CIVIC", descriptionHash: "0x0" })
          .success,
      ).toBe(false); // hash not editable
    });
    it("flag keys pin /^[a-z0-9_]{3,64}$/", () => {
      expect(flagSchema.safeParse({ key: "population_world_map", enabled: true }).success).toBe(
        true,
      );
      expect(flagSchema.safeParse({ key: "ab", enabled: true }).success).toBe(false);
      expect(flagSchema.safeParse({ key: "Bad-Key", enabled: true }).success).toBe(false);
      expect(flagSchema.safeParse({ key: "ok_key", enabled: true, description: "d" }).success).toBe(
        true,
      );
      expect(
        flagSchema.safeParse({ key: "ok_key", enabled: "yes" }).success, // wrong type
      ).toBe(false);
    });
  });
});
