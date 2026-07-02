// @vitest-environment node
import { describe, it, expect } from "vitest";
import { decodeFunctionData, keccak256, stringToHex } from "viem";
import {
  accessControlAbi,
  adminDistributorAbi,
  adminGovernanceAbi,
  adminPassportAbi,
  adminStakingAbi,
  adminTokenAbi,
  adminTreasuryAbi,
} from "./abis";
import { ROLE_IDS } from "./roles";
import {
  prepareGrantRole,
  prepareRevokeRole,
  preparePause,
  prepareUnpause,
  prepareAdminMint,
  prepareSetRequiredWitnesses,
  prepareSetBaseURI,
  prepareSetBurnEnabled,
  prepareSetVotingPeriod,
  prepareSetQuorumBps,
  prepareSetExecutionDelay,
  prepareSetMinCitizens,
  prepareSetTargetAllowed,
  prepareSetAllocation,
  prepareSetAssetWhitelist,
  prepareDisburseProposal,
  prepareFundDividendsProposal,
  prepareOpenEpochBatch,
  prepareSetApr,
  prepareFundRewardsBatch,
  safeTxBuilderJson,
  type PreparedBatch,
} from "./prepare";

const CHAIN = 31337;
const TOKEN = "0x1000000000000000000000000000000000000001" as const;
const PASSPORT = "0x1000000000000000000000000000000000000002" as const;
const GOVERNANCE = "0x1000000000000000000000000000000000000003" as const;
const TREASURY = "0x1000000000000000000000000000000000000004" as const;
const DISTRIBUTOR = "0x1000000000000000000000000000000000000005" as const;
const STAKING = "0x1000000000000000000000000000000000000006" as const;
const ACCOUNT = "0x2000000000000000000000000000000000000001" as const;
const RECIPIENT = "0x2000000000000000000000000000000000000002" as const;

describe("prepare* decode round-trips (encodeFunctionData ↔ decodeFunctionData)", () => {
  it("prepareGrantRole encodes grantRole(ROLE_ID, account) addressed to the contract", () => {
    const batch = prepareGrantRole(CHAIN, "staking", STAKING, "REWARDS_ADMIN_ROLE", ACCOUNT);
    expect(batch.kind).toBe("single");
    expect(batch.txs).toHaveLength(1);
    expect(batch.txs[0].to).toBe(STAKING);
    expect(batch.txs[0].chainId).toBe(CHAIN);
    const decoded = decodeFunctionData({ abi: accessControlAbi, data: batch.txs[0].data });
    expect(decoded.functionName).toBe("grantRole");
    expect(decoded.args).toEqual([ROLE_IDS.REWARDS_ADMIN_ROLE, ACCOUNT]);
    expect(batch.txs[0].decoded.contract).toBe("staking");
    expect(batch.txs[0].decoded.functionName).toBe("grantRole");
  });

  it("prepareRevokeRole encodes revokeRole(ROLE_ID, account)", () => {
    const batch = prepareRevokeRole(CHAIN, "token", TOKEN, "MINTER_ROLE", ACCOUNT);
    const decoded = decodeFunctionData({ abi: accessControlAbi, data: batch.txs[0].data });
    expect(decoded.functionName).toBe("revokeRole");
    expect(decoded.args).toEqual([ROLE_IDS.MINTER_ROLE, ACCOUNT]);
  });

  it("preparePause / prepareUnpause encode pause() / unpause() on the token", () => {
    const p = preparePause(CHAIN, TOKEN);
    const u = prepareUnpause(CHAIN, TOKEN);
    expect(decodeFunctionData({ abi: adminTokenAbi, data: p.txs[0].data }).functionName).toBe(
      "pause",
    );
    expect(decodeFunctionData({ abi: adminTokenAbi, data: u.txs[0].data }).functionName).toBe(
      "unpause",
    );
    expect(p.txs[0].to).toBe(TOKEN);
  });

  it("passport param setters round-trip", () => {
    const w = prepareSetRequiredWitnesses(CHAIN, PASSPORT, 7);
    const wd = decodeFunctionData({ abi: adminPassportAbi, data: w.txs[0].data });
    expect(wd.functionName).toBe("setRequiredWitnesses");
    expect(wd.args).toEqual([7]);

    const b = prepareSetBaseURI(CHAIN, PASSPORT, "https://api.example/passport/");
    const bd = decodeFunctionData({ abi: adminPassportAbi, data: b.txs[0].data });
    expect(bd.functionName).toBe("setBaseURI");
    expect(bd.args).toEqual(["https://api.example/passport/"]);

    const e = prepareSetBurnEnabled(CHAIN, PASSPORT, true);
    const ed = decodeFunctionData({ abi: adminPassportAbi, data: e.txs[0].data });
    expect(ed.functionName).toBe("setBurnEnabled");
    expect(ed.args).toEqual([true]);
  });

  it("governance param setters round-trip", () => {
    const cases: [PreparedBatch, string, readonly unknown[]][] = [
      [prepareSetVotingPeriod(CHAIN, GOVERNANCE, 259_200n), "setVotingPeriod", [259_200n]],
      [prepareSetQuorumBps(CHAIN, GOVERNANCE, 2500), "setQuorumBps", [2500]],
      [prepareSetExecutionDelay(CHAIN, GOVERNANCE, 172_800n), "setExecutionDelay", [172_800n]],
      [prepareSetMinCitizens(CHAIN, GOVERNANCE, 3n), "setMinCitizensForProposal", [3n]],
      [
        prepareSetTargetAllowed(CHAIN, GOVERNANCE, TREASURY, true),
        "setTargetAllowed",
        [TREASURY, true],
      ],
    ];
    for (const [batch, fn, args] of cases) {
      const decoded = decodeFunctionData({ abi: adminGovernanceAbi, data: batch.txs[0].data });
      expect(decoded.functionName).toBe(fn);
      expect(decoded.args).toEqual(args);
      expect(batch.txs[0].to).toBe(GOVERNANCE);
    }
  });

  it("prepareSetAllocation encodes setAllocation(bytes32(bucket), bps) with the stringToHex size-32 mapping", () => {
    const batch = prepareSetAllocation(CHAIN, TREASURY, "embassy_ops", 3800, 5000);
    const decoded = decodeFunctionData({ abi: adminTreasuryAbi, data: batch.txs[0].data });
    expect(decoded.functionName).toBe("setAllocation");
    expect(decoded.args).toEqual([stringToHex("embassy_ops", { size: 32 }), 3800]);
  });

  it("prepareSetAssetWhitelist round-trips", () => {
    const batch = prepareSetAssetWhitelist(CHAIN, TREASURY, TOKEN, true);
    const decoded = decodeFunctionData({ abi: adminTreasuryAbi, data: batch.txs[0].data });
    expect(decoded.functionName).toBe("setAssetWhitelist");
    expect(decoded.args).toEqual([TOKEN, true]);
  });

  it("prepareSetApr round-trips", () => {
    const batch = prepareSetApr(CHAIN, STAKING, 2500);
    const decoded = decodeFunctionData({ abi: adminStakingAbi, data: batch.txs[0].data });
    expect(decoded.functionName).toBe("setApr");
    expect(decoded.args).toEqual([2500]);
  });
});

describe("2-tx pull-pattern batches (approve FIRST — openEpoch/fundRewards PULL via safeTransferFrom)", () => {
  it("prepareOpenEpochBatch is EXACTLY [token.approve(distributor, amount), distributor.openEpoch(amount)] in order", () => {
    const batch = prepareOpenEpochBatch(CHAIN, TOKEN, DISTRIBUTOR, 1_000n);
    expect(batch.kind).toBe("batch");
    expect(batch.txs).toHaveLength(2);

    expect(batch.txs[0].to).toBe(TOKEN);
    const approve = decodeFunctionData({ abi: adminTokenAbi, data: batch.txs[0].data });
    expect(approve.functionName).toBe("approve");
    expect(approve.args).toEqual([DISTRIBUTOR, 1_000n]);

    expect(batch.txs[1].to).toBe(DISTRIBUTOR);
    const open = decodeFunctionData({ abi: adminDistributorAbi, data: batch.txs[1].data });
    expect(open.functionName).toBe("openEpoch");
    expect(open.args).toEqual([1_000n]);
  });

  it("prepareFundRewardsBatch is [token.approve(staking, amount), staking.fundRewards(amount)]", () => {
    const batch = prepareFundRewardsBatch(CHAIN, TOKEN, STAKING, 500n);
    expect(batch.txs).toHaveLength(2);
    expect(batch.txs[0].to).toBe(TOKEN);
    const approve = decodeFunctionData({ abi: adminTokenAbi, data: batch.txs[0].data });
    expect(approve.args).toEqual([STAKING, 500n]);
    expect(batch.txs[1].to).toBe(STAKING);
    const fund = decodeFunctionData({ abi: adminStakingAbi, data: batch.txs[1].data });
    expect(fund.functionName).toBe("fundRewards");
    expect(fund.args).toEqual([500n]);
  });
});

describe("validation mirrors THROW before encoding (contract require strings mirrored)", () => {
  it("quorum > 10000", () => {
    expect(() => prepareSetQuorumBps(CHAIN, GOVERNANCE, 10_001)).toThrow(/quorum/);
  });
  it("witnesses > 10", () => {
    expect(() => prepareSetRequiredWitnesses(CHAIN, PASSPORT, 11)).toThrow(/witnesses/);
  });
  it("apr > 50000", () => {
    expect(() => prepareSetApr(CHAIN, STAKING, 50_001)).toThrow(/apr/);
  });
  it("minCitizens < 1", () => {
    expect(() => prepareSetMinCitizens(CHAIN, GOVERNANCE, 0n)).toThrow(/minCitizens/);
  });
  it("allocation overflow: currentTotalMinusBucket + bps > 10000", () => {
    expect(() => prepareSetAllocation(CHAIN, TREASURY, "embassy_ops", 5001, 5000)).toThrow(
      /[Aa]llocation/,
    );
  });
  it("allocation bucket whose UTF-8 exceeds 32 bytes: DESIGNED mirror-throw, not a raw viem SizeExceedsPaddingSizeError", () => {
    const long = "a".repeat(33);
    expect(() => prepareSetAllocation(CHAIN, TREASURY, long, 100, 0)).toThrow(/32 bytes/);
    expect(() => prepareSetAllocation(CHAIN, TREASURY, long, 100, 0)).not.toThrow(
      /SizeExceedsPaddingSize/,
    );
    // Multi-byte UTF-8: 17 chars of a 2-byte glyph = 34 bytes — must also mirror-throw.
    expect(() => prepareSetAllocation(CHAIN, TREASURY, "é".repeat(17), 100, 0)).toThrow(/32 bytes/);
  });
  it("openEpoch amount <= 0", () => {
    expect(() => prepareOpenEpochBatch(CHAIN, TOKEN, DISTRIBUTOR, 0n)).toThrow(/amount/);
    expect(() => prepareFundRewardsBatch(CHAIN, TOKEN, STAKING, 0n)).toThrow(/amount/);
  });

  it("boundary values PASS: 10000 / 10 / 50000 / 1n / a 32-byte bucket", () => {
    expect(() => prepareSetQuorumBps(CHAIN, GOVERNANCE, 10_000)).not.toThrow();
    expect(() => prepareSetRequiredWitnesses(CHAIN, PASSPORT, 10)).not.toThrow();
    expect(() => prepareSetApr(CHAIN, STAKING, 50_000)).not.toThrow();
    expect(() => prepareSetMinCitizens(CHAIN, GOVERNANCE, 1n)).not.toThrow();
    const bucket32 = "b".repeat(32);
    const batch = prepareSetAllocation(CHAIN, TREASURY, bucket32, 1000, 9000);
    const decoded = decodeFunctionData({ abi: adminTreasuryAbi, data: batch.txs[0].data });
    expect(decoded.args?.[0]).toBe(stringToHex(bucket32, { size: 32 }));
  });
});

describe("treasury GOVERNANCE_ROLE actions — governance-proposal payloads, NEVER direct Safe txs", () => {
  it("prepareDisburseProposal returns a GovernanceProposalPayload with the propose() artifact and the two-prerequisites note", () => {
    const description = "wave9 disburse to recipient";
    const payload = prepareDisburseProposal(
      CHAIN,
      GOVERNANCE,
      TREASURY,
      TOKEN,
      RECIPIENT,
      1_000n,
      description,
    );

    // NOT a PreparedBatch — no txs array / kind.
    expect("txs" in payload).toBe(false);
    expect("kind" in payload).toBe(false);

    expect(payload.chainId).toBe(CHAIN);
    expect(payload.target).toBe(TREASURY);
    expect(payload.value).toBe("0");

    // callData = disburse(token, to, amount) on the treasury ABI.
    const inner = decodeFunctionData({ abi: adminTreasuryAbi, data: payload.callData });
    expect(inner.functionName).toBe("disburse");
    expect(inner.args).toEqual([TOKEN, RECIPIENT, 1_000n]);
    expect(payload.decoded.functionName).toBe("disburse");

    // descriptionHash binding convention: keccak256(stringToHex(description)) — EmbassiesApp.tsx:223.
    expect(payload.description).toBe(description);
    expect(payload.descriptionHash).toBe(keccak256(stringToHex(description)));

    // The copyable artifact: FULL propose(target, 0, callData, descriptionHash) to the GOVERNANCE contract.
    expect(payload.propose.to).toBe(GOVERNANCE);
    expect(payload.propose.value).toBe("0");
    const outer = decodeFunctionData({ abi: adminGovernanceAbi, data: payload.propose.data });
    expect(outer.functionName).toBe("propose");
    expect(outer.args).toEqual([TREASURY, 0n, payload.callData, payload.descriptionHash]);

    // Honest-path note names BOTH submission prerequisites.
    expect(payload.note).toMatch(/citizen/i); // (1) proposer must be a citizen wallet (NotCitizen)
    expect(payload.note).toMatch(/NotCitizen/);
    expect(payload.note).toMatch(/GovernanceProposalContent/); // (2) content-row descriptionHash binding
  });

  it("prepareFundDividendsProposal encodes fundDividends(distributor, amount) the same way", () => {
    const payload = prepareFundDividendsProposal(
      CHAIN,
      GOVERNANCE,
      TREASURY,
      DISTRIBUTOR,
      2_000n,
      "wave9 fund dividends",
    );
    const inner = decodeFunctionData({ abi: adminTreasuryAbi, data: payload.callData });
    expect(inner.functionName).toBe("fundDividends");
    expect(inner.args).toEqual([DISTRIBUTOR, 2_000n]);
    const outer = decodeFunctionData({ abi: adminGovernanceAbi, data: payload.propose.data });
    expect(outer.args?.[0]).toBe(TREASURY);
    expect(outer.args?.[3]).toBe(payload.descriptionHash);
  });

  it("empty description throws", () => {
    expect(() =>
      prepareDisburseProposal(CHAIN, GOVERNANCE, TREASURY, TOKEN, RECIPIENT, 1n, ""),
    ).toThrow(/description/i);
    expect(() =>
      prepareFundDividendsProposal(CHAIN, GOVERNANCE, TREASURY, DISTRIBUTOR, 1n, "   "),
    ).toThrow(/description/i);
  });
});

describe("prepareAdminMint (witness-FREE admin passport mint — Wave 10)", () => {
  const TO = "0x2000000000000000000000000000000000000009" as const;
  const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;
  const NAME_HASH = keccak256(stringToHex("Ada Test"));
  const MOTTO = stringToHex("code is law", { size: 32 });
  const DOMICILE = stringToHex("Neo Berlin", { size: 32 });

  it("encodes adminMint(to, nameHash, motto, domicile) — decode round-trip", () => {
    const batch = prepareAdminMint(CHAIN, PASSPORT, TO, NAME_HASH, MOTTO, DOMICILE);
    const decoded = decodeFunctionData({ abi: adminPassportAbi, data: batch.txs[0].data });
    expect(decoded.functionName).toBe("adminMint");
    expect(decoded.args).toEqual([TO, NAME_HASH, MOTTO, DOMICILE]);
  });

  it("returns a single-tx PreparedBatch addressed to the passport, value 0, decoded passport/adminMint", () => {
    const batch = prepareAdminMint(CHAIN, PASSPORT, TO, NAME_HASH, MOTTO, DOMICILE);
    expect(batch.kind).toBe("single");
    expect(batch.txs).toHaveLength(1);
    expect(batch.txs[0].to).toBe(PASSPORT);
    expect(batch.txs[0].value).toBe("0");
    expect(batch.txs[0].decoded.contract).toBe("passport");
    expect(batch.txs[0].decoded.functionName).toBe("adminMint");
    expect(batch.txs[0].decoded.summary).toContain("adminMint");
  });

  it("rejects the zero address BEFORE encoding (ZeroAddress mirror)", () => {
    expect(() => prepareAdminMint(CHAIN, PASSPORT, ZERO_ADDR, NAME_HASH, MOTTO, DOMICILE)).toThrow(
      /non-zero address/i,
    );
  });

  it("rejects a malformed `to` (not a 20-byte hex address)", () => {
    expect(() =>
      prepareAdminMint(CHAIN, PASSPORT, "0x1234" as `0x${string}`, NAME_HASH, MOTTO, DOMICILE),
    ).toThrow(/address/i);
  });

  it("rejects a non-32-byte nameHash / motto / domicile", () => {
    expect(() =>
      prepareAdminMint(CHAIN, PASSPORT, TO, "0x1234" as `0x${string}`, MOTTO, DOMICILE),
    ).toThrow(/32/);
    expect(() =>
      prepareAdminMint(CHAIN, PASSPORT, TO, NAME_HASH, "0xab" as `0x${string}`, DOMICILE),
    ).toThrow(/32/);
    expect(() =>
      prepareAdminMint(CHAIN, PASSPORT, TO, NAME_HASH, MOTTO, "0xab" as `0x${string}`),
    ).toThrow(/32/);
  });

  it("safeTxBuilderJson exports the single adminMint tx byte-faithfully", () => {
    const batch = prepareAdminMint(CHAIN, PASSPORT, TO, NAME_HASH, MOTTO, DOMICILE);
    const json = safeTxBuilderJson(batch);
    expect(json.transactions).toHaveLength(1);
    expect(json.transactions[0].to).toBe(batch.txs[0].to);
    expect(json.transactions[0].data).toBe(batch.txs[0].data);
    expect(json.transactions[0].value).toBe("0");
  });
});

describe("non-custodial invariants", () => {
  it('every PreparedTx.value === "0" — admin actions never move ETH from the panel', () => {
    const batches: PreparedBatch[] = [
      prepareGrantRole(CHAIN, "staking", STAKING, "REWARDS_ADMIN_ROLE", ACCOUNT),
      prepareRevokeRole(CHAIN, "token", TOKEN, "MINTER_ROLE", ACCOUNT),
      preparePause(CHAIN, TOKEN),
      prepareUnpause(CHAIN, TOKEN),
      prepareSetRequiredWitnesses(CHAIN, PASSPORT, 7),
      prepareSetBaseURI(CHAIN, PASSPORT, "https://x/"),
      prepareSetBurnEnabled(CHAIN, PASSPORT, false),
      prepareSetVotingPeriod(CHAIN, GOVERNANCE, 1n),
      prepareSetQuorumBps(CHAIN, GOVERNANCE, 1),
      prepareSetExecutionDelay(CHAIN, GOVERNANCE, 1n),
      prepareSetMinCitizens(CHAIN, GOVERNANCE, 1n),
      prepareSetTargetAllowed(CHAIN, GOVERNANCE, TREASURY, true),
      prepareSetAllocation(CHAIN, TREASURY, "ops", 100, 0),
      prepareSetAssetWhitelist(CHAIN, TREASURY, TOKEN, true),
      prepareOpenEpochBatch(CHAIN, TOKEN, DISTRIBUTOR, 1n),
      prepareSetApr(CHAIN, STAKING, 1),
      prepareFundRewardsBatch(CHAIN, TOKEN, STAKING, 1n),
    ];
    for (const batch of batches) {
      for (const tx of batch.txs) expect(tx.value).toBe("0");
    }
    const payload = prepareDisburseProposal(CHAIN, GOVERNANCE, TREASURY, TOKEN, RECIPIENT, 1n, "d");
    expect(payload.value).toBe("0");
    expect(payload.propose.value).toBe("0");
  });
});

describe("safeTxBuilderJson (Safe Transaction Builder import format)", () => {
  it("emits version 1.0, DECIMAL-STRING chainId, and byte-faithful transactions", () => {
    const batch = prepareOpenEpochBatch(CHAIN, TOKEN, DISTRIBUTOR, 1_000n);
    const json = safeTxBuilderJson(batch);
    expect(json.version).toBe("1.0");
    expect(json.chainId).toBe("31337");
    expect(typeof json.createdAt).toBe("number");
    expect(json.meta.name.length).toBeGreaterThan(0);
    expect(json.meta.description.length).toBeGreaterThan(0);
    expect(json.transactions).toHaveLength(2);
    json.transactions.forEach((tx, i) => {
      expect(tx.to).toBe(batch.txs[i].to);
      expect(tx.data).toBe(batch.txs[i].data);
      expect(tx.value).toBe("0");
    });
    // Plain JSON — serializable without a BigInt TypeError.
    expect(() => JSON.stringify(json)).not.toThrow();
  });
});
