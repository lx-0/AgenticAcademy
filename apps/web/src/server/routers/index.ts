import { createTRPCRouter } from "@/server/trpc";
import { waitlistRouter } from "./waitlist";
import { courseRouter } from "./course";
import { enrollmentRouter } from "./enrollment";
import { assessmentRouter } from "./assessment";
import { certificateRouter } from "./certificate";
import { credentialRouter } from "./credential";

export const appRouter = createTRPCRouter({
  waitlist: waitlistRouter,
  course: courseRouter,
  enrollment: enrollmentRouter,
  assessment: assessmentRouter,
  certificate: certificateRouter,
  credential: credentialRouter,
});

export type AppRouter = typeof appRouter;
