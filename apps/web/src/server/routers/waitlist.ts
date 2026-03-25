import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/trpc";
import { db } from "@agentic-academy/db";

export const waitlistRouter = createTRPCRouter({
  join: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      try {
        await db.waitlistEmail.create({ data: { email: input.email } });
        return { joined: true };
      } catch {
        // Unique constraint — email already registered
        return { joined: true }; // Silently succeed to avoid email enumeration
      }
    }),

  count: publicProcedure.query(async () => {
    const count = await db.waitlistEmail.count();
    return { count };
  }),
});
