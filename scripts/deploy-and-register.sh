#!/usr/bin/env bash
#
# Deploy the CryptRepublic contracts to a real chain and register the deployed
# addresses into config/contracts.ts — so the app's on-chain screens (passport
# mint, admin-mint override, governance, dividends) come alive.
#
# NON-CUSTODIAL: this script NEVER handles a private key. It invokes `forge`
# with YOUR keystore/Ledger (--account), which prompts YOU to sign the deploy.
# The assistant cannot run this for you — deploying to a real network is a
# signed, funded, user-only action.
#
# Prereqs (one-time):
#   1. Testnet ETH in your deployer address (Base Sepolia faucet, e.g.
#      https://www.alchemy.com/faucets/base-sepolia — send to the address you
#      will deploy from).
#   2. A forge keystore for that address:  cast wallet import my-deployer --interactive
#      (paste the deployer private key ONCE; forge stores it encrypted locally).
#
# Usage:
#   RPC_URL=https://sepolia.base.org CHAIN_ID=84532 KEYSTORE=my-deployer \
#     bash scripts/deploy-and-register.sh
#
# Optional: set VERIFY=1 and ETHERSCAN_API_KEY=<basescan key> to verify on Basescan.
#
# After it finishes: review `git diff config/contracts.ts`, commit, redeploy the
# site (vercel --prod). The deployer wallet holds PASSPORT_ADMIN_ROLE, so it is
# also the wallet that signs the witness-free adminMint from the admin panel.
set -euo pipefail

: "${RPC_URL:?set RPC_URL (e.g. https://sepolia.base.org)}"
: "${CHAIN_ID:?set CHAIN_ID (84532 = Base Sepolia, 8453 = Base mainnet)}"
: "${KEYSTORE:?set KEYSTORE to your forge account name (created via: cast wallet import <name> --interactive)}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "▶ Deploying CryptRepublic contracts to chain ${CHAIN_ID} via ${RPC_URL}"
echo "  You will be prompted for your keystore password — you sign, not this script."

VERIFY_ARGS=()
if [ "${VERIFY:-0}" = "1" ]; then
  : "${ETHERSCAN_API_KEY:?VERIFY=1 requires ETHERSCAN_API_KEY (Basescan key)}"
  VERIFY_ARGS=(--verify)
fi

(
  cd "${ROOT}/contracts"
  forge script script/Deploy.s.sol:Deploy \
    --rpc-url "${RPC_URL}" \
    --broadcast \
    --account "${KEYSTORE}" \
    "${VERIFY_ARGS[@]}"
)

echo "▶ Registering the deployed addresses into config/contracts.ts (chain ${CHAIN_ID})"
node "${ROOT}/scripts/emit-contract-addresses.mjs" --chain "${CHAIN_ID}"

echo
echo "✓ Done. Next:"
echo "  1. Review:  git diff config/contracts.ts"
echo "  2. Commit + redeploy the site (vercel --prod), OR push and let CI redeploy."
echo "  3. In /admin → the applicant's application → 'Approve & prepare admin mint'"
echo "     now yields a real prepared card + Safe export. Sign the adminMint from"
echo "     the DEPLOYER wallet (it holds PASSPORT_ADMIN_ROLE) to issue the passport."
