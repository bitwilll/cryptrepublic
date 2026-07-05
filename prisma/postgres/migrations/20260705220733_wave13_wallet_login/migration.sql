-- Wave 13: cross-device wallet-QR LOGIN challenge (public relay row — never a key/seed).
-- Hand-authored postgres mirror of the sqlite migration (same timestamp dir).
-- Purely additive (a brand-new table, no FK, no backfill) — safe under
-- `prisma migrate deploy` at build time; currently-live code is unaffected.

-- CreateTable
CREATE TABLE "WalletLoginChallenge" (
    "id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "matchCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "WalletLoginChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WalletLoginChallenge_nonce_key" ON "WalletLoginChallenge"("nonce");

-- CreateIndex
CREATE INDEX "WalletLoginChallenge_expiresAt_idx" ON "WalletLoginChallenge"("expiresAt");
