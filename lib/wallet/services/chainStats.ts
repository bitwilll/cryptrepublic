import "client-only";
import { publicClientFor } from "./evmClients";
import { evmEntry } from "@/config/chains.config";

/**
 * Honest chain-stats reader. Every field is REAL, derived from the live viem
 * client + the chain registry. The mockup's validators / TPS / finality / "chain
 * 7331" are FABRICATED and NOT modeled here — the type carries a fixed
 * `representativeNote` documenting the omission (rendered verbatim in the UI).
 */

export interface ChainStats {
  chainId: number;
  chainName: string; // evmEntry(chainId).viemChain.name
  blockNumber: bigint; // live getBlockNumber()
  gasMaxFeePerGasWei: bigint; // estimateFeesPerGas().maxFeePerGas — real
  explorerBase: string; // evmEntry(chainId).explorer
  /** Values the mockup fabricated (validators/TPS/finality) are NOT modeled here. */
  representativeNote: "Validators, TPS, and finality are not measurable on this network and are omitted.";
}

export async function readChainStats(chainId: number): Promise<ChainStats> {
  const client = publicClientFor(chainId);
  const entry = evmEntry(chainId);
  const [blockNumber, fees] = await Promise.all([
    client.getBlockNumber(),
    client.estimateFeesPerGas(),
  ]);
  return {
    chainId,
    chainName: entry.viemChain.name,
    blockNumber,
    gasMaxFeePerGasWei: fees.maxFeePerGas,
    explorerBase: entry.explorer,
    representativeNote:
      "Validators, TPS, and finality are not measurable on this network and are omitted.",
  };
}
