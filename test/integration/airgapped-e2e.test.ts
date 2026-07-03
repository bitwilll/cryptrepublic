// @vitest-environment node
//
// LOCAL ANVIL ONLY — the Wave-11 watch-only AIR-GAPPED end-to-end proof:
//   the APP (watch-only, NO KEY) builds an unsigned envelope for a WATCHED
//   address -> the envelope round-trips through the QR codec -> the TEST
//   (the offline-signer stand-in, holding a THROWAWAY anvil key) signs the
//   DECODED params -> the APP broadcasts the signed raw tx through its real
//   /api/rpc proxy path -> the recipient's balance moves by exactly `amount`.
//
// Custody invariants asserted over the wire: the app path uses
// eth_sendRawTransaction and NEVER eth_sendTransaction / personal_sign /
// eth_sign / eth_accounts. The app never sees the watched key — only the
// test signs, modeling the air-gapped device.
//
// Also: the A1 import vector — importWallet(anvil default mnemonic) derives
// anvil account #0's address, proving import derivation matches an external
// source.

import "fake-indexeddb/auto";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// MUST be set before any app module is imported so CHAIN_ENV resolves to local.
process.env.NEXT_PUBLIC_CHAIN_ENV = "local";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
process.env.RPC_ANVIL = "http://127.0.0.1:8545";

import { createPublicClient, getAddress, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { startAnvilWithContracts, foundryAvailable, type AnvilDeployment } from "./anvil-harness";

// anvil default key #2 (LOCAL/THROWAWAY dev key) — the WATCHED address whose
// key lives ONLY in this test (the offline-signer stand-in).
const WATCHED_PK = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as Hex;
const watchedAccount = privateKeyToAccount(WATCHED_PK);
// anvil default account #3 — the native-send recipient.
const RECIPIENT = getAddress("0x90F79bf6EB2c4f870365E785982E1f101E93b906");

const ONE_ETH = 10n ** 18n;

// The anvil default mnemonic (PUBLIC dev vector) and its account #0 address.
const ANVIL_MNEMONIC = "test test test test test test test test test test test junk";
const ANVIL_ACCOUNT0 = getAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
const PASS = "fixed-passphrase-123";

const HAVE_FOUNDRY = foundryAvailable();
const d = HAVE_FOUNDRY ? describe : describe.skip;

type AppMods = {
  build: typeof import("@/lib/wallet/airgapped/build");
  broadcast: typeof import("@/lib/wallet/airgapped/broadcast");
  codec: typeof import("@/lib/wallet/airgapped/codec");
  session: typeof import("@/lib/wallet/embedded/session");
  rpcRoute: typeof import("@/app/api/rpc/[chain]/route");
};

let deployment: AnvilDeployment;
let mods: AppMods;
const rpcMethods: string[] = [];

// Direct anvil client for out-of-band assertions (NOT the app path).
const directClient = createPublicClient({
  chain: foundry,
  transport: http("http://127.0.0.1:8545"),
});

d("Wave 11 D1 — watch-only air-gapped end-to-end on local anvil", () => {
  beforeAll(async () => {
    deployment = await startAnvilWithContracts([]);

    // Fresh module graph so config/contracts.ts (just emitted) is re-read.
    vi.resetModules();
    mods = {
      build: await import("@/lib/wallet/airgapped/build"),
      broadcast: await import("@/lib/wallet/airgapped/broadcast"),
      codec: await import("@/lib/wallet/airgapped/codec"),
      session: await import("@/lib/wallet/embedded/session"),
      rpcRoute: await import("@/app/api/rpc/[chain]/route"),
    };

    // Route the app's browser fetch to `/api/rpc/31337` IN-PROCESS to the REAL
    // proxy route handler; capture every JSON-RPC method for the custody
    // assertions. Direct anvil calls fall through and are NOT captured.
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/rpc/31337")) {
        const bodyText = typeof init?.body === "string" ? init.body : "";
        try {
          const parsed = JSON.parse(bodyText);
          for (const r of Array.isArray(parsed) ? parsed : [parsed]) {
            if (r?.method) rpcMethods.push(r.method);
          }
        } catch {
          /* ignore */
        }
        const req = new Request("http://localhost:3000/api/rpc/31337", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: bodyText,
        });
        return mods.rpcRoute.POST(req, { params: Promise.resolve({ chain: "31337" }) });
      }
      return realFetch(input, init);
    });
  }, 120_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    if (deployment) await deployment.stop();
    // Restore config/contracts.ts to its committed (placeholder) state.
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

  it("build (no key) -> QR codec round-trip -> TEST signs -> broadcast (app path) -> balance moves", async () => {
    const watched = getAddress(watchedAccount.address);
    rpcMethods.length = 0;

    // 1. The APP builds the unsigned envelope for the WATCHED address.
    const env = await mods.build.buildUnsignedTx(
      { chainId: 31337, to: RECIPIENT, amount: ONE_ETH },
      watched,
    );
    expect(env.tx.to).toBe(RECIPIENT);
    expect(env.tx.value).toBe(ONE_ETH);

    // 2. QR fidelity: what the signer decodes is byte-for-byte what was built.
    const text = mods.codec.encodeUnsigned(env);
    const decoded = mods.codec.decodeUnsigned(text);
    expect(decoded).toEqual(env);

    // 3. The TEST (offline-signer stand-in) signs the DECODED params. The app
    //    never touches this key.
    const raw = await watchedAccount.signTransaction({
      chainId: decoded.chainId,
      nonce: decoded.tx.nonce,
      to: decoded.tx.to,
      value: decoded.tx.value,
      data: decoded.tx.data,
      gas: decoded.tx.gas,
      maxFeePerGas: decoded.tx.maxFeePerGas,
      maxPriorityFeePerGas: decoded.tx.maxPriorityFeePerGas,
      type: "eip1559",
    });
    const signedText = mods.codec.encodeSigned({ v: 1, t: "cr-eth-tx-signed", raw });

    // 4. The APP broadcasts the scanned signed payload via its real proxy path.
    const balBefore = await directClient.getBalance({ address: RECIPIENT });
    const hash = await mods.broadcast.broadcastSignedRaw(31337, signedText);
    expect(hash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    const receipt = await directClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");

    // 5. The recipient's balance MOVED by exactly the amount (they pay no gas).
    const balAfter = await directClient.getBalance({ address: RECIPIENT });
    expect(balAfter - balBefore).toBe(ONE_ETH);

    // 6. Custody invariants over the wire.
    expect(rpcMethods).toContain("eth_sendRawTransaction");
    expect(rpcMethods).toContain("eth_getTransactionCount");
    expect(rpcMethods).not.toContain("eth_sendTransaction");
    expect(rpcMethods).not.toContain("personal_sign");
    expect(rpcMethods).not.toContain("eth_sign");
    expect(rpcMethods).not.toContain("eth_accounts");
  }, 120_000);

  it("A1 import vector: the anvil default mnemonic derives anvil account #0's address", async () => {
    const { accounts } = await mods.session.importWallet(PASS, ANVIL_MNEMONIC);
    expect(getAddress(accounts.evm)).toBe(ANVIL_ACCOUNT0);
  });
});
