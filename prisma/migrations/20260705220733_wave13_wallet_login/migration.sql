-- CreateTable
CREATE TABLE "WalletLoginChallenge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nonce" TEXT NOT NULL,
    "matchCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "WalletLoginChallenge_nonce_key" ON "WalletLoginChallenge"("nonce");

-- CreateIndex
CREATE INDEX "WalletLoginChallenge_expiresAt_idx" ON "WalletLoginChallenge"("expiresAt");
