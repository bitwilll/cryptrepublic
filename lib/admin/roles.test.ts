// @vitest-environment node
import { describe, it, expect } from "vitest";
import { keccak256, toBytes } from "viem";
import { ADMIN_CONTRACTS, CONTRACT_ROLES, ROLE_IDS, ROLE_NAMES } from "./roles";

const ZERO_HASH = `0x${"0".repeat(64)}`;

describe("ROLE_IDS", () => {
  // Addendum #5: iterate ALL role constants PROGRAMMATICALLY — never enumerate by hand.
  it("covers every ROLE_NAMES entry: DEFAULT_ADMIN_ROLE is the zero hash, each named role is keccak256(toBytes(name))", () => {
    expect(ROLE_NAMES).toContain("DEFAULT_ADMIN_ROLE");
    expect(ROLE_NAMES.length).toBe(8); // DEFAULT_ADMIN + the seven Roles.sol names
    for (const name of ROLE_NAMES) {
      const expected = name === "DEFAULT_ADMIN_ROLE" ? ZERO_HASH : keccak256(toBytes(name));
      expect(ROLE_IDS[name], name).toBe(expected);
    }
  });

  it("role ids are pairwise distinct 32-byte hex values", () => {
    const ids = ROLE_NAMES.map((n) => ROLE_IDS[n]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("CONTRACT_ROLES (Deploy.s.sol wiring §roles + Roles.sol)", () => {
  it("keys every ADMIN_CONTRACTS entry and lists only known role names", () => {
    for (const contract of ADMIN_CONTRACTS) {
      const roles = CONTRACT_ROLES[contract];
      expect(roles.length, contract).toBeGreaterThan(0);
      expect(roles, contract).toContain("DEFAULT_ADMIN_ROLE");
      for (const role of roles) expect(ROLE_NAMES).toContain(role);
    }
  });

  it("pins the per-contract meaningful roles", () => {
    expect(CONTRACT_ROLES.token).toEqual(["DEFAULT_ADMIN_ROLE", "MINTER_ROLE", "PAUSER_ROLE"]);
    expect(CONTRACT_ROLES.passport).toEqual([
      "DEFAULT_ADMIN_ROLE",
      "GENESIS_ATTESTOR_ROLE",
      "PASSPORT_ADMIN_ROLE",
    ]);
    expect(CONTRACT_ROLES.governance).toEqual(["DEFAULT_ADMIN_ROLE"]);
    expect(CONTRACT_ROLES.treasury).toEqual(["DEFAULT_ADMIN_ROLE", "GOVERNANCE_ROLE"]);
    expect(CONTRACT_ROLES.distributor).toEqual(["DEFAULT_ADMIN_ROLE", "FUNDER_ROLE"]);
    expect(CONTRACT_ROLES.staking).toEqual(["DEFAULT_ADMIN_ROLE", "REWARDS_ADMIN_ROLE"]);
  });
});
