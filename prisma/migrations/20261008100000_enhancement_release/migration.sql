warn The configuration property `package.json#prisma` is deprecated and will be removed in Prisma 7. Please migrate to a Prisma config file (e.g., `prisma.config.ts`).
For more information, see: https://pris.ly/prisma-config

-- AlterTable
ALTER TABLE "TenderStage" ADD COLUMN     "color" TEXT;

-- CreateTable
CREATE TABLE "StatutoryRate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "value" DECIMAL(14,4) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "sourceNote" TEXT,
    "regionId" TEXT,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "StatutoryRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyDocument" (
    "id" TEXT NOT NULL,
    "documentTypeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "referenceNo" TEXT,
    "issueDate" DATE,
    "expiryDate" DATE,
    "fileDocumentId" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CompanyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillReadinessTemplateItem" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "BillReadinessTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillReadinessCheck" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "periodMonth" TEXT NOT NULL,
    "templateItemId" TEXT NOT NULL,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "doneOn" DATE,
    "reference" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "BillReadinessCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GateAttendanceMapping" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "columnMap" JSONB NOT NULL,
    "dateFormat" TEXT NOT NULL DEFAULT 'DD-MM-YYYY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "GateAttendanceMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GateAttendanceUpload" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "periodMonth" TEXT NOT NULL,
    "mappingId" TEXT,
    "fileName" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "exceptionCount" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "GateAttendanceUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GateAttendanceRecord" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "workerRef" TEXT NOT NULL,
    "workerName" TEXT,
    "date" DATE NOT NULL,
    "inTime" TEXT,
    "outTime" TEXT,
    "hours" DECIMAL(5,2),
    "shift" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GateAttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GateAttendanceException" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "workerRef" TEXT NOT NULL,
    "workerName" TEXT,
    "employeeId" TEXT,
    "kind" TEXT NOT NULL,
    "ourHours" DECIMAL(5,2),
    "theirHours" DECIMAL(5,2),
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "GateAttendanceException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderPricing" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "inputs" JSONB NOT NULL,
    "statutoryWageCost" DECIMAL(14,2) NOT NULL,
    "totalCost" DECIMAL(14,2) NOT NULL,
    "minSafeBid" DECIMAL(14,2) NOT NULL,
    "quotedPrice" DECIMAL(14,2),
    "marginAtQuote" DECIMAL(14,2),
    "marginPctAtQuote" DECIMAL(7,4),
    "warnings" JSONB,
    "calculatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "TenderPricing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StatutoryRate_code_effectiveFrom_idx" ON "StatutoryRate"("code", "effectiveFrom");

-- CreateIndex
CREATE INDEX "CompanyDocument_documentTypeId_idx" ON "CompanyDocument"("documentTypeId");

-- CreateIndex
CREATE INDEX "CompanyDocument_expiryDate_idx" ON "CompanyDocument"("expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "BillReadinessTemplateItem_code_key" ON "BillReadinessTemplateItem"("code");

-- CreateIndex
CREATE INDEX "BillReadinessCheck_projectId_periodMonth_idx" ON "BillReadinessCheck"("projectId", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "BillReadinessCheck_projectId_periodMonth_templateItemId_key" ON "BillReadinessCheck"("projectId", "periodMonth", "templateItemId");

-- CreateIndex
CREATE UNIQUE INDEX "GateAttendanceMapping_organisationId_key" ON "GateAttendanceMapping"("organisationId");

-- CreateIndex
CREATE INDEX "GateAttendanceUpload_projectId_periodMonth_idx" ON "GateAttendanceUpload"("projectId", "periodMonth");

-- CreateIndex
CREATE INDEX "GateAttendanceRecord_uploadId_date_idx" ON "GateAttendanceRecord"("uploadId", "date");

-- CreateIndex
CREATE INDEX "GateAttendanceException_projectId_status_idx" ON "GateAttendanceException"("projectId", "status");

-- CreateIndex
CREATE INDEX "GateAttendanceException_uploadId_idx" ON "GateAttendanceException"("uploadId");

-- CreateIndex
CREATE UNIQUE INDEX "TenderPricing_tenderId_key" ON "TenderPricing"("tenderId");

-- AddForeignKey
ALTER TABLE "BillReadinessCheck" ADD CONSTRAINT "BillReadinessCheck_templateItemId_fkey" FOREIGN KEY ("templateItemId") REFERENCES "BillReadinessTemplateItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateAttendanceRecord" ADD CONSTRAINT "GateAttendanceRecord_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "GateAttendanceUpload"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateAttendanceException" ADD CONSTRAINT "GateAttendanceException_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "GateAttendanceUpload"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

