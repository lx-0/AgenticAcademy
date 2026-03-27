import { auth } from "@/auth";
import { db } from "@agentic-academy/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { EnrollButton } from "./enroll-button";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const course = await db.course.findUnique({ where: { slug: params.slug } });
  return { title: course ? `${course.title} — AgenticAcademy` : "Course Not Found" };
}

export default async function CourseDetailPage({ params }: { params: { slug: string } }) {
  const session = await auth();

  const course = await db.course.findUnique({
    where: { slug: params.slug },
    include: {
      modules: {
        orderBy: { order: "asc" },
        include: {
          lessons: { orderBy: { order: "asc" } },
          assessment: { select: { id: true, passingScore: true } },
        },
      },
      _count: { select: { enrollments: true } },
    },
  });

  if (!course || course.status !== "published") notFound();

  const enrollment = session?.user?.id
    ? await db.enrollment.findUnique({
        where: { userId_courseId: { userId: session.user.id, courseId: course.id } },
        include: { progress: true, certificate: true },
      })
    : null;

  const progressMap = new Map(enrollment?.progress.map((p) => [p.moduleId, p]) ?? []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/dashboard" className="flex items-center gap-2 hover:text-gray-900">
              <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center">
                <span className="text-white font-bold text-xs">AA</span>
              </div>
            </Link>
            <span>/</span>
            <Link href="/courses" className="hover:text-gray-900">Courses</Link>
            <span>/</span>
            <span className="text-gray-900 font-medium">{course.title}</span>
          </div>
          {session?.user && (
            <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">
              Dashboard
            </Link>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 mb-8">
          <div className="flex flex-col md:flex-row gap-8">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-3">{course.title}</h1>
              <p className="text-gray-600 leading-relaxed mb-6">{course.description}</p>
              <div className="flex items-center gap-6 text-sm text-gray-500 mb-6">
                <span>{course.modules.length} modules</span>
                {course.duration && (
                  <span>{Math.round(course.duration / 60)}h total</span>
                )}
                <span>{course._count.enrollments} learners enrolled</span>
              </div>

              {enrollment ? (
                <div className="space-y-3">
                  {enrollment.certificate ? (
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Link
                        href={`/certificates/${enrollment.certificate.id}`}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors"
                      >
                        🎓 View Certificate
                      </Link>
                      <Link
                        href={`/courses/${course.slug}/modules/${course.modules[0]?.id}`}
                        className="inline-flex items-center gap-2 px-5 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Review Course
                      </Link>
                    </div>
                  ) : enrollment.status === "completed" ? (
                    <div className="space-y-3">
                      <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                        <p className="text-sm font-semibold text-green-800 mb-1">
                          🎉 Course complete! One step left.
                        </p>
                        <p className="text-sm text-green-700 mb-3">
                          Take the post-assessment to measure your skill improvement and receive your certificate.
                        </p>
                        <Link
                          href={`/courses/${course.slug}/post-assessment`}
                          className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors text-sm"
                        >
                          Take Post-Assessment → Get Certificate
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <Link
                      href={`/courses/${course.slug}/modules/${
                        course.modules.find((m) => {
                          const p = progressMap.get(m.id);
                          return !p || p.status === "not_started" || p.status === "in_progress" || p.status === "failed";
                        })?.id ?? course.modules[0]?.id
                      }`}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 transition-colors"
                    >
                      Continue Learning →
                    </Link>
                  )}
                </div>
              ) : session?.user ? (
                <EnrollButton courseId={course.id} />
              ) : (
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 transition-colors"
                >
                  Sign in to Enroll
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Curriculum */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Curriculum</h2>
          <div className="space-y-4">
            {course.modules.map((mod) => {
              const progress = progressMap.get(mod.id);
              const isComplete = progress?.status === "completed";
              const isFailed = progress?.status === "failed";
              const canAccess = !!enrollment;

              return (
                <div
                  key={mod.id}
                  className={`rounded-xl border p-5 transition-colors ${
                    isComplete
                      ? "border-green-200 bg-green-50"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${
                          isComplete
                            ? "bg-green-500 text-white"
                            : isFailed
                            ? "bg-red-100 text-red-600"
                            : "bg-gray-200 text-gray-500"
                        }`}
                      >
                        {isComplete ? "✓" : mod.order}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate">{mod.title}</h3>
                        {mod.description && (
                          <p className="text-sm text-gray-500 mt-0.5">{mod.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                          <span>{mod.lessons.length} lessons</span>
                          {mod.duration && <span>{mod.duration} min</span>}
                          {mod.assessment && <span>+ assessment</span>}
                          {isFailed && progress.score !== null && (
                            <span className="text-red-500">Score: {progress.score}%</span>
                          )}
                          {isComplete && progress.score !== null && (
                            <span className="text-green-600">Score: {progress.score}%</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {canAccess && (
                      <Link
                        href={`/courses/${course.slug}/modules/${mod.id}`}
                        className={`shrink-0 text-sm px-4 py-1.5 rounded-lg font-medium transition-colors ${
                          isComplete
                            ? "bg-green-100 text-green-700 hover:bg-green-200"
                            : "bg-brand-600 text-white hover:bg-brand-700"
                        }`}
                      >
                        {isComplete ? "Review" : isFailed ? "Retry" : "Start"}
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
