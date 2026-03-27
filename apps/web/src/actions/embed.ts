"use server";

import { db } from "@agentic-academy/db";
import {
  generateEmbedding,
  generateEmbeddings,
  courseEmbedText,
  moduleEmbedText,
  lessonEmbedText,
  EMBEDDING_ENABLED,
} from "@agentic-academy/ai";

function vectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/**
 * Generate and store embedding for a single course.
 * Called after course create/update in admin flows.
 */
export async function embedCourse(courseId: string): Promise<void> {
  if (!EMBEDDING_ENABLED) return;

  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { title: true, description: true },
  });
  if (!course) return;

  const embedding = await generateEmbedding(courseEmbedText(course));
  if (!embedding) return;

  await db.$executeRawUnsafe(
    `UPDATE courses SET embedding = '${vectorLiteral(embedding)}'::vector WHERE id = '${courseId}'`
  );
}

/**
 * Generate and store embedding for a single module.
 */
export async function embedModule(moduleId: string): Promise<void> {
  if (!EMBEDDING_ENABLED) return;

  const mod = await db.module.findUnique({
    where: { id: moduleId },
    select: { title: true, description: true, course: { select: { title: true } } },
  });
  if (!mod) return;

  const embedding = await generateEmbedding(
    moduleEmbedText({ title: mod.title, description: mod.description, courseTitle: mod.course.title })
  );
  if (!embedding) return;

  await db.$executeRawUnsafe(
    `UPDATE modules SET embedding = '${vectorLiteral(embedding)}'::vector WHERE id = '${moduleId}'`
  );
}

/**
 * Generate and store embedding for a single lesson.
 */
export async function embedLesson(lessonId: string): Promise<void> {
  if (!EMBEDDING_ENABLED) return;

  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: { title: true, content: true, module: { select: { title: true } } },
  });
  if (!lesson) return;

  const embedding = await generateEmbedding(
    lessonEmbedText({ title: lesson.title, content: lesson.content, moduleTitle: lesson.module.title })
  );
  if (!embedding) return;

  await db.$executeRawUnsafe(
    `UPDATE lessons SET embedding = '${vectorLiteral(embedding)}'::vector WHERE id = '${lessonId}'`
  );
}

/**
 * Admin: reindex all published content at once.
 * Returns counts of indexed items.
 */
export async function reindexAllContent(): Promise<{
  courses: number;
  modules: number;
  lessons: number;
  error?: string;
}> {
  if (!EMBEDDING_ENABLED) {
    return { courses: 0, modules: 0, lessons: 0, error: "OPENAI_API_KEY not configured" };
  }

  // Courses
  const courses = await db.course.findMany({
    where: { status: "published" },
    select: { id: true, title: true, description: true },
  });
  const courseTexts = courses.map(courseEmbedText);
  const courseEmbs = await generateEmbeddings(courseTexts);
  let courseCount = 0;
  for (let i = 0; i < courses.length; i++) {
    const emb = courseEmbs[i];
    if (!emb) continue;
    await db.$executeRawUnsafe(
      `UPDATE courses SET embedding = '${vectorLiteral(emb)}'::vector WHERE id = '${courses[i]!.id}'`
    );
    courseCount++;
  }

  // Modules
  const modules = await db.module.findMany({
    where: { course: { status: "published" } },
    select: { id: true, title: true, description: true, course: { select: { title: true } } },
  });
  const moduleTexts = modules.map((m) =>
    moduleEmbedText({ title: m.title, description: m.description, courseTitle: m.course.title })
  );
  const moduleEmbs = await generateEmbeddings(moduleTexts);
  let moduleCount = 0;
  for (let i = 0; i < modules.length; i++) {
    const emb = moduleEmbs[i];
    if (!emb) continue;
    await db.$executeRawUnsafe(
      `UPDATE modules SET embedding = '${vectorLiteral(emb)}'::vector WHERE id = '${modules[i]!.id}'`
    );
    moduleCount++;
  }

  // Lessons
  const lessons = await db.lesson.findMany({
    where: { module: { course: { status: "published" } } },
    select: { id: true, title: true, content: true, module: { select: { title: true } } },
  });
  const lessonTexts = lessons.map((l) =>
    lessonEmbedText({ title: l.title, content: l.content, moduleTitle: l.module.title })
  );
  const lessonEmbs = await generateEmbeddings(lessonTexts);
  let lessonCount = 0;
  for (let i = 0; i < lessons.length; i++) {
    const emb = lessonEmbs[i];
    if (!emb) continue;
    await db.$executeRawUnsafe(
      `UPDATE lessons SET embedding = '${vectorLiteral(emb)}'::vector WHERE id = '${lessons[i]!.id}'`
    );
    lessonCount++;
  }

  return { courses: courseCount, modules: moduleCount, lessons: lessonCount };
}
