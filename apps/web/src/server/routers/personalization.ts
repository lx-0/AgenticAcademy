import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import { db } from "@agentic-academy/db";
import { TRPCError } from "@trpc/server";
import {
  generateLearningPath,
  recommendNextModule,
  type ModuleContext,
} from "@agentic-academy/ai";

const profileInput = z.object({
  role: z.string().min(1).max(100),
  experienceLevel: z.enum(["beginner", "intermediate", "advanced"]),
  learningGoals: z.array(z.string().min(1).max(200)).min(1).max(5),
  preferredPace: z.enum(["slow", "moderate", "fast"]),
});

export const personalizationRouter = createTRPCRouter({
  // ── Profile ──────────────────────────────────────────────────────────────

  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id!;
    return db.learnerProfile.findUnique({ where: { userId } });
  }),

  upsertProfile: protectedProcedure
    .input(profileInput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id!;
      return db.learnerProfile.upsert({
        where: { userId },
        create: { userId, ...input },
        update: input,
      });
    }),

  // ── Learning Path ─────────────────────────────────────────────────────────

  getLearningPath: protectedProcedure
    .input(z.object({ courseId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id!;
      const profile = await db.learnerProfile.findUnique({ where: { userId } });
      if (!profile) return null;

      return db.learningPath.findUnique({
        where: { profileId_courseId: { profileId: profile.id, courseId: input.courseId } },
        include: {
          recommendations: {
            where: { dismissed: false },
            orderBy: { priority: "asc" },
            include: { module: { select: { id: true, title: true, description: true } } },
          },
        },
      });
    }),

  generatePath: protectedProcedure
    .input(z.object({ courseId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id!;
      const profile = await db.learnerProfile.findUnique({ where: { userId } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Complete your learner profile first." });

      const course = await db.course.findUnique({
        where: { id: input.courseId },
        include: {
          modules: {
            orderBy: { order: "asc" },
            include: { assessment: { select: { id: true } } },
          },
        },
      });
      if (!course) throw new TRPCError({ code: "NOT_FOUND", message: "Course not found." });

      // Get existing progress for this user/course
      const enrollment = await db.enrollment.findUnique({
        where: { userId_courseId: { userId, courseId: input.courseId } },
        include: { progress: true },
      });
      const progressMap = new Map(
        enrollment?.progress.map((p) => [p.moduleId, p]) ?? []
      );

      const moduleContexts: ModuleContext[] = course.modules.map((m) => {
        const prog = progressMap.get(m.id);
        return {
          id: m.id,
          title: m.title,
          description: m.description,
          order: m.order,
          hasAssessment: !!m.assessment,
          completionStatus: prog?.status as ModuleContext["completionStatus"],
          score: prog?.score,
        };
      });

      const learnerCtx = {
        role: profile.role,
        experienceLevel: profile.experienceLevel as "beginner" | "intermediate" | "advanced",
        learningGoals: profile.learningGoals,
        preferredPace: profile.preferredPace as "slow" | "moderate" | "fast",
      };

      const { moduleSequence, rationale } = await generateLearningPath(learnerCtx, moduleContexts);

      // Upsert the learning path
      const path = await db.learningPath.upsert({
        where: { profileId_courseId: { profileId: profile.id, courseId: input.courseId } },
        create: {
          profileId: profile.id,
          courseId: input.courseId,
          moduleSequence,
          rationale,
        },
        update: { moduleSequence, rationale, updatedAt: new Date() },
      });

      // Generate next-step recommendation
      const nextRec = await recommendNextModule(learnerCtx, moduleContexts, moduleSequence);

      if (nextRec) {
        // Remove old undismissed recommendations, insert fresh one
        await db.pathRecommendation.deleteMany({ where: { pathId: path.id, dismissed: false } });
        await db.pathRecommendation.create({
          data: {
            pathId: path.id,
            moduleId: nextRec.moduleId,
            reasoning: nextRec.reasoning,
            priority: 0,
          },
        });
      }

      return db.learningPath.findUnique({
        where: { id: path.id },
        include: {
          recommendations: {
            where: { dismissed: false },
            orderBy: { priority: "asc" },
            include: { module: { select: { id: true, title: true, description: true } } },
          },
        },
      });
    }),

  dismissRecommendation: protectedProcedure
    .input(z.object({ recommendationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id!;
      const profile = await db.learnerProfile.findUnique({ where: { userId } });
      if (!profile) throw new TRPCError({ code: "FORBIDDEN" });

      // Verify the recommendation belongs to this user
      const rec = await db.pathRecommendation.findFirst({
        where: {
          id: input.recommendationId,
          path: { profileId: profile.id },
        },
      });
      if (!rec) throw new TRPCError({ code: "NOT_FOUND" });

      return db.pathRecommendation.update({
        where: { id: input.recommendationId },
        data: { dismissed: true },
      });
    }),

  // ── Skill Map ─────────────────────────────────────────────────────────────

  listSkills: protectedProcedure.query(async () => {
    return db.skillMap.findMany({ orderBy: { name: "asc" } });
  }),

  getLearnerSkills: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id!;
    const profile = await db.learnerProfile.findUnique({ where: { userId } });
    if (!profile) return [];
    return db.learnerSkill.findMany({
      where: { profileId: profile.id },
      include: { skill: true },
      orderBy: { skill: { name: "asc" } },
    });
  }),

  upsertLearnerSkill: protectedProcedure
    .input(
      z.object({
        skillId: z.string(),
        mastery: z.enum(["novice", "familiar", "proficient", "expert"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id!;
      const profile = await db.learnerProfile.findUnique({ where: { userId } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Complete your learner profile first." });

      return db.learnerSkill.upsert({
        where: { profileId_skillId: { profileId: profile.id, skillId: input.skillId } },
        create: { profileId: profile.id, skillId: input.skillId, mastery: input.mastery },
        update: { mastery: input.mastery },
      });
    }),
});
