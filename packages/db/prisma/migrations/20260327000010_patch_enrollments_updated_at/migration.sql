-- Patch: enrollments.updatedAt was missing from the initial migration (20260325000002_m2_course_platform).
-- The column was manually applied on 2026-03-27 to unblock dogfooding (AGE-51).
-- This migration makes it official and ensures fresh environments get the column.
-- Using IF NOT EXISTS so it is safe to run against a DB that already has the column.

ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
