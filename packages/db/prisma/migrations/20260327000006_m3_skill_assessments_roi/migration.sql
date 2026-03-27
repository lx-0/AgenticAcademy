-- Migration: M3 Skill Assessments + ROI Analytics
-- Adds pre/post skill benchmarking and analytics snapshot tables

-- Enum: assessment phase (pre-enrollment or post-completion)
CREATE TYPE "AssessmentPhase" AS ENUM ('pre', 'post');

-- SkillAssessment — course-level skill benchmark tied to an enrollment
CREATE TABLE "skill_assessments" (
    "id"           TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "courseId"     TEXT NOT NULL,
    "phase"        "AssessmentPhase" NOT NULL,
    "questions"    JSONB NOT NULL DEFAULT '[]',
    "completedAt"  TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_assessments_pkey" PRIMARY KEY ("id")
);

-- One pre and one post per enrollment
CREATE UNIQUE INDEX "skill_assessments_enrollmentId_phase_key"
    ON "skill_assessments"("enrollmentId", "phase");

ALTER TABLE "skill_assessments" ADD CONSTRAINT "skill_assessments_enrollmentId_fkey"
    FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "skill_assessments" ADD CONSTRAINT "skill_assessments_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SkillScore — per-skill score from a SkillAssessment
CREATE TABLE "skill_scores" (
    "id"                TEXT NOT NULL,
    "skillAssessmentId" TEXT NOT NULL,
    "skillName"         TEXT NOT NULL,
    "score"             INTEGER NOT NULL,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_scores_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "skill_scores" ADD CONSTRAINT "skill_scores_skillAssessmentId_fkey"
    FOREIGN KEY ("skillAssessmentId") REFERENCES "skill_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AnalyticsSnapshot — periodic aggregation per course (can be refreshed on demand or via cron)
CREATE TABLE "analytics_snapshots" (
    "id"                  TEXT NOT NULL,
    "courseId"            TEXT NOT NULL,
    "snapshotAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalEnrollments"    INTEGER NOT NULL DEFAULT 0,
    "completedCount"      INTEGER NOT NULL DEFAULT 0,
    "completionRate"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgPreScore"         DOUBLE PRECISION,
    "avgPostScore"        DOUBLE PRECISION,
    "avgImprovementPct"   DOUBLE PRECISION,
    "avgTimeToCompletion" DOUBLE PRECISION,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_snapshots_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
