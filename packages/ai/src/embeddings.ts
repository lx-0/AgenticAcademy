import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

let _openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

/**
 * Generate a single embedding vector for a text string.
 * Returns null if OPENAI_API_KEY is not configured.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const client = getOpenAIClient();
  if (!client) return null;

  const input = text.replace(/\n/g, " ").trim();
  if (!input) return null;

  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input,
    dimensions: EMBEDDING_DIMENSIONS,
  });

  return response.data[0]?.embedding ?? null;
}

/**
 * Generate embeddings for multiple texts in a single API call.
 * Returns nulls for any failures or missing API key.
 */
export async function generateEmbeddings(
  texts: string[]
): Promise<(number[] | null)[]> {
  const client = getOpenAIClient();
  if (!client) return texts.map(() => null);

  const inputs = texts.map((t) => t.replace(/\n/g, " ").trim());

  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: inputs,
    dimensions: EMBEDDING_DIMENSIONS,
  });

  // API returns embeddings in the same order as input
  const map = new Map(response.data.map((d) => [d.index, d.embedding]));
  return inputs.map((_, i) => map.get(i) ?? null);
}

/**
 * Format a course's embeddable text content.
 */
export function courseEmbedText(course: {
  title: string;
  description: string;
}): string {
  return `Course: ${course.title}\n${course.description}`;
}

/**
 * Format a module's embeddable text content.
 */
export function moduleEmbedText(mod: {
  title: string;
  description?: string | null;
  courseTitle?: string;
}): string {
  const parts = [`Module: ${mod.title}`];
  if (mod.courseTitle) parts.push(`Course: ${mod.courseTitle}`);
  if (mod.description) parts.push(mod.description);
  return parts.join("\n");
}

/**
 * Format a lesson's embeddable text content.
 * Content is truncated to ~8000 chars to stay within embedding model limits.
 */
export function lessonEmbedText(lesson: {
  title: string;
  content: string;
  moduleTitle?: string;
}): string {
  const truncated = lesson.content.slice(0, 8000);
  const parts = [`Lesson: ${lesson.title}`];
  if (lesson.moduleTitle) parts.push(`Module: ${lesson.moduleTitle}`);
  parts.push(truncated);
  return parts.join("\n");
}

export const EMBEDDING_ENABLED = !!process.env.OPENAI_API_KEY;
