"use server";

import { auth } from "@/auth";
import { db } from "@agentic-academy/db";

type AssessmentResult = {
  score: number;
  passed: boolean;
  passingScore: number;
  correct: number;
  total: number;
  courseCompleted?: boolean;
  review: Array<{
    question: string;
    options: string[];
    correctIndex: number;
    selectedIndex: number | undefined;
    explanation: string;
  }>;
  error?: string;
};

export async function submitAssessmentAction(
  moduleId: string,
  enrollmentId: string,
  answers: number[]
): Promise<AssessmentResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { score: 0, passed: false, passingScore: 70, correct: 0, total: 0, review: [], error: "Not authenticated" };
  }

  const enrollment = await db.enrollment.findFirst({
    where: { id: enrollmentId, userId: session.user.id },
    include: { course: { include: { modules: { select: { id: true } } } } },
  });
  if (!enrollment) {
    return { score: 0, passed: false, passingScore: 70, correct: 0, total: 0, review: [], error: "Enrollment not found" };
  }

  const assessment = await db.assessment.findUnique({ where: { moduleId } });
  if (!assessment) {
    return { score: 0, passed: false, passingScore: 70, correct: 0, total: 0, review: [], error: "Assessment not found" };
  }

  const questions = assessment.questions as Array<{
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  }>;

  const correct = answers.filter((ans, i) => ans === questions[i]?.correctIndex).length;
  const score = Math.round((correct / questions.length) * 100);
  const passed = score >= assessment.passingScore;

  await db.moduleProgress.upsert({
    where: { enrollmentId_moduleId: { enrollmentId, moduleId } },
    create: {
      enrollmentId,
      moduleId,
      status: passed ? "completed" : "failed",
      score,
      completedAt: passed ? new Date() : undefined,
    },
    update: {
      status: passed ? "completed" : "failed",
      score,
      completedAt: passed ? new Date() : undefined,
    },
  });

  if (passed) {
    const completedCount = await db.moduleProgress.count({
      where: { enrollmentId, status: "completed" },
    });
    if (completedCount >= enrollment.course.modules.length) {
      await db.enrollment.update({
        where: { id: enrollmentId },
        data: { status: "completed", completedAt: new Date() },
      });
      // Only auto-issue certificate if learner has no pre-assessment (legacy flow).
      // If a pre-assessment exists, the post-assessment page will issue the certificate.
      const hasPreAssessment = await db.skillAssessment.findUnique({
        where: { enrollmentId_phase: { enrollmentId, phase: "pre" } },
      });
      if (!hasPreAssessment) {
        const userEmail = (
          await db.user.findUnique({
            where: { id: session.user.id! },
            select: { email: true },
          })
        )?.email ?? undefined;
        await db.certificate.upsert({
          where: { enrollmentId },
          create: { enrollmentId, recipientEmail: userEmail },
          update: {},
        });
      }
    }
  }

  return {
    score,
    passed,
    passingScore: assessment.passingScore,
    correct,
    total: questions.length,
    courseCompleted:
      passed &&
      (await db.moduleProgress.count({ where: { enrollmentId, status: "completed" } })) >=
        enrollment.course.modules.length,
    review: questions.map((q, i) => ({
      question: q.question,
      options: q.options,
      correctIndex: q.correctIndex,
      selectedIndex: answers[i],
      explanation: q.explanation,
    })),
  };
}
