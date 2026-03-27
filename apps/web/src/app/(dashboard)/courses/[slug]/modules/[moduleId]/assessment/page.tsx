import { auth } from "@/auth";
import { db } from "@agentic-academy/db";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AssessmentQuiz } from "./assessment-quiz";

export const metadata = { title: "Assessment — AgenticAcademy" };

export default async function AssessmentPage({
  params,
}: {
  params: { slug: string; moduleId: string };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const course = await db.course.findUnique({ where: { slug: params.slug } });
  if (!course) notFound();

  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: session.user.id, courseId: course.id } },
  });
  if (!enrollment) redirect(`/courses/${params.slug}`);

  const mod = await db.module.findUnique({
    where: { id: params.moduleId },
    include: { assessment: true },
  });
  if (!mod || mod.courseId !== course.id || !mod.assessment) notFound();

  const assessment = mod.assessment;
  const questions = (assessment.questions as Array<{
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  }>).map(({ correctIndex: _c, ...q }) => q); // strip answers before sending to client

  const existingProgress = await db.moduleProgress.findUnique({
    where: { enrollmentId_moduleId: { enrollmentId: enrollment.id, moduleId: mod.id } },
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/dashboard" className="flex items-center gap-1.5 hover:text-gray-900">
              <div className="w-6 h-6 rounded bg-brand-600 flex items-center justify-center">
                <span className="text-white font-bold text-xs">AA</span>
              </div>
            </Link>
            <span>/</span>
            <Link href={`/courses/${course.slug}`} className="hover:text-gray-900 max-w-[120px] truncate">
              {course.title}
            </Link>
            <span>/</span>
            <Link
              href={`/courses/${course.slug}/modules/${mod.id}`}
              className="hover:text-gray-900 max-w-[120px] truncate"
            >
              {mod.title}
            </Link>
            <span>/</span>
            <span className="text-gray-900 font-medium">Assessment</span>
          </div>
          <Link
            href={`/courses/${course.slug}/modules/${mod.id}`}
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            ← Back to module
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{mod.title} — Assessment</h1>
          <p className="text-gray-600 mt-1">
            Answer all questions. You need {assessment.passingScore}% to pass.
          </p>
          {existingProgress?.status === "completed" && (
            <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
              ✓ You already passed this assessment with {existingProgress.score}%. You may retake it.
            </div>
          )}
          {existingProgress?.status === "failed" && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              Your last score was {existingProgress.score}%. Try again!
            </div>
          )}
        </div>

        <AssessmentQuiz
          questions={questions}
          moduleId={mod.id}
          enrollmentId={enrollment.id}
          passingScore={assessment.passingScore}
          courseSlug={course.slug}
        />
      </main>
    </div>
  );
}
