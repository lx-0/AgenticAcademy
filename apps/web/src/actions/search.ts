"use server";

import { db } from "@agentic-academy/db";
import {
  generateEmbedding,
  EMBEDDING_ENABLED,
} from "@agentic-academy/ai";
import { auth } from "@/auth";
import { complete, MODEL_HAIKU } from "@agentic-academy/ai";

function vectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export interface SearchResult {
  id: string;
  title: string;
  description: string | null;
  slug: string | null;
  course_id: string | null;
  course_title: string | null;
  course_slug: string | null;
  kind: "course" | "module" | "lesson";
  score: number;
}

export interface SearchResponse {
  results: SearchResult[];
  mode: "semantic" | "keyword";
  query: string;
}

export async function searchAction(q: string): Promise<SearchResponse> {
  const query = q.trim();
  if (!query) return { results: [], mode: "keyword", query };

  if (EMBEDDING_ENABLED) {
    const embedding = await generateEmbedding(query);
    if (embedding) {
      const vec = vectorLiteral(embedding);

      interface RawResult {
        id: string;
        title: string;
        description: string | null;
        slug: string | null;
        course_id: string | null;
        course_title: string | null;
        course_slug: string | null;
        kind: string;
        score: number;
      }

      const results = await db.$queryRawUnsafe<RawResult[]>(`
        SELECT id, title, description, slug,
               NULL::text AS course_id, NULL::text AS course_title, NULL::text AS course_slug,
               'course' AS kind,
               1 - (embedding <=> '${vec}'::vector) AS score
        FROM courses
        WHERE status = 'published' AND embedding IS NOT NULL

        UNION ALL

        SELECT m.id, m.title, m.description, NULL::text AS slug,
               m."courseId" AS course_id, c.title AS course_title, c.slug AS course_slug,
               'module' AS kind,
               1 - (m.embedding <=> '${vec}'::vector) AS score
        FROM modules m
        JOIN courses c ON c.id = m."courseId"
        WHERE c.status = 'published' AND m.embedding IS NOT NULL

        UNION ALL

        SELECT l.id, l.title,
               LEFT(l.content, 300) AS description,
               NULL::text AS slug,
               c.id AS course_id, c.title AS course_title, c.slug AS course_slug,
               'lesson' AS kind,
               1 - (l.embedding <=> '${vec}'::vector) AS score
        FROM lessons l
        JOIN modules m ON m.id = l."moduleId"
        JOIN courses c ON c.id = m."courseId"
        WHERE c.status = 'published' AND l.embedding IS NOT NULL

        ORDER BY score DESC
        LIMIT 20
      `);

      return {
        results: results.map((r) => ({
          ...r,
          kind: r.kind as SearchResult["kind"],
          score: Number(r.score),
        })),
        mode: "semantic",
        query,
      };
    }
  }

  // Keyword fallback
  const [courses, modules] = await Promise.all([
    db.course.findMany({
      where: {
        status: "published",
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
        ],
      },
      take: 10,
      select: { id: true, title: true, description: true, slug: true },
    }),
    db.module.findMany({
      where: {
        course: { status: "published" },
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
        ],
      },
      take: 10,
      select: {
        id: true, title: true, description: true,
        courseId: true,
        course: { select: { title: true, slug: true } },
      },
    }),
  ]);

  const results: SearchResult[] = [
    ...courses.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      slug: c.slug,
      course_id: null,
      course_title: null,
      course_slug: null,
      kind: "course" as const,
      score: 1,
    })),
    ...modules.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      slug: null,
      course_id: m.courseId,
      course_title: m.course.title,
      course_slug: m.course.slug,
      kind: "module" as const,
      score: 0.8,
    })),
  ].slice(0, 20);

  return { results, mode: "keyword", query };
}

export interface StudyAssistantResponse {
  answer: string;
  sources: Array<{
    lessonId: string;
    lessonTitle: string;
    moduleTitle: string;
    courseTitle: string;
    score: number;
  }>;
}

export async function studyAssistantAction(
  question: string,
  courseId?: string
): Promise<StudyAssistantResponse | { error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sign in to use the study assistant." };

  if (!EMBEDDING_ENABLED) {
    return { error: "Study assistant requires OPENAI_API_KEY to be configured." };
  }

  const embedding = await generateEmbedding(question.trim());
  if (!embedding) return { error: "Failed to process your question." };

  const vec = vectorLiteral(embedding);
  const courseFilter = courseId ? `AND c.id = '${courseId}'` : "";

  interface RawLesson {
    lesson_id: string;
    lesson_title: string;
    lesson_content: string;
    module_title: string;
    course_title: string;
    score: number;
  }

  const chunks = await db.$queryRawUnsafe<RawLesson[]>(`
    SELECT
      l.id AS lesson_id,
      l.title AS lesson_title,
      l.content AS lesson_content,
      m.title AS module_title,
      c.title AS course_title,
      1 - (l.embedding <=> '${vec}'::vector) AS score
    FROM lessons l
    JOIN modules m ON m.id = l."moduleId"
    JOIN courses c ON c.id = m."courseId"
    WHERE c.status = 'published' AND l.embedding IS NOT NULL
    ${courseFilter}
    ORDER BY score DESC
    LIMIT 5
  `);

  if (chunks.length === 0) {
    return {
      answer: "I couldn't find relevant course content for your question. Try asking about a specific topic covered in the courses.",
      sources: [],
    };
  }

  const context = chunks
    .map(
      (c, i) =>
        `[${i + 1}] ${c.course_title} › ${c.module_title} › ${c.lesson_title}\n${c.lesson_content.slice(0, 1500)}`
    )
    .join("\n\n---\n\n");

  const system = `You are a concise study assistant for AgenticAcademy. Answer the learner's question using ONLY the provided course content. Be direct and practical. If the answer isn't in the content, say so clearly.`;

  const prompt = `Course content:\n\n${context}\n\n---\n\nQuestion: ${question}\n\nAnswer:`;

  const answer = await complete(prompt, { model: MODEL_HAIKU, maxTokens: 512, system });

  return {
    answer,
    sources: chunks.map((c) => ({
      lessonId: c.lesson_id,
      lessonTitle: c.lesson_title,
      moduleTitle: c.module_title,
      courseTitle: c.course_title,
      score: Number(c.score),
    })),
  };
}
