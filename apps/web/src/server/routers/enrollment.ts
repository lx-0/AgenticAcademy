import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import { db } from "@agentic-academy/db";
import { TRPCError } from "@trpc/server";

export const enrollmentRouter = createTRPCRouter({
  enroll: protectedProcedure
    .input(z.object({ courseId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

      const course = await db.course.findUnique({ where: { id: input.courseId } });
      if (!course || course.status !== "published") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      }

      const existing = await db.enrollment.findUnique({
        where: { userId_courseId: { userId, courseId: input.courseId } },
      });
      if (existing) return existing;

      return db.enrollment.create({
        data: { userId, courseId: input.courseId },
      });
    }),

  myEnrollments: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user?.id;
    if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });
    return db.enrollment.findMany({
      where: { userId },
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
    });
  }),

  updateProgress: protectedProcedure
    .input(
      z.object({
        enrollmentId: z.string(),
        moduleId: z.string(),
        status: z.enum(["not_started", "in_progress", "completed", "failed"]),
        score: z.number().int().min(0).max(100).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });
      // Verify enrollment belongs to this user
      const enrollment = await db.enrollment.findFirst({
        where: { id: input.enrollmentId, userId },
      });
      if (!enrollment) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const progress = await db.moduleProgress.upsert({
        where: { enrollmentId_moduleId: { enrollmentId: input.enrollmentId, moduleId: input.moduleId } },
        create: {
          enrollmentId: input.enrollmentId,
          moduleId: input.moduleId,
          status: input.status,
          score: input.score,
          completedAt: input.status === "completed" ? new Date() : undefined,
        },
        update: {
          status: input.status,
          score: input.score !== undefined ? input.score : undefined,
          completedAt: input.status === "completed" ? new Date() : undefined,
        },
      });

      // Check if all modules are completed → mark enrollment complete and issue certificate
      const course = await db.course.findFirst({
        where: { enrollments: { some: { id: input.enrollmentId } } },
        include: { modules: { select: { id: true } } },
      });

      if (course && input.status === "completed") {
        const allProgress = await db.moduleProgress.findMany({
          where: { enrollmentId: input.enrollmentId, status: "completed" },
        });
        if (allProgress.length >= course.modules.length) {
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

      return progress;
    }),
});
