-- AlterTable
ALTER TABLE "CitizenshipApplication" ADD COLUMN "applicantAddress" TEXT;
ALTER TABLE "CitizenshipApplication" ADD COLUMN "citizenTokenId" TEXT;
ALTER TABLE "CitizenshipApplication" ADD COLUMN "sealTxHash" TEXT;
ALTER TABLE "CitizenshipApplication" ADD COLUMN "sealedAt" DATETIME;
ALTER TABLE "CitizenshipApplication" ADD COLUMN "witnessDeadline" TEXT;
ALTER TABLE "CitizenshipApplication" ADD COLUMN "witnessNonce" TEXT;

-- CreateTable
CREATE TABLE "WitnessSignature" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "witnessAddress" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "deadline" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WitnessSignature_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "CitizenshipApplication" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "WitnessSignature_applicationId_idx" ON "WitnessSignature"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "WitnessSignature_applicationId_witnessAddress_key" ON "WitnessSignature"("applicationId", "witnessAddress");
