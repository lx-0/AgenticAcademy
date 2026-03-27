import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import { db } from "@agentic-academy/db";
import { TRPCError } from "@trpc/server";

export const assessmentRouter = createTRPCRouter({
  byModule: protectedProcedure
    .input(z.object({ moduleId: z.string() }))
    .query(async ({ input }) => {
      const assessment = await db.assessment.findUnique({
        where: { moduleId: input.moduleId },
        include: { module: { select: { title: true, courseId: true } } },
      });
      if (!assessment) throw new TRPCError({ code: "NOT_FOUND" });

      // Strip correctIndex from questions before sending to client
      const questions = (assessment.questions as Array<{
        question: string;
        options: string[];
        correctIndex: number;
        explanation: string;
      }>).map(({ correctIndex: _ci, ...q }) => q);

      return { ...assessment, questions };
    }),

  submit: protectedProcedure
    .input(
      z.object({
        moduleId: z.string(),
        enrollmentId: z.string(),
        answers: z.array(z.number().int()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });
      const enrollment = await db.enrollment.findFirst({
        where: { id: input.enrollmentId, userId },
      });
      if (!enrollment) throw new TRPCError({ code: "FORBIDDEN" });

      const assessment = await db.assessment.findUnique({
        where: { moduleId: input.moduleId },
      });
      if (!assessment) throw new TRPCError({ code: "NOT_FOUND" });

      const questions = assessment.questions as Array<{
        question: string;
        options: string[];
        correctIndex: number;
        explanation: string;
      }>;

      const correct = input.answers.filter((ans, i) => ans === questions[i]?.correctIndex).length;
      const score = Math.round((correct / questions.length) * 100);
      const passed = score >= assessment.passingScore;

      await db.moduleProgress.upsert({
        where: { enrollmentId_moduleId: { enrollmentId: input.enrollmentId, moduleId: input.moduleId } },
        create: {
          enrollmentId: input.enrollmentId,
          moduleId: input.moduleId,
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

      // If all modules complete, mark enrollment done + issue certificate
      if (passed) {
        const course = await db.course.findFirst({
          where: { enrollments: { some: { id: input.enrollmentId } } },
          include: { modules: { select: { id: true } } },
        });
        if (course) {
          const completedProgress = await db.moduleProgress.findMany({
            where: { enrollmentId: input.enrollmentId, status: "completed" },
          });
          if (completedProgress.length >= course.modules.length) {
            await db.enrollment.update({
              where: { id: input.enrollmentId },
              data: { status: "completed", completedAt: new Date() },
            });
            await db.certificate.upsert({
              where: { enrollmentId: input.enrollmentId },
              create: { enrollmentId: input.enrollmentId },
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
        // Return correct answers + explanations so learner can review
        review: questions.map((q, i) => ({
          question: q.question,
          options: q.options,
          correctIndex: q.correctIndex,
          selectedIndex: input.answers[i],
          explanation: q.explanation,
        })),
      };
    }),
});
