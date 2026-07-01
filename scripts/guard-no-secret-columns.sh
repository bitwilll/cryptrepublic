#!/usr/bin/env bash
set -euo pipefail
# Fails if the Prisma schema introduces a column that could hold a secret.
# The server must never store private keys, seed phrases, or plaintext passwords.
if grep -inE '(privateKey|seedPhrase|mnemonic|plaintextPassword|passwordPlain|secretKey)' prisma/schema.prisma; then
  echo "ERROR: prisma schema must never store secrets (private keys / seeds / plaintext passwords)." >&2
  exit 1
fi
echo "guard:secrets OK — no secret columns in schema."
