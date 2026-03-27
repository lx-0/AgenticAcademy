-- Migration: M3 Personalization Engine — learner profiles, skill maps, adaptive learning paths

-- Enums
CREATE TYPE "ExperienceLevel" AS ENUM ('beginner', 'intermediate', 'advanced');
CREATE TYPE "LearningPace" AS ENUM ('slow', 'moderate', 'fast');
CREATE TYPE "MasteryLevel" AS ENUM ('novice', 'familiar', 'proficient', 'expert');

-- LearnerProfile — one per user, set during onboarding questionnaire
CREATE TABLE "learner_profiles" (
    "id"              TEXT NOT NULL,
    "userId"          TEXT NOT NULL,
    "role"            TEXT NOT NULL,
    "experienceLevel" "ExperienceLevel" NOT NULL DEFAULT 'beginner',
    "learningGoals"   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "preferredPace"   "LearningPace" NOT NULL DEFAULT 'moderate',
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learner_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "learner_profiles_userId_key" ON "learner_profiles"("userId");

ALTER TABLE "learner_profiles" ADD CONSTRAINT "learner_profiles_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SkillMap — competency graph nodes with prerequisite links
CREATE TABLE "skill_maps" (
    "id"            TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "description"   TEXT NOT NULL,
    "prerequisites" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "moduleId"      TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_maps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "skill_maps_name_key" ON "skill_maps"("name");

-- LearnerSkill — mastery level per skill per learner
CREATE TABLE "learner_skills" (
    "id"        TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "skillId"   TEXT NOT NULL,
    "mastery"   "MasteryLevel" NOT NULL DEFAULT 'novice',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learner_skills_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "learner_skills_profileId_skillId_key" ON "learner_skills"("profileId", "skillId");

ALTER TABLE "learner_skills" ADD CONSTRAINT "learner_skills_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "learner_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "learner_skills" ADD CONSTRAINT "learner_skills_skillId_fkey"
    FOREIGN KEY ("skillId") REFERENCES "skill_maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- LearningPath — per-learner per-course module sequence (AI-generated)
CREATE TABLE "learning_paths" (
    "id"             TEXT NOT NULL,
    "profileId"      TEXT NOT NULL,
    "courseId"       TEXT NOT NULL,
    "moduleSequence" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "rationale"      TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_paths_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "learning_paths_profileId_courseId_key" ON "learning_paths"("profileId", "courseId");

ALTER TABLE "learning_paths" ADD CONSTRAINT "learning_paths_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "learner_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "learning_paths" ADD CONSTRAINT "learning_paths_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PathRecommendation — next-step suggestions with AI reasoning
CREATE TABLE "path_recommendations" (
    "id"        TEXT NOT NULL,
    "pathId"    TEXT NOT NULL,
    "moduleId"  TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "priority"  INTEGER NOT NULL DEFAULT 0,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "path_recommendations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "path_recommendations" ADD CONSTRAINT "path_recommendations_pathId_fkey"
    FOREIGN KEY ("pathId") REFERENCES "learning_paths"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "path_recommendations" ADD CONSTRAINT "path_recommendations_moduleId_fkey"
    FOREIGN KEY ("moduleId") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
