-- CreateTable
CREATE TABLE "FundraisingProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FundraisingProject_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvestmentPledge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountCoin" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLEDGED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InvestmentPledge_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "FundraisingProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvestmentPledge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectEndorsement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectEndorsement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "FundraisingProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectEndorsement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OfficeAppointment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "office" TEXT NOT NULL,
    "portfolio" TEXT,
    "note" TEXT,
    "appointedBy" TEXT NOT NULL,
    "appointedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    "revokedBy" TEXT,
    CONSTRAINT "OfficeAppointment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
