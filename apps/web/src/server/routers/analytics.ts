import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import { db } from "@agentic-academy/db";
import { TRPCError } from "@trpc/server";

// Default skill assessment questions for a course (used when no custom questions exist)
const DEFAULT_SKILL_QUESTIONS = [
  {
    skillName: "Agent Architecture",
    question: "Which pattern best describes a multi-agent orchestration where a central agent delegates sub-tasks to specialist agents?",
    options: [
      "Peer-to-peer mesh",
      "Hierarchical orchestrator-worker",
      "Event-driven publish-subscribe",
      "Shared memory pool",
    ],
    correctIndex: 1,
    explanation: "Hierarchical orchestrator-worker patterns centralize coordination while allowing specialist agents to focus on scoped tasks.",
  },
  {
    skillName: "Observability",
    question: "What is the primary purpose of structured trace logging in agentic workflows?",
    options: [
      "Reduce LLM token usage",
      "Enable replay and root-cause analysis of agent decisions",
      "Encrypt agent-to-agent communication",
      "Cache tool call results",
    ],
    correctIndex: 1,
    explanation: "Structured traces let you reconstruct exactly what each agent decided and why, enabling post-incident analysis.",
  },
  {
    skillName: "Governance",
    question: "Which control mechanism prevents an agent from executing irreversible actions without human approval?",
    options: [
      "Rate limiting",
      "Human-in-the-loop checkpoint",
      "Output caching",
      "Prompt compression",
    ],
    correctIndex: 1,
    explanation: "Human-in-the-loop checkpoints require explicit approval before the agent proceeds with high-stakes or irreversible operations.",
  },
  {
    skillName: "Cost Management",
    question: "What strategy most effectively reduces LLM API costs in a long-running agentic workflow?",
    options: [
      "Increasing max_tokens to avoid truncation",
      "Using a single large model for all sub-tasks",
      "Routing simple sub-tasks to cheaper, smaller models",
      "Disabling streaming responses",
    ],
    correctIndex: 2,
    explanation: "Model routing — using cheaper models for simple tasks and expensive models only when needed — is the primary cost lever.",
  },
  {
    skillName: "Prompt Engineering",
    question: "In a ReAct-style agent loop, what does the 'Observation' step represent?",
    options: [
      "The agent's internal chain-of-thought reasoning",
      "The result returned by executing a tool call",
      "The user's original instruction",
      "The agent's final answer to the user",
    ],
    correctIndex: 1,
    explanation: "In ReAct, Observation is the external feedback the agent receives after taking an action (tool call result).",
  },
];

export const analyticsRouter = createTRPCRouter({
  // Get the skill assessment questions for a course (same for pre and post)
  getQuestions: protectedProcedure
    .input(z.object({ courseId: z.string() }))
    .query(async () => {
      // Return default questions (stripped of correctIndex for client)
      return DEFAULT_SKILL_QUESTIONS.map(({ correctIndex: _ci, ...q }) => q);
    }),

  // Submit a pre or post skill assessment
  submitSkillAssessment: protectedProcedure
    .input(
      z.object({
        enrollmentId: z.string(),
        courseId: z.string(),
        phase: z.enum(["pre", "post"]),
        answers: z.array(z.number().int()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

      // Verify enrollment belongs to user
      const enrollment = await db.enrollment.findFirst({
        where: { id: input.enrollmentId, userId, courseId: input.courseId },
      });
      if (!enrollment) throw new TRPCError({ code: "FORBIDDEN" });

      // Score each skill
      const questions = DEFAULT_SKILL_QUESTIONS;
      const scores = questions.map((q, i) => ({
        skillName: q.skillName,
        score: input.answers[i] === q.correctIndex ? 100 : 0,
      }));
      const overallScore = Math.round(
        scores.reduce((sum, s) => sum + s.score, 0) / scores.length
      );

      // Upsert the assessment record
      const existing = await db.skillAssessment.findUnique({
        where: { enrollmentId_phase: { enrollmentId: input.enrollmentId, phase: input.phase } },
      });

      let assessment;
      if (existing) {
        // Delete old scores and update
        await db.skillScore.deleteMany({ where: { skillAssessmentId: existing.id } });
        assessment = await db.skillAssessment.update({
          where: { id: existing.id },
          data: {
            questions: questions as object[],
            completedAt: new Date(),
            updatedAt: new Date(),
          },
        });
      } else {
        assessment = await db.skillAssessment.create({
          data: {
            enrollmentId: input.enrollmentId,
            courseId: input.courseId,
            phase: input.phase,
            questions: questions as object[],
            completedAt: new Date(),
            updatedAt: new Date(),
          },
        });
      }

      // Create skill scores
      await db.skillScore.createMany({
        data: scores.map((s) => ({
          skillAssessmentId: assessment.id,
          skillName: s.skillName,
          score: s.score,
        })),
      });

      // For post-assessment: issue certificate now that we have both assessments
      if (input.phase === "post") {
        const user = await db.user.findUnique({
          where: { id: userId },
          select: { email: true },
        });
        await db.certificate.upsert({
          where: { enrollmentId: input.enrollmentId },
          create: { enrollmentId: input.enrollmentId, recipientEmail: user?.email ?? undefined },
          update: {},
        });
      }

      return {
        overallScore,
        scores,
        review: questions.map((q, i) => ({
          skillName: q.skillName,
          question: q.question,
          options: q.options,
          correctIndex: q.correctIndex,
          selectedIndex: input.answers[i],
          explanation: q.explanation,
        })),
      };
    }),

  // Get current user's pre and post assessments for a course
  getMyAssessments: protectedProcedure
    .input(z.object({ enrollmentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

      const enrollment = await db.enrollment.findFirst({
        where: { id: input.enrollmentId, userId },
      });
      if (!enrollment) throw new TRPCError({ code: "FORBIDDEN" });

      const assessments = await db.skillAssessment.findMany({
        where: { enrollmentId: input.enrollmentId },
        include: { scores: true },
        orderBy: { phase: "asc" },
      });

      return assessments;
    }),

  // Admin: get ROI dashboard data across all courses
  adminGetRoiData: protectedProcedure
    .input(z.object({ courseId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

      const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
      if (user?.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });

      const courseFilter = input.courseId ? { id: input.courseId } : { status: "published" as const };
      const courses = await db.course.findMany({
        where: courseFilter,
        select: { id: true, title: true, slug: true },
        orderBy: { title: "asc" },
      });

      const results = await Promise.all(
        courses.map(async (course) => {
          const totalEnrollments = await db.enrollment.count({ where: { courseId: course.id } });
          const completedEnrollments = await db.enrollment.findMany({
            where: { courseId: course.id, status: "completed" },
            select: { id: true, enrolledAt: true, completedAt: true },
          });

          const completionRate =
            totalEnrollments > 0 ? completedEnrollments.length / totalEnrollments : 0;

          const avgTimeToCompletion =
            completedEnrollments.length > 0
              ? completedEnrollments.reduce((sum, e) => {
                  if (!e.completedAt) return sum;
                  const days =
                    (e.completedAt.getTime() - e.enrolledAt.getTime()) / (1000 * 60 * 60 * 24);
                  return sum + days;
                }, 0) / completedEnrollments.length
              : null;

          // Pre-assessment scores
          const preAssessments = await db.skillAssessment.findMany({
            where: { courseId: course.id, phase: "pre", completedAt: { not: null } },
            include: { scores: true },
          });

          // Post-assessment scores
          const postAssessments = await db.skillAssessment.findMany({
            where: { courseId: course.id, phase: "post", completedAt: { not: null } },
            include: { scores: true },
          });

          const calcAvgScore = (assessments: typeof preAssessments) => {
            if (assessments.length === 0) return null;
            const allScores = assessments.flatMap((a) => a.scores.map((s) => s.score));
            return allScores.length > 0
              ? Math.round(allScores.reduce((s, v) => s + v, 0) / allScores.length)
              : null;
          };

          const avgPreScore = calcAvgScore(preAssessments);
          const avgPostScore = calcAvgScore(postAssessments);
          const avgImprovementPct =
            avgPreScore !== null && avgPostScore !== null
              ? avgPostScore - avgPreScore
              : null;

          // Per-skill breakdown
          const skillNames = DEFAULT_SKILL_QUESTIONS.map((q) => q.skillName);
          const skillBreakdown = skillNames.map((skillName) => {
            const preScores = preAssessments
              .flatMap((a) => a.scores.filter((s) => s.skillName === skillName))
              .map((s) => s.score);
            const postScores = postAssessments
              .flatMap((a) => a.scores.filter((s) => s.skillName === skillName))
              .map((s) => s.score);

            const avgPre =
              preScores.length > 0
                ? Math.round(preScores.reduce((s, v) => s + v, 0) / preScores.length)
                : null;
            const avgPost =
              postScores.length > 0
                ? Math.round(postScores.reduce((s, v) => s + v, 0) / postScores.length)
                : null;

            return { skillName, avgPre, avgPost };
          });

          return {
            course,
            totalEnrollments,
            completedCount: completedEnrollments.length,
            completionRate,
            avgTimeToCompletion,
            avgPreScore,
            avgPostScore,
            avgImprovementPct,
            preAssessmentCount: preAssessments.length,
            postAssessmentCount: postAssessments.length,
            skillBreakdown,
          };
        })
      );

      return results;
    }),

  // Admin: per-learner breakdown for a course
  adminGetLearnerBreakdown: protectedProcedure
    .input(z.object({ courseId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

      const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
      if (user?.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });

      const enrollments = await db.enrollment.findMany({
        where: { courseId: input.courseId },
        include: {
          user: { select: { name: true, email: true } },
          progress: true,
          certificate: { select: { id: true } },
          skillAssessments: { include: { scores: true } },
          course: { include: { modules: { select: { id: true } } } },
        },
        orderBy: { enrolledAt: "desc" },
      });

      return enrollments.map((e) => {
        const totalModules = e.course.modules.length;
        const completedModules = e.progress.filter((p) => p.status === "completed").length;
        const preAssessment = e.skillAssessments.find((a) => a.phase === "pre");
        const postAssessment = e.skillAssessments.find((a) => a.phase === "post");

        const avgScore = (assessment: typeof preAssessment) => {
          if (!assessment || assessment.scores.length === 0) return null;
          const scores = assessment.scores.map((s) => s.score);
          return Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
        };

        return {
          enrollmentId: e.id,
          userName: e.user.name ?? e.user.email,
          userEmail: e.user.email,
          enrolledAt: e.enrolledAt,
          completedAt: e.completedAt,
          status: e.status,
          modulesCompleted: completedModules,
          totalModules,
          hasCertificate: !!e.certificate,
          preScore: avgScore(preAssessment),
          postScore: avgScore(postAssessment),
          improvement:
            avgScore(preAssessment) !== null && avgScore(postAssessment) !== null
              ? (avgScore(postAssessment) as number) - (avgScore(preAssessment) as number)
              : null,
        };
      });
    }),

  // Refresh analytics snapshot for a course (admin)
  refreshSnapshot: protectedProcedure
    .input(z.object({ courseId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

      const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
      if (user?.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });

      const totalEnrollments = await db.enrollment.count({ where: { courseId: input.courseId } });
      const completedEnrollments = await db.enrollment.findMany({
        where: { courseId: input.courseId, status: "completed" },
        select: { id: true, enrolledAt: true, completedAt: true },
      });

      const completionRate =
        totalEnrollments > 0 ? completedEnrollments.length / totalEnrollments : 0;

      const avgTimeToCompletion =
        completedEnrollments.length > 0
          ? completedEnrollments.reduce((sum, e) => {
              if (!e.completedAt) return sum;
              return (
                sum +
                (e.completedAt.getTime() - e.enrolledAt.getTime()) / (1000 * 60 * 60 * 24)
              );
            }, 0) / completedEnrollments.length
          : null;

      const preScores = await db.skillScore.findMany({
        where: { skillAssessment: { courseId: input.courseId, phase: "pre" } },
        select: { score: true },
      });
      const postScores = await db.skillScore.findMany({
        where: { skillAssessment: { courseId: input.courseId, phase: "post" } },
        select: { score: true },
      });

      const avg = (scores: { score: number }[]) =>
        scores.length > 0
          ? scores.reduce((s, v) => s + v.score, 0) / scores.length
          : null;

      const avgPreScore = avg(preScores);
      const avgPostScore = avg(postScores);

      const snapshot = await db.analyticsSnapshot.create({
        data: {
          courseId: input.courseId,
          totalEnrollments,
          completedCount: completedEnrollments.length,
          completionRate,
          avgPreScore,
          avgPostScore,
          avgImprovementPct:
            avgPreScore !== null && avgPostScore !== null
              ? avgPostScore - avgPreScore
              : null,
          avgTimeToCompletion,
        },
      });

      return snapshot;
    }),
});
