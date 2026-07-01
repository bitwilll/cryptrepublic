// @vitest-environment node
import { describe, it, expect } from "vitest";
import { commentSchema, proposeEmbassySchema, canonicalEmbassyContent } from "./dashboard";

describe("commentSchema", () => {
  it("accepts a valid comment", () => {
    expect(commentSchema.safeParse({ proposalId: "3", body: "I dissent." }).success).toBe(true);
  });
  it("rejects an unknown key (strict)", () => {
    expect(commentSchema.safeParse({ proposalId: "3", body: "x", isCitizen: true }).success).toBe(
      false,
    );
  });
  it("rejects a non-numeric proposalId and an empty body", () => {
    expect(commentSchema.safeParse({ proposalId: "abc", body: "x" }).success).toBe(false);
    expect(commentSchema.safeParse({ proposalId: "3", body: "" }).success).toBe(false);
  });
});

describe("proposeEmbassySchema", () => {
  const GOOD = {
    code: "PAR",
    name: "Paris",
    neighborhood: "Le Marais",
    city: "Paris",
    country: "France",
    proposalId: "5",
    txHash: "0xabc123",
  };
  it("accepts a valid body with proposalId + txHash", () => {
    expect(proposeEmbassySchema.safeParse(GOOD).success).toBe(true);
  });
  it("REQUIRES proposalId and txHash (not optional)", () => {
    const { proposalId: _p, ...noProposal } = GOOD;
    const { txHash: _t, ...noTx } = GOOD;
    expect(proposeEmbassySchema.safeParse(noProposal).success).toBe(false);
    expect(proposeEmbassySchema.safeParse(noTx).success).toBe(false);
  });
  it("rejects unknown keys (strict)", () => {
    expect(proposeEmbassySchema.safeParse({ ...GOOD, extra: 1 }).success).toBe(false);
  });
});

describe("canonicalEmbassyContent", () => {
  it("is deterministic and order-stable", () => {
    const a = canonicalEmbassyContent({
      code: "PAR",
      name: "Paris",
      neighborhood: "Le Marais",
      city: "Paris",
      country: "France",
    });
    const b = canonicalEmbassyContent({
      code: "PAR",
      name: "Paris",
      neighborhood: "Le Marais",
      city: "Paris",
      country: "France",
    });
    expect(a).toBe(b);
    expect(a).toContain("embassy");
    expect(a).toContain("PAR");
  });
});
