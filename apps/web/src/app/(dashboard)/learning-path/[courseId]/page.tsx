import { auth } from "@/auth";
import { db } from "@agentic-academy/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { GeneratePathButton } from "./generate-path-button";

export const metadata = { title: "My Learning Path — AgenticAcademy" };

export default async function LearningPathPage({
  params,
}: {
  params: { courseId: string };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;

  const course = await db.course.findUnique({
    where: { id: params.courseId },
    include: {
      modules: {
        orderBy: { order: "asc" },
        include: { assessment: { select: { id: true } } },
      },
    },
  });
  if (!course) notFound();

  const profile = await db.learnerProfile.findUnique({ where: { userId } });

  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: params.courseId } },
    include: { progress: true },
  });

  const progressMap = new Map(enrollment?.progress.map((p) => [p.moduleId, p]) ?? []);

  let learningPath = profile
    ? await db.learningPath.findUnique({
        where: { profileId_courseId: { profileId: profile.id, courseId: params.courseId } },
        include: {
          recommendations: {
            where: { dismissed: false },
            orderBy: { priority: "asc" },
            include: { module: { select: { id: true, title: true } } },
          },
        },
      })
    : null;

  // Build ordered module list: use path sequence if available, else default order
  const moduleById = new Map(course.modules.map((m) => [m.id, m]));
  const orderedModules =
    learningPath && learningPath.moduleSequence.length > 0
      ? learningPath.moduleSequence
          .map((id) => moduleById.get(id))
          .filter(Boolean) as typeof course.modules
      : course.modules;

  const nextRec = learningPath?.recommendations[0] ?? null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
                <span className="text-white font-bold text-sm">AA</span>
              </div>
              <span className="font-semibold text-gray-900">AgenticAcademy</span>
            </Link>
            <span className="text-gray-300">/</span>
            <Link href={`/courses/${course.slug}`} className="text-sm text-gray-600 hover:text-gray-900">
              {course.title}
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-sm text-gray-900">My Learning Path</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {/* Profile missing banner */}
        {!profile && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-4">
            <span className="text-2xl mt-0.5">🎯</span>
            <div>
              <p className="font-medium text-amber-900">Set up your learner profile</p>
              <p className="text-sm text-amber-700 mt-1">
                A personalized path adapts module order to your role, goals, and experience.
              </p>
              <Link
                href="/onboarding"
                className="mt-3 inline-block text-sm font-medium bg-amber-600 text-white px-4 py-1.5 rounded-lg hover:bg-amber-700 transition-colors"
              >
                Complete profile
              </Link>
            </div>
          </div>
        )}

        {/* Next recommendation */}
        {nextRec && (
          <div className="mb-6 bg-brand-50 border border-brand-200 rounded-xl p-5 flex items-start gap-4">
            <span className="text-2xl mt-0.5">💡</span>
            <div className="flex-1">
              <p className="font-medium text-brand-900">Recommended next</p>
              <p className="text-sm text-brand-800 font-semibold mt-0.5">{nextRec.module.title}</p>
              <p className="text-sm text-brand-700 mt-1">{nextRec.reasoning}</p>
            </div>
            {enrollment && (
              <Link
                href={`/courses/${course.slug}`}
                className="shrink-0 text-sm font-medium bg-brand-600 text-white px-4 py-1.5 rounded-lg hover:bg-brand-700 transition-colors"
              >
                Start now
              </Link>
            )}
          </div>
        )}

        {/* Path header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {learningPath ? "Your personalized path" : "Default module order"}
            </h1>
            {learningPath?.rationale && (
              <p className="text-sm text-gray-600 mt-1 max-w-2xl">{learningPath.rationale}</p>
            )}
          </div>
          {profile && (
            <GeneratePathButton courseId={params.courseId} hasPath={!!learningPath} />
          )}
        </div>

        {/* Module sequence */}
        <div className="space-y-3">
          {orderedModules.map((module, idx) => {
            const progress = progressMap.get(module.id);
            const status = progress?.status ?? "not_started";
            const score = progress?.score;
            const isNext = nextRec?.module.id === module.id;

            return (
              <div
                key={module.id}
                className={`bg-white rounded-xl border ${
                  isNext ? "border-brand-400 shadow-sm" : "border-gray-200"
                } p-5 flex items-center gap-4`}
              >
                {/* Step number */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                    status === "completed"
                      ? "bg-green-100 text-green-700"
                      : status === "failed"
                      ? "bg-red-100 text-red-700"
                      : isNext
                      ? "bg-brand-100 text-brand-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {status === "completed" ? "✓" : idx + 1}
                </div>

                {/* Module info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 truncate">{module.title}</span>
                    {isNext && (
                      <span className="shrink-0 text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium">
                        Next up
                      </span>
                    )}
                  </div>
                  {module.description && (
                    <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{module.description}</p>
                  )}
                </div>

                {/* Score / status */}
                <div className="shrink-0 text-right">
                  {score != null ? (
                    <span
                      className={`text-sm font-semibold ${
                        score >= 70 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {score}%
                    </span>
                  ) : (
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        status === "completed"
                          ? "bg-green-100 text-green-700"
                          : status === "in_progress"
                          ? "bg-blue-100 text-blue-700"
                          : status === "failed"
                          ? "bg-red-100 text-red-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {status === "not_started" ? "Not started" : status.replace("_", " ")}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Profile link */}
        {profile && (
          <div className="mt-8 text-center text-sm text-gray-500">
            Path built for <strong>{profile.role}</strong> · {profile.experienceLevel} · {profile.preferredPace} pace ·{" "}
            <Link href="/onboarding" className="text-brand-600 hover:underline">
              Update profile
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
