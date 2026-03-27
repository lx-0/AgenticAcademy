-- Migration: beta analytics instrumentation
-- Adds FunnelEvent, NpsSurvey, MicroSurveyQuestion, MicroSurveyResponse
-- Extends EmailType enum with nps_survey

-- Funnel stage enum
CREATE TYPE "FunnelStage" AS ENUM (
  'signup',
  'profile_setup',
  'pre_assessment_started',
  'pre_assessment_completed',
  'course_enrolled',
  'module_started',
  'module_completed',
  'course_completed',
  'cert_downloaded'
);

-- NPS survey status enum
CREATE TYPE "NpsSurveyStatus" AS ENUM (
  'pending',
  'sent',
  'responded',
  'skipped'
);

-- Funnel events table
CREATE TABLE "funnel_events" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "stage"      "FunnelStage" NOT NULL,
  "courseId"   TEXT,
  "moduleId"   TEXT,
  "metadata"   JSONB NOT NULL DEFAULT '{}',
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "funnel_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "funnel_events_stage_occurredAt_idx" ON "funnel_events"("stage", "occurredAt");
CREATE INDEX "funnel_events_userId_stage_idx" ON "funnel_events"("userId", "stage");

-- NPS surveys table
CREATE TABLE "nps_surveys" (
  "id"            TEXT NOT NULL,
  "userId"        TEXT NOT NULL,
  "enrollmentId"  TEXT NOT NULL,
  "status"        "NpsSurveyStatus" NOT NULL DEFAULT 'pending',
  "scheduledAt"   TIMESTAMP(3) NOT NULL,
  "sentAt"        TIMESTAMP(3),
  "respondedAt"   TIMESTAMP(3),
  "score"         INTEGER,
  "reasonText"    TEXT,
  "improveText"   TEXT,
  "recommendText" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "nps_surveys_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "nps_surveys_enrollmentId_key" ON "nps_surveys"("enrollmentId");
ALTER TABLE "nps_surveys" ADD CONSTRAINT "nps_surveys_enrollmentId_fkey"
  FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "nps_surveys_status_scheduledAt_idx" ON "nps_surveys"("status", "scheduledAt");
CREATE INDEX "nps_surveys_userId_idx" ON "nps_surveys"("userId");

-- Micro-survey questions table
CREATE TABLE "micro_survey_questions" (
  "id"        TEXT NOT NULL,
  "question"  TEXT NOT NULL,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "micro_survey_questions_pkey" PRIMARY KEY ("id")
);

-- Micro-survey responses table
CREATE TABLE "micro_survey_responses" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "moduleId"   TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "rating"     INTEGER NOT NULL,
  "comment"    TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "micro_survey_responses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "micro_survey_responses_questionId_fkey" FOREIGN KEY ("questionId")
    REFERENCES "micro_survey_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "micro_survey_responses_userId_moduleId_key" ON "micro_survey_responses"("userId", "moduleId");

-- Extend EmailType enum
ALTER TYPE "EmailType" ADD VALUE IF NOT EXISTS 'nps_survey';

-- Seed default micro-survey questions
INSERT INTO "micro_survey_questions" ("id", "question", "isActive", "sortOrder", "createdAt") VALUES
  (gen_random_uuid()::text, 'How would you rate the clarity of this module''s content?', true, 1, NOW()),
  (gen_random_uuid()::text, 'How relevant was this module to your professional goals?', true, 2, NOW()),
  (gen_random_uuid()::text, 'How confident do you feel applying what you learned in this module?', true, 3, NOW()),
  (gen_random_uuid()::text, 'How would you rate the pacing and length of this module?', true, 4, NOW()),
  (gen_random_uuid()::text, 'How engaging did you find this module''s format and examples?', true, 5, NOW());
