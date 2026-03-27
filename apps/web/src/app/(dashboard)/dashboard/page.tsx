import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@agentic-academy/db";
import Link from "next/link";
import { MobileNav } from "@/components/mobile-nav";

export const metadata = { title: "Dashboard — AgenticAcademy" };

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const currentUser = await db.user.findUnique({
    where: { id: session.user.id! },
    select: { role: true },
  });

  const [enrollments, learnerProfile, publishedCourseCount] = await Promise.all([
    db.enrollment.findMany({
      where: { userId: session.user.id! },
      include: {
        course: {
          include: {
            modules: { orderBy: { order: "asc" }, select: { id: true } },
          },
        },
        progress: true,
        certificate: true,
      },
      orderBy: { enrolledAt: "desc" },
    }),
    db.learnerProfile.findUnique({ where: { userId: session.user.id! } }),
    db.course.count({ where: { status: "published" } }),
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">AA</span>
            </div>
            <span className="font-semibold text-gray-900">AgenticAcademy</span>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm">
            <Link href="/courses" className="text-gray-600 hover:text-gray-900 transition-colors">
              Course Catalog
            </Link>
            <Link href="/search" className="text-gray-600 hover:text-gray-900 transition-colors">
              Search
            </Link>
            {currentUser?.role === "admin" && (
              <Link href="/dashboard/analytics" className="text-gray-600 hover:text-gray-900 transition-colors">
                Analytics
              </Link>
            )}
            <Link href="/billing" className="text-gray-600 hover:text-gray-900 transition-colors">
              Billing
            </Link>
            <span className="text-gray-900 font-medium">Dashboard</span>
          </nav>

          <div className="flex items-center gap-4">
            <span className="hidden md:block text-sm text-gray-600">
              {session.user.name ?? session.user.email}
            </span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
              className="hidden md:block"
            >
              <button
                type="submit"
                className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
              >
                Sign out
              </button>
            </form>
            <MobileNav
              links={[
                { href: "/courses", label: "Course Catalog" },
                ...(currentUser?.role === "admin"
                  ? [{ href: "/dashboard/analytics", label: "Analytics" }]
                  : []),
                { href: "/billing", label: "Billing" },
                { href: "/dashboard", label: "Dashboard", current: true },
              ]}
              userDisplay={session.user.name ?? session.user.email ?? undefined}
              signOutSlot={
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/" });
                  }}
                >
                  <button
                    type="submit"
                    className="text-sm text-gray-500 hover:text-gray-900 transition-colors pb-1"
                  >
                    Sign out
                  </button>
                </form>
              }
            />
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back{session.user.name ? `, ${session.user.name}` : ""}!
          </h1>
          <p className="text-gray-600 mt-1">
            {enrollments.length === 0
              ? "Start your learning journey below."
              : `You have ${enrollments.length} course${enrollments.length > 1 ? "s" : ""} in progress.`}
          </p>
        </div>

        {/* Personalization prompt */}
        {!learnerProfile && (
          <div className="mb-8 bg-gradient-to-r from-brand-50 to-purple-50 border border-brand-200 rounded-xl p-6 flex items-start gap-4">
            <span className="text-3xl">🎯</span>
            <div className="flex-1">
              <h2 className="font-semibold text-gray-900">Personalize your learning path</h2>
              <p className="text-sm text-gray-600 mt-1">
                Tell us your role and goals — Claude will build a custom module sequence that
                adapts to your experience and skips content you already know.
              </p>
              <Link
                href="/onboarding"
                className="mt-3 inline-block text-sm font-medium bg-brand-600 text-white px-5 py-2 rounded-lg hover:bg-brand-700 transition-colors"
              >
                Set up my profile →
              </Link>
            </div>
          </div>
        )}

        {/* Profile summary chip */}
        {learnerProfile && (
          <div className="mb-6 flex items-center gap-3 text-sm text-gray-600">
            <span className="bg-brand-100 text-brand-700 px-3 py-1 rounded-full font-medium">
              {learnerProfile.role}
            </span>
            <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full">
              {learnerProfile.experienceLevel} · {learnerProfile.preferredPace} pace
            </span>
            <Link href="/onboarding" className="text-brand-600 hover:underline text-xs">
              Edit profile
            </Link>
          </div>
        )}

        {enrollments.length > 0 ? (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[
                { label: "Enrolled", value: enrollments.length },
                {
                  label: "Completed",
                  value: enrollments.filter((e) => e.status === "completed").length,
                },
                {
                  label: "Certificates",
                  value: enrollments.filter((e) => e.certificate).length,
                },
                {
                  label: "Modules Done",
                  value: enrollments.reduce(
                    (acc, e) => acc + e.progress.filter((p) => p.status === "completed").length,
                    0
                  ),
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="bg-white rounded-xl border border-gray-200 p-5 text-center shadow-sm"
                >
                  <div className="text-3xl font-bold text-brand-600">{stat.value}</div>
                  <div className="text-sm text-gray-500 mt-1">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Enrolled courses */}
            <h2 className="text-lg font-semibold text-gray-900 mb-4">My Courses</h2>
            <div className="space-y-4 mb-10">
              {enrollments.map((enrollment) => {
                const totalModules = enrollment.course.modules.length;
                const completedModules = enrollment.progress.filter(
                  (p) => p.status === "completed"
                ).length;
                const pct = totalModules > 0 ? Math.round((completedModules / totalModules) * 100) : 0;
                const nextModuleId =
                  enrollment.course.modules.find(
                    (m) => !enrollment.progress.find((p) => p.moduleId === m.id && p.status === "completed")
                  )?.id ?? enrollment.course.modules[0]?.id;

                return (
                  <div
                    key={enrollment.id}
                    className="bg-white rounded-xl border border-gray-200 shadow-sm p-6"
                  >
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Link
                            href={`/courses/${enrollment.course.slug}`}
                            className="font-semibold text-gray-900 hover:text-brand-600 transition-colors"
                          >
                            {enrollment.course.title}
                          </Link>
                          {enrollment.status === "completed" && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                              Completed
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-2 max-w-xs">
                            <div
                              className="bg-brand-500 h-2 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-sm text-gray-500 whitespace-nowrap">
                            {completedModules}/{totalModules} modules
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {enrollment.certificate ? (
                          <Link
                            href={`/certificates/${enrollment.certificate.id}`}
                            className="text-sm px-4 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors font-medium"
                          >
                            🎓 Certificate
                          </Link>
                        ) : null}
                        {learnerProfile && (
                          <Link
                            href={`/learning-path/${enrollment.courseId}`}
                            className="text-sm px-4 py-2 border border-brand-300 text-brand-600 rounded-lg hover:bg-brand-50 transition-colors font-medium"
                          >
                            My Path
                          </Link>
                        )}
                        <Link
                          href={
                            nextModuleId
                              ? `/courses/${enrollment.course.slug}/modules/${nextModuleId}`
                              : `/courses/${enrollment.course.slug}`
                          }
                          className="text-sm px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors font-medium"
                        >
                          {pct === 0 ? "Start" : pct === 100 ? "Review" : "Continue"} →
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center mb-10">
            <div className="text-5xl mb-4">📚</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No courses yet</h2>
            <p className="text-gray-600 mb-6">
              Browse the catalog and enroll in your first course.
            </p>
            <Link
              href="/courses"
              className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 transition-colors"
            >
              Browse {publishedCourseCount > 0 ? `${publishedCourseCount} ` : ""}Course{publishedCourseCount !== 1 ? "s" : ""} →
            </Link>
          </div>
        )}

        {/* Discover more */}
        {publishedCourseCount > enrollments.length && (
          <div className="bg-brand-50 border border-brand-100 rounded-xl p-6 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-brand-900 mb-1">Discover more courses</h2>
              <p className="text-sm text-brand-700">
                {publishedCourseCount - enrollments.length} more course{publishedCourseCount - enrollments.length !== 1 ? "s" : ""} available in the catalog.
              </p>
            </div>
            <Link
              href="/courses"
              className="shrink-0 text-sm px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors font-medium"
            >
              Browse Catalog →
            </Link>
          </div>
        )}

        {enrollments.length === 0 && publishedCourseCount === 0 && (
          <div className="bg-brand-50 border border-brand-100 rounded-xl p-6">
            <h2 className="font-semibold text-brand-900 mb-1">
              You&apos;re in the beta!
            </h2>
            <p className="text-sm text-brand-700">
              The first course track — Agentic Engineering Fundamentals — is on its way.
              You&apos;ll be notified the moment it&apos;s ready. Thank you for joining early.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
