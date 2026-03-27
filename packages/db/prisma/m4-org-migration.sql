-- M4: Team & Organization Management
-- Safe migration: only adds new tables and enums, does not touch existing tables.

DO $$ BEGIN
  CREATE TYPE "OrgRole" AS ENUM ('org_admin', 'manager', 'learner');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "BulkEnrollStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "organizations" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "domain"    TEXT,
  "settings"  JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "organizations_domain_key" ON "organizations"("domain");

CREATE TABLE IF NOT EXISTS "org_memberships" (
  "id"       TEXT NOT NULL,
  "orgId"    TEXT NOT NULL,
  "userId"   TEXT NOT NULL,
  "role"     "OrgRole" NOT NULL DEFAULT 'learner',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "org_memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "org_memberships_orgId_userId_key" UNIQUE ("orgId", "userId"),
  CONSTRAINT "org_memberships_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "org_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "org_invites" (
  "id"        TEXT NOT NULL,
  "orgId"     TEXT NOT NULL,
  "token"     TEXT NOT NULL,
  "email"     TEXT,
  "role"      "OrgRole" NOT NULL DEFAULT 'learner',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "org_invites_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "org_invites_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "org_invites_token_key" ON "org_invites"("token");

CREATE TABLE IF NOT EXISTS "learning_tracks" (
  "id"          TEXT NOT NULL,
  "orgId"       TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "courseIds"   TEXT[] NOT NULL DEFAULT '{}',
  "roleTarget"  TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "learning_tracks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "learning_tracks_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "track_assignments" (
  "id"         TEXT NOT NULL,
  "trackId"    TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "track_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "track_assignments_trackId_userId_key" UNIQUE ("trackId", "userId"),
  CONSTRAINT "track_assignments_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "learning_tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "track_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "bulk_enrollments" (
  "id"           TEXT NOT NULL,
  "orgId"        TEXT NOT NULL,
  "courseId"     TEXT NOT NULL,
  "requestedBy"  TEXT NOT NULL,
  "totalCount"   INTEGER NOT NULL,
  "successCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount"  INTEGER NOT NULL DEFAULT 0,
  "status"       "BulkEnrollStatus" NOT NULL DEFAULT 'pending',
  "results"      JSONB NOT NULL DEFAULT '[]',
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"  TIMESTAMP(3),

  CONSTRAINT "bulk_enrollments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bulk_enrollments_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
