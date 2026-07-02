-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "name" TEXT,
    "kycStatus" TEXT NOT NULL DEFAULT 'NONE',
    "role" TEXT NOT NULL DEFAULT 'USER',
    "suspendedAt" TIMESTAMP(3),
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiweNonce" (
    "id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "address" TEXT,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiweNonce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkedWallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "chain" TEXT NOT NULL DEFAULT 'EVM',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkedWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CitizenshipApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "name" TEXT,
    "domicileCity" TEXT,
    "hostCountry" TEXT,
    "motto" TEXT,
    "oathAcceptedAt" TIMESTAMP(3),
    "kycStatus" TEXT NOT NULL DEFAULT 'NONE',
    "applicantAddress" TEXT,
    "witnessNonce" TEXT,
    "witnessDeadline" TEXT,
    "sealTxHash" TEXT,
    "citizenTokenId" TEXT,
    "sealedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CitizenshipApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WitnessSignature" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "witnessAddress" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "deadline" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WitnessSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovernanceProposalContent" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "proposalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "descriptionHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GovernanceProposalContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalComment" (
    "id" TEXT NOT NULL,
    "proposalContentId" TEXT NOT NULL,
    "authorAddress" TEXT NOT NULL,
    "citizenTokenId" TEXT,
    "body" TEXT NOT NULL,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetCatalogEntry" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "valueUsd" BIGINT NOT NULL,
    "yieldBps" INTEGER NOT NULL,
    "annualYieldUsd" BIGINT NOT NULL,
    "status" TEXT NOT NULL,
    "acquiredAt" TEXT NOT NULL,

    CONSTRAINT "AssetCatalogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmbassyDirectory" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "neighborhood" TEXT NOT NULL,
    "hours" TEXT NOT NULL,
    "foundedAt" TEXT NOT NULL,
    "brandColor" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,

    CONSTRAINT "EmbassyDirectory_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "CityCensus" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "long" DOUBLE PRECISION NOT NULL,
    "hasEmbassy" BOOLEAN NOT NULL DEFAULT false,
    "seededCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CityCensus_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "TreasuryAllocation" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "targetBps" INTEGER NOT NULL,
    "color" TEXT NOT NULL,

    CONSTRAINT "TreasuryAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConstitutionText" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "citation" TEXT,

    CONSTRAINT "ConstitutionText_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorLabel" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SiweNonce_nonce_key" ON "SiweNonce"("nonce");

-- CreateIndex
CREATE INDEX "SiweNonce_expiresAt_idx" ON "SiweNonce"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "LinkedWallet_address_key" ON "LinkedWallet"("address");

-- CreateIndex
CREATE INDEX "LinkedWallet_userId_idx" ON "LinkedWallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CitizenshipApplication_userId_key" ON "CitizenshipApplication"("userId");

-- CreateIndex
CREATE INDEX "CitizenshipApplication_status_idx" ON "CitizenshipApplication"("status");

-- CreateIndex
CREATE INDEX "WitnessSignature_applicationId_idx" ON "WitnessSignature"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "WitnessSignature_applicationId_witnessAddress_key" ON "WitnessSignature"("applicationId", "witnessAddress");

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

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkedWallet" ADD CONSTRAINT "LinkedWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CitizenshipApplication" ADD CONSTRAINT "CitizenshipApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WitnessSignature" ADD CONSTRAINT "WitnessSignature_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "CitizenshipApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalComment" ADD CONSTRAINT "ProposalComment_proposalContentId_fkey" FOREIGN KEY ("proposalContentId") REFERENCES "GovernanceProposalContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

