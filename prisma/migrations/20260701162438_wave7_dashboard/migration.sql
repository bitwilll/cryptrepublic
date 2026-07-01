-- CreateTable
CREATE TABLE "GovernanceProposalContent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chainId" INTEGER NOT NULL,
    "proposalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "descriptionHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ProposalComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "proposalContentId" TEXT NOT NULL,
    "authorAddress" TEXT NOT NULL,
    "citizenTokenId" TEXT,
    "body" TEXT NOT NULL,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProposalComment_proposalContentId_fkey" FOREIGN KEY ("proposalContentId") REFERENCES "GovernanceProposalContent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssetCatalogEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ref" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "valueUsd" BIGINT NOT NULL,
    "yieldBps" INTEGER NOT NULL,
    "annualYieldUsd" BIGINT NOT NULL,
    "status" TEXT NOT NULL,
    "acquiredAt" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "EmbassyDirectory" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "neighborhood" TEXT NOT NULL,
    "hours" TEXT NOT NULL,
    "foundedAt" TEXT NOT NULL,
    "brandColor" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "CityCensus" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "long" REAL NOT NULL,
    "hasEmbassy" BOOLEAN NOT NULL DEFAULT false,
    "seededCount" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "TreasuryAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bucket" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "targetBps" INTEGER NOT NULL,
    "color" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ConstitutionText" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "citation" TEXT
);

-- CreateIndex
CREATE INDEX "GovernanceProposalContent_chainId_tag_idx" ON "GovernanceProposalContent"("chainId", "tag");

-- CreateIndex
CREATE UNIQUE INDEX "GovernanceProposalContent_chainId_proposalId_key" ON "GovernanceProposalContent"("chainId", "proposalId");

-- CreateIndex
CREATE INDEX "ProposalComment_proposalContentId_idx" ON "ProposalComment"("proposalContentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetCatalogEntry_ref_key" ON "AssetCatalogEntry"("ref");

-- CreateIndex
CREATE INDEX "AssetCatalogEntry_kind_idx" ON "AssetCatalogEntry"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "TreasuryAllocation_bucket_key" ON "TreasuryAllocation"("bucket");

-- CreateIndex
CREATE UNIQUE INDEX "ConstitutionText_key_key" ON "ConstitutionText"("key");
