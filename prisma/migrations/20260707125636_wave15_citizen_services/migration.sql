-- CreateTable
CREATE TABLE "StoreListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sellerUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priceCoin" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StoreListing_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StoreInquiry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "buyerUserId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "reply" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StoreInquiry_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "StoreListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StoreInquiry_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SignedCertificate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serial" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "signerAddress" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    CONSTRAINT "SignedCertificate_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BitwillDirective" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerUserId" TEXT NOT NULL,
    "beneficiaryName" TEXT NOT NULL,
    "beneficiaryContact" TEXT NOT NULL,
    "beneficiaryAddress" TEXT,
    "assetsMemo" TEXT NOT NULL,
    "directiveHash" TEXT NOT NULL,
    "signerAddress" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    CONSTRAINT "BitwillDirective_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InsuranceApplication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "coverageNote" TEXT NOT NULL,
    "valueUsd" BIGINT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "reviewNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InsuranceApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommissaryInterest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommissaryInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "StoreListing_status_idx" ON "StoreListing"("status");

-- CreateIndex
CREATE INDEX "StoreListing_sellerUserId_idx" ON "StoreListing"("sellerUserId");

-- CreateIndex
CREATE INDEX "StoreInquiry_listingId_idx" ON "StoreInquiry"("listingId");

-- CreateIndex
CREATE INDEX "StoreInquiry_buyerUserId_idx" ON "StoreInquiry"("buyerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "SignedCertificate_serial_key" ON "SignedCertificate"("serial");

-- CreateIndex
CREATE INDEX "SignedCertificate_authorUserId_idx" ON "SignedCertificate"("authorUserId");

-- CreateIndex
CREATE INDEX "SignedCertificate_signerAddress_idx" ON "SignedCertificate"("signerAddress");

-- CreateIndex
CREATE INDEX "BitwillDirective_ownerUserId_idx" ON "BitwillDirective"("ownerUserId");

-- CreateIndex
CREATE INDEX "InsuranceApplication_userId_idx" ON "InsuranceApplication"("userId");

-- CreateIndex
CREATE INDEX "InsuranceApplication_status_idx" ON "InsuranceApplication"("status");

-- CreateIndex
CREATE INDEX "CommissaryInterest_itemId_idx" ON "CommissaryInterest"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissaryInterest_userId_itemId_key" ON "CommissaryInterest"("userId", "itemId");
