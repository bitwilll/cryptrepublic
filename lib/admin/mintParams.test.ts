// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getAddress } from "viem";
import { prisma } from "@/lib/db";
import { nameHashOf, toBytes32String } from "@/lib/passport/attestation";
import { buildAdminMintParams } from "./mintParams";

/** Unique checksummed address per run (LinkedWallet.address is @unique). */
function randomAddress(): `0x${string}` {
  const hex = Array.from(
    { length: 40 },
    () => "0123456789abcdef"[Math.floor(Math.random() * 16)],
  ).join("");
  return getAddress(`0x${hex}`);
}

const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const verifiedAddress = randomAddress();
let verifiedUserId: string;
let unverifiedWalletUserId: string;
let noWalletUserId: string;

describe("buildAdminMintParams (server mint-param builder — Wave 10 A3)", () => {
  beforeAll(async () => {
    const verified = await prisma.user.create({
      data: {
        email: `mintparams-verified-${suffix}@w10adm.example`,
        linkedWallets: {
          create: { address: verifiedAddress, chain: "EVM", verifiedAt: new Date() },
        },
      },
    });
    verifiedUserId = verified.id;

    const unverified = await prisma.user.create({
      data: {
        email: `mintparams-unverified-${suffix}@w10adm.example`,
        linkedWallets: { create: { address: randomAddress(), chain: "EVM", verifiedAt: null } },
      },
    });
    unverifiedWalletUserId = unverified.id;

    const noWallet = await prisma.user.create({
      data: { email: `mintparams-nowallet-${suffix}@w10adm.example` },
    });
    noWalletUserId = noWallet.id;
  });

  it("resolves the verified wallet (checksummed) + encodes name/motto/domicile like the witnessed seal path", async () => {
    const params = await buildAdminMintParams({
      userId: verifiedUserId,
      name: "Ada Lovelace",
      motto: "code is law",
      domicileCity: "Neo Berlin",
    });
    expect(params).not.toBeNull();
    expect(params!.to).toBe(verifiedAddress); // checksummed via resolveApplicantAddress
    expect(params!.nameHash).toBe(nameHashOf("Ada Lovelace"));
    // Byte-identical to MintFlow's seal payload: toBytes32String(value.trim().slice(0, 31)).
    expect(params!.motto).toBe(toBytes32String("code is law"));
    expect(params!.domicile).toBe(toBytes32String("Neo Berlin"));
  });

  it("trims BEFORE slicing (addendum #2) — padded whitespace encodes byte-identically to the witnessed path", async () => {
    const longMotto = "veritas libertas aequitas forever"; // 33 chars — slicing matters
    const params = await buildAdminMintParams({
      userId: verifiedUserId,
      name: "Ada Lovelace",
      motto: `   ${longMotto}   `,
      domicileCity: "  Neo Berlin  ",
    });
    expect(params).not.toBeNull();
    // trim() FIRST, then slice(0, 31) — MintFlow.tsx seal order. A slice-first
    // implementation would keep the leading spaces and drop trailing letters.
    expect(params!.motto).toBe(toBytes32String(longMotto.slice(0, 31)));
    expect(params!.domicile).toBe(toBytes32String("Neo Berlin"));
  });

  it("null motto/domicile encode as empty bytes32 strings (defensive)", async () => {
    const params = await buildAdminMintParams({
      userId: verifiedUserId,
      name: "Ada Lovelace",
      motto: null,
      domicileCity: null,
    });
    expect(params).not.toBeNull();
    expect(params!.motto).toBe(toBytes32String(""));
    expect(params!.domicile).toBe(toBytes32String(""));
  });

  it("returns null when the user has NO verified wallet (unverified row or none at all)", async () => {
    expect(
      await buildAdminMintParams({
        userId: unverifiedWalletUserId,
        name: "X",
        motto: null,
        domicileCity: null,
      }),
    ).toBeNull();
    expect(
      await buildAdminMintParams({
        userId: noWalletUserId,
        name: "X",
        motto: null,
        domicileCity: null,
      }),
    ).toBeNull();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [verifiedUserId, unverifiedWalletUserId, noWalletUserId] } },
    });
    await prisma.$disconnect();
  });
});
