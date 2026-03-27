import { createTRPCRouter } from "@/server/trpc";
import { waitlistRouter } from "./waitlist";
import { courseRouter } from "./course";
import { enrollmentRouter } from "./enrollment";
import { assessmentRouter } from "./assessment";
import { certificateRouter } from "./certificate";
import { credentialRouter } from "./credential";
import { personalizationRouter } from "./personalization";
import { analyticsRouter } from "./analytics";
import { billingRouter } from "./billing";
import { organizationRouter } from "./organization";
import { searchRouter } from "./search";
import { npsRouter } from "./nps";
import { microSurveyRouter } from "./micro-survey";

export const appRouter = createTRPCRouter({
  waitlist: waitlistRouter,
  course: courseRouter,
  enrollment: enrollmentRouter,
  assessment: assessmentRouter,
  certificate: certificateRouter,
  credential: credentialRouter,
  personalization: personalizationRouter,
  analytics: analyticsRouter,
  billing: billingRouter,
  organization: organizationRouter,
  search: searchRouter,
  nps: npsRouter,
  microSurvey: microSurveyRouter,
});

export type AppRouter = typeof appRouter;
