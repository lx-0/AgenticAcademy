-- Add embedding vector columns to Course, Module, and Lesson
-- pgvector extension installed in public schema

ALTER TABLE "courses"
  ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

ALTER TABLE "modules"
  ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

ALTER TABLE "lessons"
  ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

-- HNSW indexes for fast approximate nearest-neighbor search (cosine distance)
CREATE INDEX IF NOT EXISTS "courses_embedding_hnsw_idx"
  ON "courses" USING hnsw ("embedding" vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "modules_embedding_hnsw_idx"
  ON "modules" USING hnsw ("embedding" vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "lessons_embedding_hnsw_idx"
  ON "lessons" USING hnsw ("embedding" vector_cosine_ops);
