// @vitest-environment node
//
// LOCAL ANVIL ONLY — the Wave 10 A6 proof that the admin-mint OVERRIDE's
// PREPARED calldata mints a ZERO-witness passport end-to-end. The panel
// PREPARES and NEVER signs (`test/no-admin-signing.test.ts` is the standing
// static proof over the scanned admin dirs) — so THIS TEST does the signing,
// with anvil's THROWAWAY dev key #0 (which holds PASSPORT_ADMIN_ROLE per
// Deploy.s.sol), via a direct viem wallet client against 127.0.0.1:8545.
// The signing code lives ONLY in test/integration/, which the guard
// deliberately does not scan. Never a real key, never a real network.
//
// Proofs:
//   1. `prepareAdminMint` calldata broadcast by the TEST's throwaway
//      PASSPORT_ADMIN key mints a passport with ZERO witnesses:
//      hasPassport(to) flips true, totalCitizens() +1.
//   2. The minted Citizen's nameHash/motto/domicile are BYTE-IDENTICAL to the
//      prepared params (decodeBytes32String round-trips the app's encoding —
//      an admin-minted passport decodes exactly like a witnessed one).
//   3. ZERO WitnessAttested events exist for the minted tokenId (adminMint
//      takes no witnesses; the admin is the sole attestor).
//   4. safeTxBuilderJson is BYTE-FAITHFUL to the exact tx proven on-chain.
//
// (Self-mint is proven at the composer/route level in A4 — the admin minting
// to their OWN verified address is the same `to`-agnostic path proven here.)

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// MUST be set before any app module import (harness/env convention; the
// lib/admin + attestation modules under test are environment-neutral).
process.env.NEXT_PUBLIC_CHAIN_ENV = "local";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
process.env.RPC_ANVIL = "http://127.0.0.1:8545";

import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  parseAbi,
  parseAbiItem,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { startAnvilWithContracts, foundryAvailable, type AnvilDeployment } from "./anvil-harness";
import { prepareAdminMint, safeTxBuilderJson } from "@/lib/admin/prepare";
import { nameHashOf, toBytes32String, decodeBytes32String } from "@/lib/passport/attestation";

const RPC_URL = "http://127.0.0.1:8545";

// A fresh, never-seeded anvil default address (#3) — the throwaway mint
// destination. The proof is `to`-agnostic (adminMint never inspects whose
// address it is), so one destination proves the mechanics for all, self-mint
// included.
const TO = getAddress("0x90F79bf6EB2c4f870365E785982E1f101E93b906");

const passportViewAbi = parseAbi([
  "function totalCitizens() view returns (uint256)",
  "function hasPassport(address who) view returns (bool)",
  "function citizenOf(uint256 tokenId) view returns (bytes32 nameHash, bytes32 motto, bytes32 domicile, bool oathAccepted, uint64 mintBlock)",
]);
const citizenMintedEvent = parseAbiItem(
  "event CitizenMinted(uint256 indexed tokenId, address indexed citizen, bytes32 nameHash, uint64 mintBlock)",
);
const witnessAttestedEvent = parseAbiItem(
  "event WitnessAttested(uint256 indexed tokenId, address indexed witness)",
);

const HAVE_FOUNDRY = foundryAvailable();
const d = HAVE_FOUNDRY ? describe : describe.skip;

let deployment: AnvilDeployment;
let adminWallet: ReturnType<typeof createWalletClient>;

const publicClient = createPublicClient({ chain: foundry, transport: http(RPC_URL) });

d("Wave 10 A6 — prepared adminMint mints a ZERO-witness passport on local anvil", () => {
  beforeAll(async () => {
    deployment = await startAnvilWithContracts([]);
    adminWallet = createWalletClient({
      account: privateKeyToAccount(deployment.admin.privateKey),
      chain: foundry,
      transport: http(RPC_URL),
    });
  }, 120_000);

  afterAll(async () => {
    if (deployment) await deployment.stop();
    // Restore config/contracts.ts (the harness emits anvil addresses into it).
    try {
      const { execFileSync } = await import("node:child_process");
      execFileSync("git", ["checkout", "--", "config/contracts.ts"], {
        cwd: join(dirname(fileURLToPath(import.meta.url)), "..", ".."),
        stdio: "ignore",
      });
    } catch {
      /* best-effort cleanup */
    }
  });

  it("prepared adminMint → ZERO-witness passport; params decode byte-identically; Safe JSON byte-faithful", async () => {
    // The exact app-side encoding an approve-mint would hand the encoder
    // (buildAdminMintParams convention: nameHashOf + trim().slice(0,31)).
    const nameHash = nameHashOf("Ada Test");
    const motto = toBytes32String("code is law");
    const domicile = toBytes32String("Neo Berlin");

    const citizensBefore = await publicClient.readContract({
      address: deployment.passport,
      abi: passportViewAbi,
      functionName: "totalCitizens",
    });
    expect(
      await publicClient.readContract({
        address: deployment.passport,
        abi: passportViewAbi,
        functionName: "hasPassport",
        args: [TO],
      }),
    ).toBe(false);

    // THE PREPARED ARTIFACT — pure encoding, no chain access.
    const batch = prepareAdminMint(31337, deployment.passport, TO, nameHash, motto, domicile);
    expect(batch.kind).toBe("single");
    expect(batch.txs).toHaveLength(1);
    expect(batch.txs[0].to).toBe(deployment.passport);
    expect(batch.txs[0].value).toBe("0");

    // Broadcast — the TEST signs with the throwaway PASSPORT_ADMIN key (#0).
    const hash = await adminWallet.sendTransaction({
      account: adminWallet.account!,
      chain: foundry,
      to: batch.txs[0].to,
      data: batch.txs[0].data,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");

    // Proof 1 — a ZERO-witness passport exists: hasPassport true, census +1.
    expect(
      await publicClient.readContract({
        address: deployment.passport,
        abi: passportViewAbi,
        functionName: "hasPassport",
        args: [TO],
      }),
    ).toBe(true);
    expect(
      await publicClient.readContract({
        address: deployment.passport,
        abi: passportViewAbi,
        functionName: "totalCitizens",
      }),
    ).toBe(citizensBefore + 1n);

    // Proof 2 — the CitizenMinted log + stored Citizen match the params
    // byte-for-byte, and motto/domicile decode back to the app's strings.
    const mintedLogs = await publicClient.getLogs({
      address: deployment.passport,
      event: citizenMintedEvent,
      args: { citizen: TO },
      fromBlock: 0n,
      toBlock: "latest",
    });
    expect(mintedLogs).toHaveLength(1);
    const tokenId = mintedLogs[0].args.tokenId!;
    expect(mintedLogs[0].args.nameHash).toBe(nameHash);

    const [cNameHash, cMotto, cDomicile, cOath] = await publicClient.readContract({
      address: deployment.passport,
      abi: passportViewAbi,
      functionName: "citizenOf",
      args: [tokenId],
    });
    expect(cNameHash).toBe(nameHash);
    expect(cMotto).toBe(motto);
    expect(cDomicile).toBe(domicile);
    expect(cOath).toBe(true); // adminMint records the oath (sol: oath=true)
    expect(decodeBytes32String(cMotto)).toBe("code is law");
    expect(decodeBytes32String(cDomicile)).toBe("Neo Berlin");

    // Proof 3 — ZERO WitnessAttested events for this mint (no witnesses).
    const witnessLogs = await publicClient.getLogs({
      address: deployment.passport,
      event: witnessAttestedEvent,
      args: { tokenId },
      fromBlock: 0n,
      toBlock: "latest",
    });
    expect(witnessLogs).toHaveLength(0);

    // Proof 4 — the Safe Transaction Builder export is byte-faithful to the
    // exact tx just proven on-chain.
    const json = safeTxBuilderJson(batch);
    expect(json.version).toBe("1.0");
    expect(json.chainId).toBe("31337");
    expect(json.transactions).toHaveLength(1);
    expect(json.transactions[0].to).toBe(batch.txs[0].to);
    expect(json.transactions[0].data).toBe(batch.txs[0].data);
    expect(json.transactions[0].value).toBe("0");
  }, 120_000);
});
