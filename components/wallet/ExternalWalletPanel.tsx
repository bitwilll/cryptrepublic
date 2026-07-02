"use client";
import { useEffect, useMemo, useState } from "react";
import { getAddress, parseUnits, type Address } from "viem";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useWalletClient,
} from "wagmi";
import { activeChain } from "@/lib/config/chain";
import { evmEntry } from "@/config/chains.config";
import { loadPortfolio, type Portfolio } from "@/lib/wallet/services/portfolio";
import { publicClientFor } from "@/lib/wallet/services/evmClients";
import { previewEvmSend, sendEvmExternal, type EvmSendRequest } from "@/lib/wallet/services/send";
import {
  sendableTokens,
  toSendConfirmVM,
  type SendConfirmVM,
} from "@/lib/wallet/services/sendView";
import { TokenList } from "./TokenList";

const NATIVE = "native" as const;

/**
 * HARDWARE / EXTERNAL wallet panel (Wave 11 B2). The connected wallet's OWN
 * signer signs and broadcasts (sendEvmExternal) — this app never sees the key.
 * Honest states throughout: no connector detected, connection cancelled,
 * wrong network (send blocked until switched), pending → hash → receipt (a
 * revert or rejection is an error, never a false success).
 */
export function ExternalWalletPanel() {
  const expectedChainId = activeChain().primaryChainId;
  const chainName = evmEntry(expectedChainId).viemChain.name;
  const nativeMeta = evmEntry(expectedChainId).viemChain.nativeCurrency;

  const { address, isConnected, connector } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const { disconnect } = useDisconnect();
  const connectedChainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { data: walletClient } = useWalletClient();

  const [connectError, setConnectError] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);

  const wrongChain = isConnected && connectedChainId !== expectedChainId;
  const checksummed = useMemo(() => {
    try {
      return address ? getAddress(address) : null;
    } catch {
      return address ?? null;
    }
  }, [address]);

  // Balances reuse the existing portfolio reads (our proxy, expected chain).
  useEffect(() => {
    if (!checksummed) {
      setPortfolio(null);
      return;
    }
    let alive = true;
    loadPortfolio(expectedChainId, checksummed as Address)
      .then((p) => alive && setPortfolio(p))
      .catch(() => alive && setPortfolio({ assets: [], totalUsd: 0 }));
    return () => {
      alive = false;
    };
  }, [checksummed, expectedChainId]);

  async function onConnect(connectorToUse: (typeof connectors)[number]) {
    setConnectError(null);
    try {
      await connectAsync({ connector: connectorToUse });
    } catch {
      setConnectError("Connection cancelled — no wallet was connected.");
    }
  }

  if (!isConnected || !checksummed) {
    return (
      <section style={{ marginTop: 8 }}>
        <p style={{ color: "var(--muted)", maxWidth: 560 }}>
          Connect a wallet you already have. Its keys stay on your device — CryptRepublic never sees
          them.
        </p>
        {connectors.length === 0 ? (
          <p data-testid="no-connectors" style={{ marginTop: 16, color: "var(--muted)" }}>
            No wallet connector detected — install a browser wallet or use WalletConnect.
          </p>
        ) : (
          <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
            {connectors.map((c) => (
              <button
                key={c.uid}
                className="btn btn-primary"
                type="button"
                data-testid={`connect-${c.id}`}
                onClick={() => onConnect(c)}
              >
                Connect {c.name}
              </button>
            ))}
          </div>
        )}
        {connectError && (
          <p role="alert" data-testid="connect-error" style={{ color: "#b00020", marginTop: 12 }}>
            {connectError}
          </p>
        )}
      </section>
    );
  }

  return (
    <section style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          Connected via {connector?.name ?? "external wallet"}
        </div>
        <div
          data-testid="external-address"
          style={{
            fontFamily: "var(--mono, monospace)",
            fontSize: 13,
            marginTop: 6,
            overflowWrap: "anywhere",
          }}
        >
          {checksummed}
        </div>
        <button
          className="btn"
          type="button"
          onClick={() => disconnect()}
          style={{ marginTop: 10 }}
        >
          Disconnect
        </button>
      </div>

      {wrongChain && (
        <div
          role="alert"
          data-testid="wrong-chain"
          style={{
            padding: "12px 16px",
            border: "1px solid #b00020",
            color: "#b00020",
            fontSize: 13,
          }}
        >
          Wrong network — switch to {chainName} to send.
          <button
            className="btn"
            type="button"
            data-testid="switch-chain"
            disabled={switching}
            onClick={() => switchChain({ chainId: expectedChainId })}
            style={{ marginLeft: 12 }}
          >
            {switching ? "Switching…" : `Switch to ${chainName}`}
          </button>
        </div>
      )}

      <TokenList assets={portfolio?.assets ?? []} />

      <ExternalSendForm
        chainId={expectedChainId}
        from={checksummed as Address}
        nativeSymbol={nativeMeta.symbol}
        nativeDecimals={nativeMeta.decimals}
        blocked={wrongChain}
        walletClient={walletClient ?? null}
      />
    </section>
  );
}

/** External SEND — mirrors SendModal's form→confirm UX; signs via the wallet. */
function ExternalSendForm({
  chainId,
  from,
  nativeSymbol,
  nativeDecimals,
  blocked,
  walletClient,
}: {
  chainId: number;
  from: Address;
  nativeSymbol: string;
  nativeDecimals: number;
  blocked: boolean;
  walletClient: Parameters<typeof sendEvmExternal>[0] | null;
}) {
  const tokens = useMemo(() => sendableTokens(chainId), [chainId]);
  const [selected, setSelected] = useState<string>(NATIVE);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [vm, setVm] = useState<SendConfirmVM | null>(null);
  const [req, setReq] = useState<EvmSendRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [receiptState, setReceiptState] = useState<"pending" | "confirmed" | null>(null);

  const recipientValid = (() => {
    try {
      getAddress(to);
      return true;
    } catch {
      return false;
    }
  })();

  async function review() {
    setError(null);
    let amountWei: bigint;
    let token: Address | undefined;
    let decimals = nativeDecimals;
    if (selected !== NATIVE) {
      const t = tokens.find((x) => x.address?.toLowerCase() === selected.toLowerCase());
      if (!t?.address) {
        setError("Unknown token selection.");
        return;
      }
      token = t.address;
      decimals = t.decimals;
    }
    try {
      amountWei = parseUnits(amount, decimals);
      if (amountWei <= 0n) throw new Error("zero");
    } catch {
      setError("Enter a valid amount.");
      return;
    }
    setBusy(true);
    try {
      const request: EvmSendRequest = {
        chainId,
        to: getAddress(to) as Address,
        amount: amountWei,
        token,
      };
      setVm(toSendConfirmVM(await previewEvmSend(request, from)));
      setReq(request);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build the send preview.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!req) return;
    if (!walletClient) {
      setError("The connected wallet is not ready to sign.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const hash = await sendEvmExternal(walletClient, req);
      setTxHash(hash);
      setReceiptState("pending");
      const receipt = await publicClientFor(chainId).waitForTransactionReceipt({
        hash: hash as `0x${string}`,
      });
      setReceiptState(receipt.status === "success" ? "confirmed" : null);
      if (receipt.status !== "success") setError("Transaction reverted.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The wallet rejected the transaction.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="pillar" style={{ padding: "18px 22px" }}>
      <h3 style={{ margin: 0, fontSize: 16 }}>Send (external wallet signs)</h3>
      {txHash ? (
        <div style={{ marginTop: 12 }}>
          <p data-testid="ext-send-tx" style={{ fontSize: 13 }}>
            Submitted:{" "}
            <span style={{ fontFamily: "var(--mono, monospace)", overflowWrap: "anywhere" }}>
              {txHash}
            </span>
          </p>
          <p data-testid="ext-send-status" style={{ fontSize: 13, color: "var(--muted)" }}>
            {receiptState === "confirmed"
              ? "Confirmed."
              : receiptState === "pending"
                ? "Waiting for confirmation…"
                : "Not confirmed."}
          </p>
          {error && (
            <p role="alert" style={{ color: "#b00020", marginTop: 8 }}>
              {error}
            </p>
          )}
        </div>
      ) : vm ? (
        <div data-testid="ext-send-confirm" style={{ marginTop: 12, fontSize: 14 }}>
          <p style={{ margin: 0 }}>
            To <span style={{ fontFamily: "var(--mono, monospace)" }}>{vm.to}</span>
          </p>
          <p style={{ margin: "6px 0 0" }}>
            Amount {vm.amountDisplay} {vm.tokenSymbol} · est. fee {vm.feeDisplay} {vm.feeSymbol}
          </p>
          {error && (
            <p role="alert" style={{ color: "#b00020", marginTop: 8 }}>
              {error}
            </p>
          )}
          <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
            <button
              className="btn btn-primary"
              type="button"
              data-testid="ext-confirm-sign"
              disabled={busy}
              onClick={confirm}
            >
              {busy ? "Waiting for wallet…" : "Confirm in wallet"}
            </button>
            <button className="btn" type="button" disabled={busy} onClick={() => setVm(null)}>
              Back
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", fontSize: 12, marginBottom: 6 }}>
            Token
            <select
              data-testid="ext-token-picker"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              style={{
                width: "100%",
                marginTop: 6,
                padding: 10,
                border: "1px solid var(--line)",
                borderRadius: 8,
              }}
            >
              <option value={NATIVE}>{nativeSymbol} (native)</option>
              {tokens.map((t) => (
                <option key={t.address} value={t.address}>
                  {t.symbol}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "block", fontSize: 12, marginTop: 12, marginBottom: 6 }}>
            Recipient
            <input
              data-testid="ext-recipient"
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="0x…"
              style={{
                width: "100%",
                marginTop: 6,
                padding: 10,
                border: "1px solid var(--line)",
                borderRadius: 8,
              }}
            />
          </label>
          {to.length > 0 && !recipientValid && (
            <p role="alert" style={{ color: "#b00020", fontSize: 12, marginTop: 4 }}>
              Invalid recipient address.
            </p>
          )}
          <label style={{ display: "block", fontSize: 12, marginTop: 12, marginBottom: 6 }}>
            Amount
            <input
              data-testid="ext-amount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{
                width: "100%",
                marginTop: 6,
                padding: 10,
                border: "1px solid var(--line)",
                borderRadius: 8,
              }}
            />
          </label>
          {blocked && (
            <p style={{ fontSize: 12, color: "#b00020", marginTop: 8 }}>
              Sending is blocked until the wallet is on the right network.
            </p>
          )}
          {error && (
            <p role="alert" style={{ color: "#b00020", marginTop: 8 }}>
              {error}
            </p>
          )}
          <div style={{ marginTop: 14 }}>
            <button
              className="btn btn-primary"
              type="button"
              data-testid="ext-review"
              disabled={!recipientValid || busy || blocked}
              onClick={review}
            >
              {busy ? "Reviewing…" : "Review"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
