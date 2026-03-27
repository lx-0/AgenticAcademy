import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "@/server/trpc";
import { db } from "@agentic-academy/db";
import {
  generateEmbedding,
  generateEmbeddings,
  courseEmbedText,
  moduleEmbedText,
  lessonEmbedText,
  complete,
  MODEL_HAIKU,
  EMBEDDING_ENABLED,
} from "@agentic-academy/ai";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawSearchResult {
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function vectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const searchRouter = createTRPCRouter({
  /**
   * Semantic search across all published courses, modules, and lessons.
   * Falls back to keyword search when embeddings are not configured.
   */
  query: publicProcedure
    .input(
      z.object({
        q: z.string().min(1).max(500),
        limit: z.number().int().min(1).max(50).default(20),
      })
    )
    .query(async ({ input }) => {
      const { q, limit } = input;

      if (EMBEDDING_ENABLED) {
        const embedding = await generateEmbedding(q);
        if (!embedding) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Embedding failed" });

        const vec = vectorLiteral(embedding);

        const results = await db.$queryRawUnsafe<RawSearchResult[]>(`
          SELECT
            id,
            title,
            description,
            slug,
            NULL::text AS course_id,
            NULL::text AS course_title,
            NULL::text AS course_slug,
            'course'   AS kind,
            1 - (embedding <=> '${vec}'::vector) AS score
          FROM courses
          WHERE status = 'published'
            AND embedding IS NOT NULL

          UNION ALL

          SELECT
            m.id,
            m.title,
            m.description,
            NULL::text AS slug,
            m."courseId"    AS course_id,
            c.title         AS course_title,
            c.slug          AS course_slug,
            'module'        AS kind,
            1 - (m.embedding <=> '${vec}'::vector) AS score
          FROM modules m
          JOIN courses c ON c.id = m."courseId"
          WHERE c.status = 'published'
            AND m.embedding IS NOT NULL

          UNION ALL

          SELECT
            l.id,
            l.title,
            l.content       AS description,
            NULL::text      AS slug,
            c.id            AS course_id,
            c.title         AS course_title,
            c.slug          AS course_slug,
            'lesson'        AS kind,
            1 - (l.embedding <=> '${vec}'::vector) AS score
          FROM lessons l
          JOIN modules m ON m.id = l."moduleId"
          JOIN courses c ON c.id = m."courseId"
          WHERE c.status = 'published'
            AND l.embedding IS NOT NULL

          ORDER BY score DESC
          LIMIT ${limit}
        `);

        return {
          results: results.map((r) => ({
            ...r,
            score: Number(r.score),
            description: r.kind === "lesson"
              ? (r.description ?? "").slice(0, 300)
              : r.description,
          })),
          mode: "semantic" as const,
        };
      }

      // ── Keyword fallback ──────────────────────────────────────────────────
      const term = `%${q.toLowerCase()}%`;

      const [courses, modules] = await Promise.all([
        db.course.findMany({
          where: {
            status: "published",
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          },
          take: limit,
          select: { id: true, title: true, description: true, slug: true },
        }),
        db.module.findMany({
          where: {
            course: { status: "published" },
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          },
          take: limit,
          select: {
            id: true,
            title: true,
            description: true,
            courseId: true,
            course: { select: { title: true, slug: true } },
          },
        }),
      ]);

      const results = [
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
      ].slice(0, limit);

      return { results, mode: "keyword" as const };
    }),

  /**
   * Related modules for a given module (cross-course recommendations).
   * Returns up to 5 modules similar to the given one by vector cosine distance.
   */
  recommendations: publicProcedure
    .input(z.object({ moduleId: z.string(), limit: z.number().int().min(1).max(10).default(5) }))
    .query(async ({ input }) => {
      const { moduleId, limit } = input;

      if (!EMBEDDING_ENABLED) return { modules: [], enabled: false };

      interface RawModule {
        id: string;
        title: string;
        description: string | null;
        course_id: string;
        course_title: string;
        course_slug: string;
        score: number;
      }

      const results = await db.$queryRawUnsafe<RawModule[]>(`
        SELECT
          m.id,
          m.title,
          m.description,
          m."courseId"  AS course_id,
          c.title       AS course_title,
          c.slug        AS course_slug,
          1 - (m.embedding <=> src.embedding) AS score
        FROM modules m
        JOIN courses c ON c.id = m."courseId"
        JOIN (
          SELECT embedding FROM modules WHERE id = '${moduleId}'
        ) src ON true
        WHERE m.id <> '${moduleId}'
          AND c.status = 'published'
          AND m.embedding IS NOT NULL
        ORDER BY score DESC
        LIMIT ${limit}
      `);

      return {
        modules: results.map((r) => ({ ...r, score: Number(r.score) })),
        enabled: true,
      };
    }),

  /**
   * AI study assistant: RAG over course content.
   * Retrieves the most relevant lessons via pgvector, then synthesizes with Claude Haiku.
   */
  studyAssistant: protectedProcedure
    .input(
      z.object({
        question: z.string().min(1).max(1000),
        courseId: z.string().optional(), // optional scope to a single course
      })
    )
    .mutation(async ({ input }) => {
      const { question, courseId } = input;

      if (!EMBEDDING_ENABLED) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Study assistant requires OPENAI_API_KEY to be configured.",
        });
      }

      const embedding = await generateEmbedding(question);
      if (!embedding) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Embedding failed" });

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
          l.id          AS lesson_id,
          l.title       AS lesson_title,
          l.content     AS lesson_content,
          m.title       AS module_title,
          c.title       AS course_title,
          1 - (l.embedding <=> '${vec}'::vector) AS score
        FROM lessons l
        JOIN modules m ON m.id = l."moduleId"
        JOIN courses c ON c.id = m."courseId"
        WHERE c.status = 'published'
          AND l.embedding IS NOT NULL
          ${courseFilter}
        ORDER BY score DESC
        LIMIT 5
      `);

      if (chunks.length === 0) {
        return {
          answer: "I couldn't find relevant course content to answer your question. Try asking something related to the course topics.",
          sources: [],
        };
      }

      const context = chunks
        .map(
          (c, i) =>
            `[${i + 1}] ${c.course_title} › ${c.module_title} › ${c.lesson_title}\n${c.lesson_content.slice(0, 1500)}`
        )
        .join("\n\n---\n\n");

      const system = `You are a concise study assistant for AgenticAcademy. Answer the learner's question using ONLY the provided course content excerpts. If the answer isn't in the content, say so clearly. Be direct and practical.`;

      const prompt = `Course content:\n\n${context}\n\n---\n\nLearner question: ${question}\n\nAnswer:`;

      const answer = await complete(prompt, {
        model: MODEL_HAIKU,
        maxTokens: 512,
        system,
      });

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
    }),

  /**
   * Admin: regenerate embeddings for all published content.
   * Only callable by admins.
   */
  reindexAll: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await db.user.findUnique({ where: { id: ctx.session.user.id! } });
    if (user?.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
    }
    if (!EMBEDDING_ENABLED) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "OPENAI_API_KEY not configured" });
    }

    // Courses
    const courses = await db.course.findMany({
      where: { status: "published" },
      select: { id: true, title: true, description: true },
    });

    const courseTexts = courses.map((c) => courseEmbedText(c));
    const courseEmbeddings = await generateEmbeddings(courseTexts);

    for (let i = 0; i < courses.length; i++) {
      const emb = courseEmbeddings[i];
      if (!emb) continue;
      await db.$executeRawUnsafe(
        `UPDATE courses SET embedding = '${vectorLiteral(emb)}'::vector WHERE id = '${courses[i]!.id}'`
      );
    }

    // Modules
    const modules = await db.module.findMany({
      where: { course: { status: "published" } },
      select: { id: true, title: true, description: true, course: { select: { title: true } } },
    });

    const moduleTexts = modules.map((m) =>
      moduleEmbedText({ title: m.title, description: m.description, courseTitle: m.course.title })
    );
    const moduleEmbeddings = await generateEmbeddings(moduleTexts);

    for (let i = 0; i < modules.length; i++) {
      const emb = moduleEmbeddings[i];
      if (!emb) continue;
      await db.$executeRawUnsafe(
        `UPDATE modules SET embedding = '${vectorLiteral(emb)}'::vector WHERE id = '${modules[i]!.id}'`
      );
    }

    // Lessons
    const lessons = await db.lesson.findMany({
      where: { module: { course: { status: "published" } } },
      select: { id: true, title: true, content: true, module: { select: { title: true } } },
    });

    const lessonTexts = lessons.map((l) =>
      lessonEmbedText({ title: l.title, content: l.content, moduleTitle: l.module.title })
    );
    const lessonEmbeddings = await generateEmbeddings(lessonTexts);

    for (let i = 0; i < lessons.length; i++) {
      const emb = lessonEmbeddings[i];
      if (!emb) continue;
      await db.$executeRawUnsafe(
        `UPDATE lessons SET embedding = '${vectorLiteral(emb)}'::vector WHERE id = '${lessons[i]!.id}'`
      );
    }

    return {
      courses: courses.length,
      modules: modules.length,
      lessons: lessons.length,
    };
  }),
});
