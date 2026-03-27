import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "@/server/trpc";
import { db } from "@agentic-academy/db";

export const courseRouter = createTRPCRouter({
  list: publicProcedure
    .input(z.object({ status: z.enum(["draft", "published", "archived"]).optional() }).optional())
    .query(async ({ input }) => {
      return db.course.findMany({
        where: { status: input?.status ?? "published" },
        include: {
          modules: { orderBy: { order: "asc" }, select: { id: true } },
          _count: { select: { enrollments: true } },
        },
        orderBy: { createdAt: "asc" },
      });
    }),

  bySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      return db.course.findUnique({
        where: { slug: input.slug },
        include: {
          modules: {
            orderBy: { order: "asc" },
            include: {
              lessons: { orderBy: { order: "asc" } },
              assessment: { select: { id: true, passingScore: true } },
            },
          },
          _count: { select: { enrollments: true } },
        },
      });
    }),

  myEnrollment: protectedProcedure
    .input(z.object({ courseId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });
      return db.enrollment.findUnique({
        where: {
          userId_courseId: {
            userId,
            courseId: input.courseId,
          },
        },
        include: {
          progress: true,
          certificate: true,
        },
      });
    }),
});
