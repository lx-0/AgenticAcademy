import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import { db } from "@agentic-academy/db";
import { triageSubmission, buildTriageNarrative } from "@agentic-academy/ai";
import { TRPCError } from "@trpc/server";

const INDUSTRY_OPTIONS = [
  "Technology",
  "Healthcare",
  "Financial Services",
  "Education",
  "Manufacturing",
  "Retail / E-commerce",
  "Professional Services",
  "Government / Public Sector",
  "Non-profit",
  "Media / Entertainment",
  "Logistics / Supply Chain",
  "Other",
] as const;

const RESUBMISSION_FEE_ATTEMPT = 3; // attempt 3+ requires $15 fee

/** Count total words across all narrative sections */
function countWords(fields: {
  beforeState: string;
  whatChanged: string;
  outcomeEvidence: string;
  governanceStatement: string;
}): number {
  return [
    fields.beforeState,
    fields.whatChanged,
    fields.outcomeEvidence,
    fields.governanceStatement,
  ]
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
}

const submitInput = z.object({
  beforeState: z.string().min(1, "Required"),
  whatChanged: z.string().min(1, "Required"),
  outcomeEvidence: z.string().min(1, "Required"),
  governanceStatement: z.string().min(1, "Required"),
  submitterRole: z.string().min(1, "Required"),
  industry: z.enum(INDUSTRY_OPTIONS),
  modulesCompleted: z.array(z.string()).min(1, "Select at least one module"),
  implementationDate: z.string().refine((d) => {
    const date = new Date(d);
    if (isNaN(date.getTime())) return false;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 180);
    return date >= cutoff;
  }, "Implementation must be within the last 180 days"),
  attachmentUrl: z.string().url().optional(),
  consentToPublish: z.boolean(),
  parentId: z.string().optional(), // set for resubmissions
});

const reviewInput = z.object({
  submissionId: z.string(),
  scoreWorkflow: z.number().min(0).max(3).int(),
  scoreOutcome: z.number().min(0).max(3).int(),
  scoreGovernance: z.number().min(0).max(3).int(),
  scoreRole: z.number().min(0).max(3).int(),
  decision: z.enum(["approved", "revision_requested", "rejected"]),
  feedbackMessage: z.string().optional(),
  isSpotCheck: z.boolean().default(false),
});

export const credentialRouter = createTRPCRouter({
  // ── Submission ─────────────────────────────────────────────────────────────

  submit: protectedProcedure
    .input(submitInput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id!;

      // Validate word count (300-word minimum)
      const wordCount = countWords(input);
      if (wordCount < 300) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Submission is ${wordCount} words — minimum is 300. Please expand your response.`,
        });
      }

      // Determine attempt number for resubmission
      let attempt = 1;
      if (input.parentId) {
        const parent = await db.credentialSubmission.findUnique({
          where: { id: input.parentId },
          include: { resubmissions: true },
        });
        if (!parent || parent.userId !== userId) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        if (parent.status !== "revision_requested") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Can only resubmit when revision has been requested.",
          });
        }
        attempt = parent.attempt + 1 + parent.resubmissions.length;
      }

      // Gate $15 fee on attempt 3+
      if (attempt >= RESUBMISSION_FEE_ATTEMPT) {
        // Stub: in production, verify payment intent here
        // For now we just block and instruct the client to pass paymentIntentId
        throw new TRPCError({
          code: "PAYMENT_REQUIRED",
          message:
            "A $15 processing fee is required for your second resubmission. Please complete payment before resubmitting.",
        });
      }

      // Validate modules against user's enrollments
      const enrolledModuleIds = await db.moduleProgress.findMany({
        where: {
          enrollment: { userId },
          status: { in: ["completed", "in_progress"] },
        },
        select: { moduleId: true },
      });
      const enrolledSet = new Set(enrolledModuleIds.map((m) => m.moduleId));
      const invalid = input.modulesCompleted.filter((m) => !enrolledSet.has(m));
      if (invalid.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Module(s) not found in your enrollment: ${invalid.join(", ")}`,
        });
      }

      // Create submission
      const submission = await db.credentialSubmission.create({
        data: {
          userId,
          parentId: input.parentId ?? null,
          beforeState: input.beforeState,
          whatChanged: input.whatChanged,
          outcomeEvidence: input.outcomeEvidence,
          governanceStatement: input.governanceStatement,
          submitterRole: input.submitterRole,
          industry: input.industry,
          modulesCompleted: input.modulesCompleted,
          implementationDate: new Date(input.implementationDate),
          hasAttachment: !!input.attachmentUrl,
          attachmentUrl: input.attachmentUrl ?? null,
          consentToPublish: input.consentToPublish,
          wordCount,
          attempt,
          status: "pending_triage",
        },
      });

      // Run AI triage asynchronously (fire and handle errors inline)
      try {
        const narrative = buildTriageNarrative(input);
        const triage = await triageSubmission(narrative);

        await db.triageResult.create({
          data: {
            submissionId: submission.id,
            scoreWorkflow: triage.scoreWorkflow,
            scoreOutcome: triage.scoreOutcome,
            scoreGovernance: triage.scoreGovernance,
            scoreRole: triage.scoreRole,
            totalScore: triage.totalScore,
            bucket: triage.bucket,
            flagReason: triage.flagReason,
          },
        });

        // Auto-approve if bucket is auto_approve and score is high
        const newStatus =
          triage.bucket === "auto_approve"
            ? "approved"
            : "pending_review";

        await db.credentialSubmission.update({
          where: { id: submission.id },
          data: { status: newStatus },
        });
      } catch (err) {
        // Triage failed — move to pending_review for human handling
        await db.credentialSubmission.update({
          where: { id: submission.id },
          data: { status: "pending_review" },
        });
        console.error("Triage error for submission", submission.id, err);
      }

      return { id: submission.id };
    }),

  // ── Learner views ──────────────────────────────────────────────────────────

  mySubmissions: protectedProcedure.query(async ({ ctx }) => {
    return db.credentialSubmission.findMany({
      where: { userId: ctx.session.user.id! },
      include: { triageResult: true },
      orderBy: { createdAt: "desc" },
    });
  }),

  getMySubmission: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const sub = await db.credentialSubmission.findUnique({
        where: { id: input.id },
        include: { triageResult: true, review: true },
      });
      if (!sub) throw new TRPCError({ code: "NOT_FOUND" });
      if (sub.userId !== ctx.session.user.id!) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return sub;
    }),

  // ── Reviewer views ─────────────────────────────────────────────────────────

  /** List submissions ready for human review (reviewer/admin only) */
  reviewQueue: protectedProcedure.query(async ({ ctx }) => {
    const user = await db.user.findUnique({
      where: { id: ctx.session.user.id! },
      select: { role: true },
    });
    if (!user || (user.role !== "reviewer" && user.role !== "admin")) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    return db.credentialSubmission.findMany({
      where: { status: "pending_review" },
      include: {
        triageResult: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }),

  /** Get full submission for reviewer */
  getForReview: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const reviewer = await db.user.findUnique({
        where: { id: ctx.session.user.id! },
        select: { role: true },
      });
      if (
        !reviewer ||
        (reviewer.role !== "reviewer" && reviewer.role !== "admin")
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const sub = await db.credentialSubmission.findUnique({
        where: { id: input.id },
        include: {
          triageResult: true,
          review: true,
          user: { select: { name: true, email: true } },
        },
      });
      if (!sub) throw new TRPCError({ code: "NOT_FOUND" });
      return sub;
    }),

  /** Submit a reviewer decision */
  submitReview: protectedProcedure
    .input(reviewInput)
    .mutation(async ({ ctx, input }) => {
      const reviewerId = ctx.session.user.id!;
      const reviewer = await db.user.findUnique({
        where: { id: reviewerId },
        select: { role: true },
      });
      if (
        !reviewer ||
        (reviewer.role !== "reviewer" && reviewer.role !== "admin")
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const sub = await db.credentialSubmission.findUnique({
        where: { id: input.submissionId },
      });
      if (!sub) throw new TRPCError({ code: "NOT_FOUND" });
      if (sub.status !== "pending_review") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Submission is not in pending_review state.",
        });
      }

      const totalScore =
        input.scoreWorkflow +
        input.scoreOutcome +
        input.scoreGovernance +
        input.scoreRole;

      await db.submissionReview.create({
        data: {
          submissionId: input.submissionId,
          reviewerId,
          scoreWorkflow: input.scoreWorkflow,
          scoreOutcome: input.scoreOutcome,
          scoreGovernance: input.scoreGovernance,
          scoreRole: input.scoreRole,
          totalScore,
          decision: input.decision,
          feedbackMessage: input.feedbackMessage ?? null,
          isSpotCheck: input.isSpotCheck,
        },
      });

      const statusMap: Record<
        typeof input.decision,
        "approved" | "revision_requested" | "rejected"
      > = {
        approved: "approved",
        revision_requested: "revision_requested",
        rejected: "rejected",
      };

      await db.credentialSubmission.update({
        where: { id: input.submissionId },
        data: { status: statusMap[input.decision] },
      });

      return { ok: true };
    }),

  // ── Spot-check record ──────────────────────────────────────────────────────

  recordSpotCheck: protectedProcedure
    .input(
      z.object({ triageResultId: z.string(), humanAgreed: z.boolean() })
    )
    .mutation(async ({ ctx, input }) => {
      const reviewer = await db.user.findUnique({
        where: { id: ctx.session.user.id! },
        select: { role: true },
      });
      if (
        !reviewer ||
        (reviewer.role !== "reviewer" && reviewer.role !== "admin")
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await db.triageResult.update({
        where: { id: input.triageResultId },
        data: { humanAgreed: input.humanAgreed },
      });

      return { ok: true };
    }),

  industries: protectedProcedure.query(() => INDUSTRY_OPTIONS),
});
