// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  KEY_MATERIAL_ERROR,
  bitwillFileSchema,
  bitwillRevokeSchema,
  insuranceApplySchema,
  insuranceReviewSchema,
  looksLikeKeyMaterial,
  storeRemoveSchema,
} from "./estate";

/**
 * Wave 15 estate/insurance schema tests. The NON-CUSTODIAL guard is the
 * critical case: memos that read like a seed phrase or private key are
 * refused with KEY_MATERIAL_ERROR — the registry must never become a place
 * citizens stash key material.
 */

const SIGNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const SIG = `0x${"ab".repeat(65)}`;

const VALID_FILE = {
  beneficiaryName: "Ada Lovelace",
  beneficiaryContact: "ada@example.com",
  assetsMemo: "All CRPT holdings and the house in Neo-Alexandria.",
  signerAddress: SIGNER,
  signature: SIG,
};

// A real-shaped 12-word BIP-39 sequence (the classic test vector — NOT a funded wallet).
const MNEMONIC_12 =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const MNEMONIC_24 = `${MNEMONIC_12} ${MNEMONIC_12}`;

describe("looksLikeKeyMaterial", () => {
  it("flags 12- and 24-word mnemonic-like runs, even inside surrounding text", () => {
    expect(looksLikeKeyMaterial(MNEMONIC_12)).toBe(true);
    expect(looksLikeKeyMaterial(MNEMONIC_24)).toBe(true);
    expect(looksLikeKeyMaterial(`for my heir: ${MNEMONIC_12} — keep safe`)).toBe(true);
    expect(
      looksLikeKeyMaterial(
        "legal winner thank year wave sausage worth useful legal winner thank yellow",
      ),
    ).toBe(true);
  });

  it('flags the phrases "seed phrase" and "private key" in any case/spacing', () => {
    expect(looksLikeKeyMaterial("My seed phrase is in the safe.")).toBe(true);
    expect(looksLikeKeyMaterial("SEED  PHRASE stored with the notary")).toBe(true);
    expect(looksLikeKeyMaterial("the PrivateKey is hers")).toBe(true);
    expect(looksLikeKeyMaterial("my private key belongs to my daughter")).toBe(true);
  });

  it("passes ordinary estate prose (glue words break BIP-39 runs)", () => {
    expect(
      looksLikeKeyMaterial(
        "I leave all my CRPT holdings, the apartment in Lisbon and the library to my daughter. " +
          "The hardware device itself is stored with the family notary.",
      ),
    ).toBe(false);
    expect(looksLikeKeyMaterial("Split everything equally between both children.")).toBe(false);
  });
});

describe("bitwillFileSchema", () => {
  it("accepts a valid directive body (with and without a beneficiary address)", () => {
    expect(bitwillFileSchema.safeParse(VALID_FILE).success).toBe(true);
    expect(
      bitwillFileSchema.safeParse({
        ...VALID_FILE,
        beneficiaryAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      }).success,
    ).toBe(true);
  });

  it("rejects key-material memos with the exact non-custodial message", () => {
    for (const memo of [MNEMONIC_12, MNEMONIC_24, "seed phrase: see the vault", "my private key"]) {
      const res = bitwillFileSchema.safeParse({ ...VALID_FILE, assetsMemo: memo });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues.some((i) => i.message === KEY_MATERIAL_ERROR)).toBe(true);
      }
    }
  });

  it("enforces field bounds and shapes", () => {
    const bad = [
      { ...VALID_FILE, beneficiaryName: "A" }, // < 2
      { ...VALID_FILE, beneficiaryName: "x".repeat(81) }, // > 80
      { ...VALID_FILE, beneficiaryContact: "ab" }, // < 3
      { ...VALID_FILE, beneficiaryContact: "x".repeat(121) }, // > 120
      { ...VALID_FILE, beneficiaryName: "Ada\nLovelace" }, // line break
      { ...VALID_FILE, assetsMemo: "too short" }, // < 10
      { ...VALID_FILE, assetsMemo: "x".repeat(4001) }, // > 4000
      { ...VALID_FILE, beneficiaryAddress: "0x1234" }, // not an address
      { ...VALID_FILE, signerAddress: "not-an-address" },
      { ...VALID_FILE, signature: "0x1234" }, // not 65 bytes
      { ...VALID_FILE, zz_unknown: 1 }, // strict
    ];
    for (const body of bad) expect(bitwillFileSchema.safeParse(body).success).toBe(false);
  });
});

describe("bitwillRevokeSchema", () => {
  it("accepts ONLY the empty body", () => {
    expect(bitwillRevokeSchema.safeParse({}).success).toBe(true);
    expect(bitwillRevokeSchema.safeParse({ id: "x" }).success).toBe(false);
  });
});

describe("insuranceApplySchema", () => {
  const noteOk = "Cover my apartment against fire and flood.";

  it("accepts ASSET with a declared value and HEALTH without one", () => {
    expect(
      insuranceApplySchema.safeParse({ product: "ASSET", coverageNote: noteOk, valueUsd: 250_000 })
        .success,
    ).toBe(true);
    expect(
      insuranceApplySchema.safeParse({ product: "HEALTH", coverageNote: noteOk }).success,
    ).toBe(true);
  });

  it("requires valueUsd for ASSET", () => {
    const res = insuranceApplySchema.safeParse({ product: "ASSET", coverageNote: noteOk });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.join(".") === "valueUsd")).toBe(true);
    }
  });

  it("rejects bad products, note bounds, and out-of-range values", () => {
    const bad = [
      { product: "LIFE", coverageNote: noteOk },
      { product: "ASSET", coverageNote: "too short", valueUsd: 10 },
      { product: "ASSET", coverageNote: "x".repeat(2001), valueUsd: 10 },
      { product: "ASSET", coverageNote: noteOk, valueUsd: 0 },
      { product: "ASSET", coverageNote: noteOk, valueUsd: -5 },
      { product: "ASSET", coverageNote: noteOk, valueUsd: 100_000_001 },
      { product: "ASSET", coverageNote: noteOk, valueUsd: 12.5 },
      { product: "HEALTH", coverageNote: noteOk, zz_unknown: 1 },
    ];
    for (const body of bad) expect(insuranceApplySchema.safeParse(body).success).toBe(false);
  });
});

describe("insuranceReviewSchema", () => {
  it("review/approve need no note; decline REQUIRES one (3..500)", () => {
    expect(insuranceReviewSchema.safeParse({ action: "review" }).success).toBe(true);
    expect(insuranceReviewSchema.safeParse({ action: "approve" }).success).toBe(true);
    expect(insuranceReviewSchema.safeParse({ action: "decline" }).success).toBe(false);
    expect(
      insuranceReviewSchema.safeParse({ action: "decline", reviewNote: "Insufficient detail." })
        .success,
    ).toBe(true);
    expect(insuranceReviewSchema.safeParse({ action: "decline", reviewNote: "no" }).success).toBe(
      false,
    );
    expect(
      insuranceReviewSchema.safeParse({ action: "decline", reviewNote: "x".repeat(501) }).success,
    ).toBe(false);
    expect(insuranceReviewSchema.safeParse({ action: "escalate" }).success).toBe(false);
  });
});

describe("storeRemoveSchema", () => {
  it("requires action remove + a 3..300 reason", () => {
    expect(
      storeRemoveSchema.safeParse({ action: "remove", reason: "Prohibited item." }).success,
    ).toBe(true);
    expect(storeRemoveSchema.safeParse({ action: "remove", reason: "no" }).success).toBe(false);
    expect(storeRemoveSchema.safeParse({ action: "remove", reason: "x".repeat(301) }).success).toBe(
      false,
    );
    expect(storeRemoveSchema.safeParse({ action: "delete", reason: "Prohibited." }).success).toBe(
      false,
    );
    expect(
      storeRemoveSchema.safeParse({ action: "remove", reason: "Prohibited.", zz: 1 }).success,
    ).toBe(false);
  });
});
