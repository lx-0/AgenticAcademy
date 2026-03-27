import { auth } from "@/auth";
import { db } from "@agentic-academy/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { AnalyticsDashboardClient } from "./analytics-dashboard-client";

export const metadata = { title: "Analytics Dashboard — AgenticAcademy" };

export default async function AnalyticsDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Admin-only page
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, name: true, email: true },
  });
  if (user?.role !== "admin") notFound();

  // Fetch all published courses
  const courses = await db.course.findMany({
    where: { status: "published" },
    select: { id: true, title: true, slug: true },
    orderBy: { title: "asc" },
  });

  // Aggregate data per course
  const courseData = await Promise.all(
    courses.map(async (course) => {
      const totalEnrollments = await db.enrollment.count({ where: { courseId: course.id } });
      const completedEnrollments = await db.enrollment.findMany({
        where: { courseId: course.id, status: "completed" },
        select: { id: true, enrolledAt: true, completedAt: true },
      });

      const completionRate =
        totalEnrollments > 0 ? completedEnrollments.length / totalEnrollments : 0;

      const avgTimeToCompletion =
        completedEnrollments.length > 0
          ? completedEnrollments.reduce((sum, e) => {
              if (!e.completedAt) return sum;
              return (
                sum +
                (e.completedAt.getTime() - e.enrolledAt.getTime()) / (1000 * 60 * 60 * 24)
              );
            }, 0) / completedEnrollments.length
          : null;

      const preAssessments = await db.skillAssessment.findMany({
        where: { courseId: course.id, phase: "pre", completedAt: { not: null } },
        include: { scores: true },
      });
      const postAssessments = await db.skillAssessment.findMany({
        where: { courseId: course.id, phase: "post", completedAt: { not: null } },
        include: { scores: true },
      });

      const calcAvg = (assessments: typeof preAssessments) => {
        if (assessments.length === 0) return null;
        const all = assessments.flatMap((a) => a.scores.map((s) => s.score));
        return all.length > 0 ? Math.round(all.reduce((s, v) => s + v, 0) / all.length) : null;
      };

      const avgPreScore = calcAvg(preAssessments);
      const avgPostScore = calcAvg(postAssessments);

      const skillNames = [
        "Agent Architecture",
        "Observability",
        "Governance",
        "Cost Management",
        "Prompt Engineering",
      ];

      const skillBreakdown = skillNames.map((skillName) => {
        const preScores = preAssessments
          .flatMap((a) => a.scores.filter((s) => s.skillName === skillName))
          .map((s) => s.score);
        const postScores = postAssessments
          .flatMap((a) => a.scores.filter((s) => s.skillName === skillName))
          .map((s) => s.score);

        const avgPre =
          preScores.length > 0
            ? Math.round(preScores.reduce((s, v) => s + v, 0) / preScores.length)
            : null;
        const avgPost =
          postScores.length > 0
            ? Math.round(postScores.reduce((s, v) => s + v, 0) / postScores.length)
            : null;

        return { skillName, avgPre, avgPost };
      });

      // Per-learner data
      const enrollments = await db.enrollment.findMany({
        where: { courseId: course.id },
        include: {
          user: { select: { name: true, email: true } },
          progress: true,
          certificate: { select: { id: true } },
          skillAssessments: { include: { scores: true } },
          course: { include: { modules: { select: { id: true } } } },
        },
        orderBy: { enrolledAt: "desc" },
        take: 50, // cap for performance
      });

      const learners = enrollments.map((e) => {
        const totalModules = e.course.modules.length;
        const completedModules = e.progress.filter((p) => p.status === "completed").length;
        const pre = e.skillAssessments.find((a) => a.phase === "pre");
        const post = e.skillAssessments.find((a) => a.phase === "post");

        const avgScoreOf = (a: typeof pre) => {
          if (!a || a.scores.length === 0) return null;
          const s = a.scores.map((sc) => sc.score);
          return Math.round(s.reduce((acc, v) => acc + v, 0) / s.length);
        };

        const preScore = avgScoreOf(pre);
        const postScore = avgScoreOf(post);

        return {
          enrollmentId: e.id,
          userName: e.user.name ?? e.user.email,
          userEmail: e.user.email,
          enrolledAt: e.enrolledAt.toISOString(),
          completedAt: e.completedAt?.toISOString() ?? null,
          status: e.status,
          modulesCompleted: completedModules,
          totalModules,
          hasCertificate: !!e.certificate,
          preScore,
          postScore,
          improvement: preScore !== null && postScore !== null ? postScore - preScore : null,
        };
      });

      return {
        course,
        totalEnrollments,
        completedCount: completedEnrollments.length,
        completionRate,
        avgTimeToCompletion,
        avgPreScore,
        avgPostScore,
        avgImprovementPct:
          avgPreScore !== null && avgPostScore !== null
            ? avgPostScore - avgPreScore
            : null,
        preAssessmentCount: preAssessments.length,
        postAssessmentCount: postAssessments.length,
        skillBreakdown,
        learners,
      };
    })
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
                <span className="text-white font-bold text-sm">AA</span>
              </div>
              <span className="font-semibold text-gray-900">AgenticAcademy</span>
            </Link>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
              Dashboard
            </Link>
            <span className="text-gray-900 font-medium">Analytics</span>
          </nav>
          <span className="text-sm text-gray-500 bg-purple-100 text-purple-700 px-3 py-1 rounded-full font-medium">
            Admin
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">ROI Analytics Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Pre/post skill improvement, completion rates, and per-learner progress.
          </p>
        </div>

        {courses.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <div className="text-4xl mb-3">📊</div>
            <h2 className="text-lg font-semibold text-gray-900">No published courses yet</h2>
            <p className="text-gray-500 mt-1">Publish a course to see analytics data here.</p>
          </div>
        ) : (
          <AnalyticsDashboardClient courseData={courseData} />
        )}
      </main>
    </div>
  );
}
