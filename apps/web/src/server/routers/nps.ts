import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "@/server/trpc";
import { db } from "@agentic-academy/db";
import { TRPCError } from "@trpc/server";

export const npsRouter = createTRPCRouter({
  // Get pending NPS survey for the current user (in-app notification)
  getPending: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user?.id;
    if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

    const survey = await db.npsSurvey.findFirst({
      where: {
        userId,
        status: { in: ["pending", "sent"] },
      },
      include: {
        enrollment: { include: { course: { select: { title: true } } } },
      },
      orderBy: { scheduledAt: "desc" },
    });

    if (!survey) return null;

    return {
      id: survey.id,
      courseTitle: survey.enrollment.course.title,
    };
  }),

  // Get a specific NPS survey by ID (for email link flow)
  getById: publicProcedure
    .input(z.object({ surveyId: z.string() }))
    .query(async ({ input }) => {
      const survey = await db.npsSurvey.findUnique({
        where: { id: input.surveyId },
        include: { enrollment: { include: { course: { select: { title: true } } } } },
      });
      if (!survey) throw new TRPCError({ code: "NOT_FOUND" });
      if (survey.status === "responded") {
        return { alreadyResponded: true, courseTitle: survey.enrollment.course.title };
      }
      return {
        alreadyResponded: false,
        courseTitle: survey.enrollment.course.title,
      };
    }),

  // Submit NPS response
  submit: publicProcedure
    .input(
      z.object({
        surveyId: z.string(),
        score: z.number().int().min(0).max(10),
        reasonText: z.string().max(1000).optional(),
        improveText: z.string().max(1000).optional(),
        recommendText: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const survey = await db.npsSurvey.findUnique({ where: { id: input.surveyId } });
      if (!survey) throw new TRPCError({ code: "NOT_FOUND" });
      if (survey.status === "responded") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Already responded" });
      }

      await db.npsSurvey.update({
        where: { id: input.surveyId },
        data: {
          status: "responded",
          respondedAt: new Date(),
          score: input.score,
          reasonText: input.reasonText ?? null,
          improveText: input.improveText ?? null,
          recommendText: input.recommendText ?? null,
        },
      });

      return { success: true };
    }),

  // Admin: get NPS stats
  adminGetStats: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).default(30) }))
    .query(async ({ ctx }) => {
      const userId = ctx.session.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

      const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
      if (user?.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });

      const total = await db.npsSurvey.count();
      const responded = await db.npsSurvey.count({ where: { status: "responded" } });
      const sent = await db.npsSurvey.count({ where: { status: { in: ["sent", "responded"] } } });

      const responses = await db.npsSurvey.findMany({
        where: { status: "responded", score: { not: null } },
        select: { score: true, respondedAt: true },
        orderBy: { respondedAt: "desc" },
      });

      const scores = responses.map((r) => r.score as number);
      const promoters = scores.filter((s) => s >= 9).length;
      const detractors = scores.filter((s) => s <= 6).length;
      const npsScore =
        scores.length > 0
          ? Math.round(((promoters - detractors) / scores.length) * 100)
          : null;

      const avgScore =
        scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : null;

      const responseRate = sent > 0 ? Math.round((responded / sent) * 100) : 0;

      return {
        total,
        sent,
        responded,
        responseRate,
        npsScore,
        avgScore,
        promoters,
        detractors,
        passives: scores.length - promoters - detractors,
        recentScores: responses.slice(0, 20).map((r) => ({
          score: r.score as number,
          date: r.respondedAt?.toISOString() ?? null,
        })),
      };
    }),
});
