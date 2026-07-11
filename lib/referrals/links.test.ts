// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Referral-link helper (Wave 17). generateLinkCode shape; the STRICT > 65
 * score gate (exactly 65 is NOT enough — mirrors the > 50 referral gate's
 * exclusive convention); the 3-active-link cap (revoked links do not count);
 * and the collision-safe create (unique `code` + bounded retry).
 */

const h = vi.hoisted(() => ({
  finalScore: 0,
  activeCount: 0,
  createCalls: 0,
  failCreatesWithP2002: 0, // first N creates throw a unique-collision error
}));

vi.mock("@/lib/trust/score", () => ({
  computeTrustScore: async () => ({
    computed: h.finalScore,
    adminAdjustment: 0,
    finalScore: h.finalScore,
    signals: {},
  }),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: async () => ({ trustAdjustment: 0 }),
    },
    referralLink: {
      count: async () => h.activeCount,
      create: async ({ data }: { data: { code: string; ownerUserId: string } }) => {
        h.createCalls++;
        if (h.createCalls <= h.failCreatesWithP2002) {
          throw Object.assign(new Error("unique constraint"), { code: "P2002" });
        }
        return {
          id: `link-${h.createCalls}`,
          code: data.code,
          ownerUserId: data.ownerUserId,
          label: (data as { label?: string | null }).label ?? null,
          createdAt: new Date("2026-07-12T00:00:00Z"),
          revokedAt: null,
        };
      },
    },
  },
}));
vi.mock("@/lib/applications/applicant", () => ({
  resolveApplicantAddress: async () => "0x00000000000000000000000000000000000000A1",
}));
vi.mock("@/lib/passport/serverReads", () => ({
  readPassportStatusServer: async () => ({ isCitizen: true, tokenId: 7n }),
}));

import {
  generateLinkCode,
  createReferralLink,
  referralLinkGate,
  REFERRAL_LINK_CODE_RE,
  MAX_ACTIVE_LINKS_PER_USER,
} from "./links";
import { REFERRAL_LINK_THRESHOLD } from "@/lib/gov/types";

beforeEach(() => {
  h.finalScore = 0;
  h.activeCount = 0;
  h.createCalls = 0;
  h.failCreatesWithP2002 = 0;
});

describe("generateLinkCode", () => {
  it("mints 10-char lowercase slugs from the vowel-free alphabet, matching the RE", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateLinkCode();
      expect(code).toHaveLength(10);
      expect(code).toMatch(REFERRAL_LINK_CODE_RE);
      expect(code).toMatch(/^[23456789bcdfghjkmnpqrstvwxyz]+$/); // no vowels/lookalikes/uppercase
    }
  });

  it("does not repeat across a small sample (collision-improbable)", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateLinkCode()));
    expect(seen.size).toBe(200);
  });
});

describe("referralLinkGate", () => {
  it("locks at exactly the threshold (65 is NOT enough — strict >)", async () => {
    h.finalScore = REFERRAL_LINK_THRESHOLD;
    const gate = await referralLinkGate(84532, "u1");
    expect(gate.unlocked).toBe(false);
    expect(gate.finalScore).toBe(65);
    expect(gate.threshold).toBe(65);
  });

  it("unlocks one point above the threshold", async () => {
    h.finalScore = REFERRAL_LINK_THRESHOLD + 1;
    const gate = await referralLinkGate(84532, "u1");
    expect(gate.unlocked).toBe(true);
  });
});

describe("createReferralLink", () => {
  it("returns a typed GATED result (with score + threshold) below the gate", async () => {
    h.finalScore = 65;
    const r = await createReferralLink(84532, "u1", "my label");
    expect(r).toEqual({ ok: false, reason: "GATED", finalScore: 65, threshold: 65 });
    expect(h.createCalls).toBe(0); // never reached the insert
  });

  it("returns a typed CAP result at 3 active links", async () => {
    h.finalScore = 80;
    h.activeCount = MAX_ACTIVE_LINKS_PER_USER;
    const r = await createReferralLink(84532, "u1");
    expect(r).toEqual({ ok: false, reason: "CAP", maxActive: 3 });
    expect(h.createCalls).toBe(0);
  });

  it("creates above the gate and under the cap, code matching the RE", async () => {
    h.finalScore = 66;
    h.activeCount = 2;
    const r = await createReferralLink(84532, "u1", "poster QR");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.link.code).toMatch(REFERRAL_LINK_CODE_RE);
      expect(r.link.label).toBe("poster QR");
    }
  });

  it("retries with a fresh code on a P2002 unique collision", async () => {
    h.finalScore = 90;
    h.failCreatesWithP2002 = 2; // first two candidates collide
    const r = await createReferralLink(84532, "u1");
    expect(r.ok).toBe(true);
    expect(h.createCalls).toBe(3);
  });

  it("gives up after 5 collision attempts", async () => {
    h.finalScore = 90;
    h.failCreatesWithP2002 = 5;
    await expect(createReferralLink(84532, "u1")).rejects.toThrow(/5 attempts/);
  });
});
