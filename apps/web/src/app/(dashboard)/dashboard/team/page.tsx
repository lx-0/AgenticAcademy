import { auth } from "@/auth";
import { db } from "@agentic-academy/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { TeamDashboardClient } from "./team-dashboard-client";

export const metadata = { title: "Team Dashboard — AgenticAcademy" };

export default async function TeamDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;

  // Find the user's org membership
  const myMembership = await db.orgMembership.findFirst({
    where: { userId },
    include: { org: { select: { id: true, name: true, domain: true } } },
    orderBy: { joinedAt: "asc" },
  });

  // No org — show setup screen
  if (!myMembership) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header userName={session.user.name ?? session.user.email ?? ""} />
        <main className="max-w-3xl mx-auto px-6 py-16 text-center">
          <div className="text-5xl mb-4">🏢</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">No organization yet</h1>
          <p className="text-gray-600 mb-8">
            Create an organization to manage a team, assign learning tracks, and track
            collective progress.
          </p>
          <form
            action={async (formData) => {
              "use server";
              const { createOrgAction } = await import("@/actions/organization");
              const result = await createOrgAction(formData);
              if (!result.error) redirect("/dashboard/team");
            }}
            className="bg-white rounded-xl border border-gray-200 p-8 text-left max-w-md mx-auto"
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Create your organization</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Organization name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  placeholder="Acme Corp"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                />
              </div>
              <div>
                <label htmlFor="domain" className="block text-sm font-medium text-gray-700 mb-1">
                  Domain{" "}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  id="domain"
                  name="domain"
                  type="text"
                  placeholder="company.com"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Members with this email domain can auto-join.
                </p>
              </div>
              <button
                type="submit"
                className="w-full py-2.5 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 transition-colors text-sm"
              >
                Create organization
              </button>
            </div>
          </form>
        </main>
      </div>
    );
  }

  const orgId = myMembership.orgId;
  const isAdmin = ["org_admin", "manager"].includes(myMembership.role);

  // Fetch team data
  const [memberships, tracks, courses, bulkHistory] = await Promise.all([
    db.orgMembership.findMany({
      where: { orgId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            enrollments: {
              select: {
                id: true,
                status: true,
                courseId: true,
                completedAt: true,
                course: { select: { title: true, slug: true } },
                progress: { select: { status: true } },
                certificate: { select: { id: true } },
              },
            },
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    }),
    db.learningTrack.findMany({
      where: { orgId },
      include: { assignments: { select: { userId: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.course.findMany({
      where: { status: "published" },
      select: { id: true, title: true, slug: true },
      orderBy: { title: "asc" },
    }),
    isAdmin
      ? db.bulkEnrollment.findMany({
          where: { orgId },
          orderBy: { createdAt: "desc" },
          take: 5,
        })
      : Promise.resolve([]),
  ]);

  // Aggregate stats
  const totalMembers = memberships.length;
  let totalEnrollments = 0;
  let totalCompleted = 0;
  const courseMap = new Map<string, { title: string; enrolled: number; completed: number }>();

  for (const m of memberships) {
    totalEnrollments += m.user.enrollments.length;
    totalCompleted += m.user.enrollments.filter((e) => e.status === "completed").length;
    for (const e of m.user.enrollments) {
      const existing = courseMap.get(e.courseId);
      if (existing) {
        existing.enrolled++;
        if (e.status === "completed") existing.completed++;
      } else {
        courseMap.set(e.courseId, {
          title: e.course.title,
          enrolled: 1,
          completed: e.status === "completed" ? 1 : 0,
        });
      }
    }
  }

  const completionRate =
    totalEnrollments > 0 ? Math.round((totalCompleted / totalEnrollments) * 100) : 0;

  const memberStats = memberships.map((m) => ({
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
    enrollmentCount: m.user.enrollments.length,
    completedCount: m.user.enrollments.filter((e) => e.status === "completed").length,
    certificates: m.user.enrollments.filter((e) => e.certificate).length,
  }));

  const courseBreakdown = Array.from(courseMap.entries()).map(([courseId, data]) => ({
    courseId,
    ...data,
    completionRate:
      data.enrolled > 0 ? Math.round((data.completed / data.enrolled) * 100) : 0,
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      <Header userName={session.user.name ?? session.user.email ?? ""} />

      <main className="max-w-6xl mx-auto px-6 py-10">
        {/* Org header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{myMembership.org.name}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {myMembership.org.domain ? `@${myMembership.org.domain} · ` : ""}
              <span className="capitalize">{myMembership.role.replace("_", " ")}</span>
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Members", value: totalMembers },
            { label: "Enrollments", value: totalEnrollments },
            { label: "Completions", value: totalCompleted },
            { label: "Completion Rate", value: `${completionRate}%` },
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Members table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">Members</h2>
                <span className="text-sm text-gray-400">{totalMembers} total</span>
              </div>
              <div className="divide-y divide-gray-50">
                {memberStats.map((m) => (
                  <div key={m.userId} className="px-6 py-3 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900 truncate">
                        {m.name ?? m.email}
                      </div>
                      <div className="text-xs text-gray-400 truncate">{m.email}</div>
                    </div>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize shrink-0">
                      {m.role.replace("_", " ")}
                    </span>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-medium text-gray-900">
                        {m.completedCount}/{m.enrollmentCount}
                      </div>
                      <div className="text-xs text-gray-400">courses</div>
                    </div>
                    {m.certificates > 0 && (
                      <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full shrink-0">
                        {m.certificates} cert{m.certificates !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                ))}
                {memberStats.length === 0 && (
                  <div className="px-6 py-8 text-center text-gray-400 text-sm">
                    No members yet. Share an invite link to get started.
                  </div>
                )}
              </div>
            </div>

            {/* Course breakdown */}
            {courseBreakdown.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-900">Course Progress</h2>
                </div>
                <div className="divide-y divide-gray-50">
                  {courseBreakdown.map((c) => (
                    <div key={c.courseId} className="px-6 py-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {c.title}
                        </span>
                        <span className="text-xs text-gray-500 shrink-0 ml-2">
                          {c.enrolled} enrolled · {c.completed} done
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                          <div
                            className="bg-brand-500 h-2 rounded-full transition-all"
                            style={{ width: `${c.completionRate}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-10 text-right">
                          {c.completionRate}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Learning tracks */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">Learning Tracks</h2>
              </div>
              {tracks.length === 0 ? (
                <div className="px-6 py-8 text-center text-gray-400 text-sm">
                  No tracks yet.
                  {isAdmin && " Create a track below to assign a course sequence to your team."}
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {tracks.map((t) => (
                    <div key={t.id} className="px-6 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="font-medium text-sm text-gray-900">{t.name}</div>
                          {t.description && (
                            <p className="text-xs text-gray-400 mt-0.5">{t.description}</p>
                          )}
                          {t.roleTarget && (
                            <span className="inline-block mt-1 text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">
                              {t.roleTarget}
                            </span>
                          )}
                        </div>
                        <div className="text-right shrink-0 text-xs text-gray-500">
                          <div>{t.courseIds.length} course{t.courseIds.length !== 1 ? "s" : ""}</div>
                          <div>{t.assignments.length} assigned</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right column — admin actions */}
          {isAdmin && (
            <div className="space-y-6">
              <TeamDashboardClient
                orgId={orgId}
                members={memberStats}
                courses={courses}
                tracks={tracks.map((t) => ({ id: t.id, name: t.name }))}
                bulkHistory={bulkHistory.map((b) => ({
                  id: b.id,
                  courseId: b.courseId,
                  totalCount: b.totalCount,
                  successCount: b.successCount,
                  failedCount: b.failedCount,
                  status: b.status,
                  createdAt: b.createdAt.toISOString(),
                }))}
                appUrl={process.env.NEXT_PUBLIC_APP_URL ?? ""}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Header({ userName }: { userName: string }) {
  return (
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
          <Link href="/dashboard" className="text-gray-600 hover:text-gray-900 transition-colors">
            Dashboard
          </Link>
          <Link href="/dashboard/team/sso" className="text-gray-600 hover:text-gray-900 transition-colors">
            SSO Settings
          </Link>
          <span className="text-gray-900 font-medium">Team</span>
        </nav>
        <span className="text-sm text-gray-600">{userName}</span>
      </div>
    </header>
  );
}
