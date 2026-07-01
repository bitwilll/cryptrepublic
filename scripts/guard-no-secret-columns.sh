#!/usr/bin/env bash
set -euo pipefail
# --- Schema guard (Wave 1) ---
# Fails if the Prisma schema introduces a column that could hold a secret.
# The server must never store private keys, seed phrases, or plaintext passwords.
if grep -inE '(privateKey|seedPhrase|mnemonic|plaintextPassword|passwordPlain|secretKey)' prisma/schema.prisma; then
  echo "ERROR: prisma schema must never store secrets (private keys / seeds / plaintext passwords)." >&2
  exit 1
fi

# --- App-code secret-SINK guard (Wave 3) ---
# STATIC complement to the authoritative RUNTIME fetch-spy
# (test/no-secret-to-fetch.test.ts). Greps app code for OBVIOUS secret sinks:
# logging a secret, or persisting one to web storage / cookies. This is a
# lint-style smoke check — it does NOT replace the runtime guard.
SINK_DIRS=()
for d in lib app components; do
  [ -d "$d" ] && SINK_DIRS+=("$d")
done

if [ "${#SINK_DIRS[@]}" -gt 0 ]; then
  # Exclude test files so intentional grep-strings in the boundary tests don't trip it.
  if grep -rInE \
      -e 'console\.(log|info|warn|error|debug)\([^)]*(mnemonic|seedPhrase|privateKey)' \
      -e '(localStorage|sessionStorage)\.setItem\([^)]*(seed|mnemonic|privateKey)' \
      -e 'document\.cookie\s*=[^;]*(seed|mnemonic|privateKey)' \
      --include='*.ts' --include='*.tsx' \
      --exclude='*.test.ts' --exclude='*.test.tsx' \
      "${SINK_DIRS[@]}"; then
    echo "ERROR: app code must never log or persist a wallet secret (seed/mnemonic/private key)." >&2
    exit 1
  fi
fi

echo "guard:secrets OK — no secret columns in schema and no obvious secret sinks in app code."
