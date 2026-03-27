-- AlterTable: add Open Badges 2.0 fields to certificates
ALTER TABLE "certificates" ADD COLUMN "credentialId" TEXT;
ALTER TABLE "certificates" ADD COLUMN "recipientEmail" TEXT;

-- Backfill credentialId for existing rows using gen_random_uuid()
UPDATE "certificates" SET "credentialId" = gen_random_uuid()::text WHERE "credentialId" IS NULL;

-- Now set NOT NULL and add unique constraint
ALTER TABLE "certificates" ALTER COLUMN "credentialId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "certificates_credentialId_key" ON "certificates"("credentialId");
