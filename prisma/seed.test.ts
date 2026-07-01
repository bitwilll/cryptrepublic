// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { seed } from "./seed";

/**
 * Seed test — runs the idempotent Wave-7 seed against the dev DB, then asserts
 * the migrated counts, a spot check, the fabricated-provenance scrub (constraint
 * #5 / §7.13 — no `CR-L2` / `CryptRepublic L2` / `TITLED ON CHAIN` strings ride
 * along inside seeded content), and idempotency (a second run leaves counts
 * unchanged). Governance proposal content + comments are NOT seeded (created
 * against real on-chain proposalIds; a fresh chain has none).
 */

describe("prisma seed (Wave 7 off-chain content)", () => {
  beforeAll(async () => {
    await seed();
  });

  it("seeds the expected catalog counts", async () => {
    expect(await prisma.assetCatalogEntry.count()).toBe(17); // 7 RE + 4 IP + 3 EQ + 3 TR
    expect(await prisma.embassyDirectory.count()).toBe(9);
    expect(await prisma.cityCensus.count()).toBe(12);
    expect(await prisma.treasuryAllocation.count()).toBe(5);
    expect(await prisma.constitutionText.count()).toBeGreaterThanOrEqual(3);
  });

  it("spot-checks a converted asset (RE-001)", async () => {
    const re001 = await prisma.assetCatalogEntry.findUnique({ where: { ref: "RE-001" } });
    expect(re001).not.toBeNull();
    expect(re001?.valueUsd).toBe(28_400_000n);
    expect(re001?.yieldBps).toBe(480);
    expect(re001?.annualYieldUsd).toBe(1_363_200n);
    expect(re001?.kind).toBe("re");
  });

  it("scrubs fabricated on-chain provenance from the seeded register", async () => {
    const rows = await prisma.assetCatalogEntry.findMany();
    const bad = /CR-L2|CryptRepublic L2|TITLED ON CHAIN/i;
    for (const r of rows) {
      expect(bad.test(r.name), `name: ${r.name}`).toBe(false);
      expect(bad.test(r.location), `location: ${r.location}`).toBe(false);
      expect(bad.test(r.status), `status: ${r.status}`).toBe(false);
    }
  });

  it("carries a dividend legal note in ConstitutionText", async () => {
    const note = await prisma.constitutionText.findUnique({
      where: { key: "dividend_legal_note" },
    });
    expect(note).not.toBeNull();
    expect(note?.body).toMatch(/regulated security/i);
  });

  it("is idempotent (a second run leaves counts unchanged)", async () => {
    await seed();
    expect(await prisma.assetCatalogEntry.count()).toBe(17);
    expect(await prisma.embassyDirectory.count()).toBe(9);
    expect(await prisma.cityCensus.count()).toBe(12);
    expect(await prisma.treasuryAllocation.count()).toBe(5);
  });
});
