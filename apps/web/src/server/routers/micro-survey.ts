import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import { db } from "@agentic-academy/db";
import { TRPCError } from "@trpc/server";

export const microSurveyRouter = createTRPCRouter({
  // Get the rotating question for a specific module.
  // Rotation logic: hash(userId + moduleId) % activeQuestionCount → deterministic per-user-module.
  // If the user already responded, returns null.
  getQuestion: protectedProcedure
    .input(z.object({ moduleId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

      // Already responded for this module?
      const existing = await db.microSurveyResponse.findUnique({
        where: { userId_moduleId: { userId, moduleId: input.moduleId } },
      });
      if (existing) return null;

      const questions = await db.microSurveyQuestion.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      });
      if (questions.length === 0) return null;

      // Deterministic rotation: simple hash of userId + moduleId
      const hash = Array.from(userId + input.moduleId).reduce(
        (acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0,
        0
      );
      const idx = Math.abs(hash) % questions.length;
      const question = questions[idx];

      return { questionId: question.id, question: question.question };
    }),

  // Submit a micro-survey response (one per user per module)
  submit: protectedProcedure
    .input(
      z.object({
        moduleId: z.string(),
        questionId: z.string(),
        rating: z.number().int().min(1).max(5),
        comment: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

      // Idempotent — ignore duplicates
      await db.microSurveyResponse.upsert({
        where: { userId_moduleId: { userId, moduleId: input.moduleId } },
        create: {
          userId,
          moduleId: input.moduleId,
          questionId: input.questionId,
          rating: input.rating,
          comment: input.comment ?? null,
        },
        update: {},
      });

      return { success: true };
    }),

  // Admin: aggregate micro-survey stats per question
  adminGetStats: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user?.id;
    if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

    const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (user?.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });

    const questions = await db.microSurveyQuestion.findMany({
      include: { responses: { select: { rating: true } } },
      orderBy: { sortOrder: "asc" },
    });

    return questions.map((q) => {
      const ratings = q.responses.map((r) => r.rating);
      const avg =
        ratings.length > 0
          ? Math.round((ratings.reduce((s, v) => s + v, 0) / ratings.length) * 10) / 10
          : null;
      return { question: q.question, responseCount: ratings.length, avgRating: avg };
    });
  }),
});
