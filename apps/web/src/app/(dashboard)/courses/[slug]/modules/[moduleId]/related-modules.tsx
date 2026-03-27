import { db } from "@agentic-academy/db";
import Link from "next/link";

interface RawRelatedModule {
  id: string;
  title: string;
  description: string | null;
  course_id: string;
  course_title: string;
  course_slug: string;
  score: number;
}

async function getRelatedModules(moduleId: string, limit = 4): Promise<RawRelatedModule[]> {
  try {
    const results = await db.$queryRawUnsafe<RawRelatedModule[]>(`
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
        AND src.embedding IS NOT NULL
      ORDER BY score DESC
      LIMIT ${limit}
    `);
    return results.map((r) => ({ ...r, score: Number(r.score) }));
  } catch {
    return [];
  }
}

export async function RelatedModules({
  moduleId,
  currentCourseSlug,
}: {
  moduleId: string;
  currentCourseSlug: string;
}) {
  const related = await getRelatedModules(moduleId);

  if (related.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Related Modules</h3>
      <div className="space-y-2.5">
        {related.map((mod) => (
          <Link
            key={mod.id}
            href={`/courses/${mod.course_slug}/modules/${mod.id}`}
            className="block group"
          >
            <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors -mx-1">
              <div className="w-1.5 h-1.5 rounded-full bg-brand-400 mt-2 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 group-hover:text-brand-700 transition-colors truncate">
                  {mod.title}
                </p>
                {mod.course_slug !== currentCourseSlug && (
                  <p className="text-xs text-gray-400 truncate">{mod.course_title}</p>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
