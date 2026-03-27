import { auth } from "@/auth";
import { db } from "@agentic-academy/db";
import Link from "next/link";

export const metadata = { title: "Course Catalog — AgenticAcademy" };

export default async function CoursesPage() {
  const session = await auth();

  const courses = await db.course.findMany({
    where: { status: "published" },
    include: {
      modules: { orderBy: { order: "asc" }, select: { id: true } },
      _count: { select: { enrollments: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const enrollments = session?.user?.id
    ? await db.enrollment.findMany({
        where: { userId: session.user.id },
        select: { courseId: true, status: true },
      })
    : [];

  const enrolledMap = new Map(enrollments.map((e) => [e.courseId, e.status]));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
                <span className="text-white font-bold text-sm">AA</span>
              </div>
              <span className="font-semibold text-gray-900">AgenticAcademy</span>
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-600 text-sm">Courses</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/search" className="text-sm text-gray-600 hover:text-gray-900">
              Search
            </Link>
            {session?.user && (
              <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">
                Dashboard
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Course Catalog</h1>
          <p className="text-gray-600 mt-2">
            Adaptive learning paths built for the agentic economy.
          </p>
        </div>

        {courses.length === 0 ? (
          <div className="text-center py-24 text-gray-500">
            <p className="text-lg font-medium">No courses available yet.</p>
            <p className="text-sm mt-1">Check back soon — courses are on their way.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course) => {
              const enrollStatus = enrolledMap.get(course.id);
              return (
                <Link
                  key={course.id}
                  href={`/courses/${course.slug}`}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-brand-300 transition-all overflow-hidden group"
                >
                  {course.imageUrl && (
                    <div className="h-40 bg-gray-100 overflow-hidden">
                      <img
                        src={course.imageUrl}
                        alt={course.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  )}
                  {!course.imageUrl && (
                    <div className="h-40 bg-gradient-to-br from-brand-50 to-brand-100 flex items-center justify-center">
                      <span className="text-4xl">📚</span>
                    </div>
                  )}
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-semibold text-gray-900 leading-snug group-hover:text-brand-600 transition-colors">
                        {course.title}
                      </h3>
                      {enrollStatus && (
                        <span
                          className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                            enrollStatus === "completed"
                              ? "bg-green-100 text-green-700"
                              : "bg-brand-100 text-brand-700"
                          }`}
                        >
                          {enrollStatus === "completed" ? "Completed" : "Enrolled"}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-2 mb-4">
                      {course.description}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>{course.modules.length} modules</span>
                      {course.duration && <span>{Math.round(course.duration / 60)}h</span>}
                      <span>{course._count.enrollments} enrolled</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
