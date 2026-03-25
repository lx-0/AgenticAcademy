import { createTRPCRouter } from "@/server/trpc";
import { waitlistRouter } from "./waitlist";

export const appRouter = createTRPCRouter({
  waitlist: waitlistRouter,
});

export type AppRouter = typeof appRouter;
