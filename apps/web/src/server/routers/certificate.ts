import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import { db } from "@agentic-academy/db";
import { TRPCError } from "@trpc/server";

export const certificateRouter = createTRPCRouter({
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const cert = await db.certificate.findUnique({
        where: { id: input.id },
        include: {
          enrollment: {
            include: {
              user: { select: { name: true, email: true } },
              course: { select: { title: true, description: true } },
            },
          },
        },
      });

      if (!cert) throw new TRPCError({ code: "NOT_FOUND" });
      if (cert.enrollment.userId !== ctx.session.user?.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return cert;
    }),
});
