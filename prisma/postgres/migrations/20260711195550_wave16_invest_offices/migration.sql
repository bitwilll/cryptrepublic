-- CreateTable
CREATE TABLE "FundraisingProject" (
    "id" TEXT NOT NULL,
    "creatorUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "goalCoin" TEXT NOT NULL,
    "treasuryAddress" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "reviewNote" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundraisingProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentPledge" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountCoin" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLEDGED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestmentPledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectEndorsement" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectEndorsement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficeAppointment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "office" TEXT NOT NULL,
    "portfolio" TEXT,
    "note" TEXT,
    "appointedBy" TEXT NOT NULL,
    "appointedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,

    CONSTRAINT "OfficeAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FundraisingProject_status_idx" ON "FundraisingProject"("status");

-- CreateIndex
CREATE INDEX "FundraisingProject_creatorUserId_idx" ON "FundraisingProject"("creatorUserId");

-- CreateIndex
CREATE INDEX "InvestmentPledge_userId_idx" ON "InvestmentPledge"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentPledge_projectId_userId_key" ON "InvestmentPledge"("projectId", "userId");

-- CreateIndex
CREATE INDEX "ProjectEndorsement_projectId_idx" ON "ProjectEndorsement"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectEndorsement_projectId_userId_key" ON "ProjectEndorsement"("projectId", "userId");

-- CreateIndex
CREATE INDEX "OfficeAppointment_userId_idx" ON "OfficeAppointment"("userId");

-- CreateIndex
CREATE INDEX "OfficeAppointment_office_idx" ON "OfficeAppointment"("office");

-- AddForeignKey
ALTER TABLE "FundraisingProject" ADD CONSTRAINT "FundraisingProject_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentPledge" ADD CONSTRAINT "InvestmentPledge_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "FundraisingProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentPledge" ADD CONSTRAINT "InvestmentPledge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectEndorsement" ADD CONSTRAINT "ProjectEndorsement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "FundraisingProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectEndorsement" ADD CONSTRAINT "ProjectEndorsement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficeAppointment" ADD CONSTRAINT "OfficeAppointment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

