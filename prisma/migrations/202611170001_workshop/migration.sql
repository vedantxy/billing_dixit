-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "seller" JSONB,
ADD COLUMN     "workshopAnnex" JSONB;

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffSession" (
    "digest" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffSession_pkey" PRIMARY KEY ("digest")
);

-- CreateTable
CREATE TABLE "LoginBucket" (
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL,
    "since" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginBucket_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopWorker" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "machine" TEXT NOT NULL,
    "rate" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "WorkshopWorker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopMark" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "extraHalfDays" INTEGER NOT NULL DEFAULT 0,
    "machine" TEXT NOT NULL DEFAULT '',
    "rate" INTEGER NOT NULL,

    CONSTRAINT "WorkshopMark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopRecord" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "party" TEXT NOT NULL,
    "memo" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "cash" INTEGER NOT NULL DEFAULT 0,
    "bank" INTEGER NOT NULL DEFAULT 0,
    "amount" INTEGER NOT NULL,
    "detail" JSONB NOT NULL,
    "workerId" TEXT,
    "customerId" TEXT,
    "invoiceId" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,

    CONSTRAINT "WorkshopRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "terms" TEXT NOT NULL,

    CONSTRAINT "BusinessProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Staff_email_key" ON "Staff"("email");

-- CreateIndex
CREATE INDEX "StaffSession_expiresAt_idx" ON "StaffSession"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditEvent_at_idx" ON "AuditEvent"("at");

-- CreateIndex
CREATE INDEX "WorkshopMark_day_idx" ON "WorkshopMark"("day");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopMark_workerId_day_key" ON "WorkshopMark"("workerId", "day");

-- CreateIndex
CREATE INDEX "WorkshopRecord_day_kind_idx" ON "WorkshopRecord"("day", "kind");

-- CreateIndex
CREATE INDEX "WorkshopRecord_workerId_day_idx" ON "WorkshopRecord"("workerId", "day");

-- CreateIndex
CREATE INDEX "WorkshopRecord_customerId_idx" ON "WorkshopRecord"("customerId");

-- CreateIndex
CREATE INDEX "WorkshopRecord_invoiceId_idx" ON "WorkshopRecord"("invoiceId");

-- CreateIndex
CREATE INDEX "WorkshopRecord_parentId_idx" ON "WorkshopRecord"("parentId");

-- AddForeignKey
ALTER TABLE "StaffSession" ADD CONSTRAINT "StaffSession_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopMark" ADD CONSTRAINT "WorkshopMark_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "WorkshopWorker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopRecord" ADD CONSTRAINT "WorkshopRecord_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "WorkshopWorker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopRecord" ADD CONSTRAINT "WorkshopRecord_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopRecord" ADD CONSTRAINT "WorkshopRecord_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopRecord" ADD CONSTRAINT "WorkshopRecord_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WorkshopRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reject invalid ledger states even when data is written outside the web application.
ALTER TABLE "Staff" ADD CONSTRAINT "staff_role_check" CHECK ("role" IN ('owner', 'accountant', 'viewer'));
ALTER TABLE "WorkshopWorker" ADD CONSTRAINT "worker_rate_check" CHECK (rate > 0);
ALTER TABLE "WorkshopMark" ADD CONSTRAINT "mark_details_check"
  CHECK (status IN ('P', 'A', 'H', 'E') AND "extraHalfDays" BETWEEN 0 AND 6 AND rate > 0);
ALTER TABLE "WorkshopRecord" ADD CONSTRAINT "record_money_check"
  CHECK (cash >= 0 AND bank >= 0 AND (kind = 'adjustment' OR amount >= 0));
ALTER TABLE "WorkshopRecord" ADD CONSTRAINT "record_kind_check"
  CHECK (kind IN ('sale','expense','material','settlement','cashbook','advance','payout','night','bonus','adjustment'));
ALTER TABLE "WorkshopRecord" ADD CONSTRAINT "record_reference_check" CHECK (
  (kind NOT IN ('advance','payout','night','bonus','adjustment') OR "workerId" IS NOT NULL)
  AND (kind <> 'settlement' OR "parentId" IS NOT NULL)
  AND (kind <> 'sale' OR "customerId" IS NOT NULL));
ALTER TABLE "WorkshopRecord" ADD CONSTRAINT "record_split_check" CHECK (
  (kind NOT IN ('expense','material') OR cash::bigint + bank <= amount)
  AND (kind NOT IN ('settlement','advance','payout','cashbook') OR cash::bigint + bank = amount));
