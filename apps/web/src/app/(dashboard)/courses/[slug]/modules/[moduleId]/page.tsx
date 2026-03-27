import { auth } from "@/auth";
import { db } from "@agentic-academy/db";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { MarkCompleteButton } from "./mark-complete-button";
import { MobileModulesNav } from "@/components/mobile-modules-nav";
import { RelatedModules } from "./related-modules";
import { StudyAssistantWidget } from "./study-assistant";

export async function generateMetadata({
  params,
}: {
  params: { slug: string; moduleId: string };
}) {
  const mod = await db.module.findUnique({
    where: { id: params.moduleId },
    include: { course: { select: { title: true } } },
  });
  return { title: mod ? `${mod.title} — ${mod.course.title} — AgenticAcademy` : "Module" };
}

export default async function ModuleViewerPage({
  params,
}: {
  params: { slug: string; moduleId: string };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const course = await db.course.findUnique({
    where: { slug: params.slug },
    include: {
      modules: {
        orderBy: { order: "asc" },
        include: { assessment: { select: { id: true } } },
      },
    },
  });
  if (!course) notFound();

  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: session.user.id, courseId: course.id } },
    include: { progress: true },
  });
  if (!enrollment) redirect(`/courses/${params.slug}`);

  const mod = await db.module.findUnique({
    where: { id: params.moduleId },
    include: {
      lessons: { orderBy: { order: "asc" } },
      assessment: { select: { id: true } },
    },
  });
  if (!mod || mod.courseId !== course.id) notFound();

  const progressMap = new Map(enrollment.progress.map((p) => [p.moduleId, p]));
  const currentModuleIndex = course.modules.findIndex((m) => m.id === mod.id);
  const prevModule = currentModuleIndex > 0 ? course.modules[currentModuleIndex - 1] : null;
  const nextModule =
    currentModuleIndex < course.modules.length - 1
      ? course.modules[currentModuleIndex + 1]
      : null;

  const moduleProgress = progressMap.get(mod.id);
  const isComplete = moduleProgress?.status === "completed";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/dashboard" className="flex items-center gap-1.5 hover:text-gray-900">
              <div className="w-6 h-6 rounded bg-brand-600 flex items-center justify-center">
                <span className="text-white font-bold text-xs">AA</span>
              </div>
            </Link>
            <span>/</span>
            <Link href="/courses" className="hover:text-gray-900">Courses</Link>
            <span>/</span>
            <Link href={`/courses/${course.slug}`} className="hover:text-gray-900 max-w-[120px] truncate">
              {course.title}
            </Link>
            <span>/</span>
            <span className="text-gray-900 font-medium max-w-[160px] truncate">{mod.title}</span>
          </div>
          <Link href={`/courses/${course.slug}`} className="text-sm text-gray-500 hover:text-gray-900">
            ← Back to course
          </Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Mobile module navigation */}
        <MobileModulesNav
          modules={course.modules.map((m) => {
            const p = progressMap.get(m.id);
            const status =
              m.id === mod.id
                ? "current"
                : p?.status === "completed"
                ? "completed"
                : p?.status === "failed"
                ? "failed"
                : "default";
            return { id: m.id, title: m.title, order: m.order, status };
          })}
          courseSlug={course.slug}
          currentTitle={mod.title}
        />

        <div className="flex gap-8">
        {/* Sidebar: module list */}
        <aside className="hidden lg:block w-64 shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 p-4 sticky top-20">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Modules
            </h3>
            <nav className="space-y-1">
              {course.modules.map((m) => {
                const p = progressMap.get(m.id);
                const complete = p?.status === "completed";
                const failed = p?.status === "failed";
                const current = m.id === mod.id;
                return (
                  <Link
                    key={m.id}
                    href={`/courses/${course.slug}/modules/${m.id}`}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      current
                        ? "bg-brand-50 text-brand-700 font-medium"
                        : complete
                        ? "text-green-700 hover:bg-green-50"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        complete
                          ? "bg-green-500 text-white"
                          : failed
                          ? "bg-red-100 text-red-600"
                          : current
                          ? "bg-brand-500 text-white"
                          : "bg-gray-200 text-gray-500"
                      }`}
                    >
                      {complete ? "✓" : m.order}
                    </span>
                    <span className="truncate">{m.title}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 mb-6">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <p className="text-sm text-brand-600 font-medium mb-1">
                  Module {mod.order} of {course.modules.length}
                </p>
                <h1 className="text-2xl font-bold text-gray-900">{mod.title}</h1>
                {mod.description && (
                  <p className="text-gray-600 mt-2">{mod.description}</p>
                )}
              </div>
              {isComplete && (
                <span className="shrink-0 bg-green-100 text-green-700 text-sm font-medium px-3 py-1 rounded-full">
                  ✓ Complete
                </span>
              )}
            </div>

            {/* Lessons */}
            <div className="space-y-8">
              {mod.lessons.map((lesson, idx) => (
                <div key={lesson.id}>
                  {idx > 0 && <hr className="border-gray-100 mb-8" />}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      {lesson.type === "lab" ? "Lab" : lesson.type === "quiz" ? "Exercise" : "Lesson"}{" "}
                      {idx + 1}
                    </span>
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">{lesson.title}</h2>
                  <div className="prose prose-gray max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {lesson.content}
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="mt-8 pt-6 border-t border-gray-100 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              {mod.assessment ? (
                <Link
                  href={`/courses/${course.slug}/modules/${mod.id}/assessment`}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 transition-colors"
                >
                  Take Assessment →
                </Link>
              ) : !isComplete ? (
                <MarkCompleteButton
                  enrollmentId={enrollment.id}
                  moduleId={mod.id}
                  courseSlug={course.slug}
                />
              ) : null}

              {isComplete && nextModule && (
                <Link
                  href={`/courses/${course.slug}/modules/${nextModule.id}`}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 transition-colors"
                >
                  Next Module →
                </Link>
              )}
            </div>
          </div>

          {/* Prev/Next navigation */}
          <div className="flex items-center justify-between gap-4">
            {prevModule ? (
              <Link
                href={`/courses/${course.slug}/modules/${prevModule.id}`}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-brand-600 transition-colors"
              >
                ← {prevModule.title}
              </Link>
            ) : (
              <div />
            )}
            {nextModule && (
              <Link
                href={`/courses/${course.slug}/modules/${nextModule.id}`}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-brand-600 transition-colors"
              >
                {nextModule.title} →
              </Link>
            )}
          </div>

          {/* AI sidebar — visible on mobile below content */}
          <div className="lg:hidden space-y-4 mt-6">
            <StudyAssistantWidget courseId={course.id} />
            <RelatedModules moduleId={mod.id} currentCourseSlug={course.slug} />
          </div>
        </main>

        {/* AI right sidebar — desktop */}
        <aside className="hidden lg:block w-72 shrink-0">
          <div className="space-y-4 sticky top-20">
            <StudyAssistantWidget courseId={course.id} />
            <RelatedModules moduleId={mod.id} currentCourseSlug={course.slug} />
          </div>
        </aside>
        </div>
      </div>
    </div>
  );
}
