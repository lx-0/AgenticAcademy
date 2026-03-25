-- Migration: Tier 1 credential submission, triage, and review

-- Enums
CREATE TYPE "UserRole" AS ENUM ('learner', 'reviewer', 'admin');
CREATE TYPE "SubmissionStatus" AS ENUM ('pending_triage', 'pending_review', 'approved', 'revision_requested', 'rejected', 'payment_required');
CREATE TYPE "TriageBucket" AS ENUM ('auto_approve', 'standard_review', 'flag_rejection');
CREATE TYPE "ReviewDecision" AS ENUM ('approved', 'revision_requested', 'rejected');

-- Add role column to users
ALTER TABLE "users" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'learner';

-- Credential submissions
CREATE TABLE "credential_submissions" (
    "id"                  TEXT NOT NULL,
    "userId"              TEXT NOT NULL,
    "parentId"            TEXT,
    "beforeState"         TEXT NOT NULL,
    "whatChanged"         TEXT NOT NULL,
    "outcomeEvidence"     TEXT NOT NULL,
    "governanceStatement" TEXT NOT NULL,
    "submitterRole"       TEXT NOT NULL,
    "industry"            TEXT NOT NULL,
    "modulesCompleted"    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "implementationDate"  TIMESTAMP(3) NOT NULL,
    "hasAttachment"       BOOLEAN NOT NULL DEFAULT false,
    "attachmentUrl"       TEXT,
    "consentToPublish"    BOOLEAN NOT NULL DEFAULT false,
    "wordCount"           INTEGER NOT NULL,
    "attempt"             INTEGER NOT NULL DEFAULT 1,
    "paymentIntentId"     TEXT,
    "status"              "SubmissionStatus" NOT NULL DEFAULT 'pending_triage',
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credential_submissions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "credential_submissions"
    ADD CONSTRAINT "credential_submissions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "credential_submissions"
    ADD CONSTRAINT "credential_submissions_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "credential_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Triage results
CREATE TABLE "triage_results" (
    "id"              TEXT NOT NULL,
    "submissionId"    TEXT NOT NULL,
    "scoreWorkflow"   INTEGER NOT NULL,
    "scoreOutcome"    INTEGER NOT NULL,
    "scoreGovernance" INTEGER NOT NULL,
    "scoreRole"       INTEGER NOT NULL,
    "totalScore"      INTEGER NOT NULL,
    "bucket"          "TriageBucket" NOT NULL,
    "flagReason"      TEXT,
    "humanAgreed"     BOOLEAN,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "triage_results_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "triage_results"
    ADD CONSTRAINT "triage_results_submissionId_key" UNIQUE ("submissionId");

ALTER TABLE "triage_results"
    ADD CONSTRAINT "triage_results_submissionId_fkey"
    FOREIGN KEY ("submissionId") REFERENCES "credential_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Submission reviews
CREATE TABLE "submission_reviews" (
    "id"              TEXT NOT NULL,
    "submissionId"    TEXT NOT NULL,
    "reviewerId"      TEXT NOT NULL,
    "scoreWorkflow"   INTEGER NOT NULL,
    "scoreOutcome"    INTEGER NOT NULL,
    "scoreGovernance" INTEGER NOT NULL,
    "scoreRole"       INTEGER NOT NULL,
    "totalScore"      INTEGER NOT NULL,
    "decision"        "ReviewDecision" NOT NULL,
    "feedbackMessage" TEXT,
    "isSpotCheck"     BOOLEAN NOT NULL DEFAULT false,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_reviews_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "submission_reviews"
    ADD CONSTRAINT "submission_reviews_submissionId_key" UNIQUE ("submissionId");

ALTER TABLE "submission_reviews"
    ADD CONSTRAINT "submission_reviews_submissionId_fkey"
    FOREIGN KEY ("submissionId") REFERENCES "credential_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "submission_reviews"
    ADD CONSTRAINT "submission_reviews_reviewerId_fkey"
    FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON UPDATE CASCADE;
