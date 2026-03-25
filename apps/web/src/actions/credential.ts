"use server";

import { auth } from "@/auth";
import { db } from "@agentic-academy/db";
import { triageSubmission, buildTriageNarrative } from "@agentic-academy/ai";
import { revalidatePath } from "next/cache";

export type SubmitCredentialInput = {
  beforeState: string;
  whatChanged: string;
  outcomeEvidence: string;
  governanceStatement: string;
  submitterRole: string;
  industry: string;
  modulesCompleted: string[];
  implementationDate: string;
  attachmentUrl?: string;
  consentToPublish: boolean;
  parentId?: string;
};

export type SubmitCredentialResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export async function submitCredential(
  input: SubmitCredentialInput
): Promise<SubmitCredentialResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };

  const userId = session.user.id;

  // Word count validation (all four sections combined, min 300)
  const allText = [
    input.beforeState,
    input.whatChanged,
    input.outcomeEvidence,
    input.governanceStatement,
  ].join(" ");
  const wordCount = countWords(allText);
  if (wordCount < 300) {
    return {
      ok: false,
      error: `Submission is ${wordCount} words — minimum is 300. Please expand your response.`,
    };
  }

  // Determine attempt number
  let attempt = 1;
  if (input.parentId) {
    const parent = await db.credentialSubmission.findUnique({
      where: { id: input.parentId },
      include: { resubmissions: true },
    });
    if (!parent || parent.userId !== userId) {
      return { ok: false, error: "Original submission not found" };
    }
    if (parent.status !== "revision_requested") {
      return {
        ok: false,
        error: "Can only resubmit when revision has been requested.",
      };
    }
    attempt = parent.attempt + 1 + parent.resubmissions.length;
  }

  // Fee gate: attempt 3+ requires $15 (stubbed)
  if (attempt >= 3) {
    return {
      ok: false,
      error:
        "A $15 processing fee is required for your second resubmission. Please contact support to complete payment before resubmitting.",
    };
  }

  // Validate implementation date (within 180 days)
  const implDate = new Date(input.implementationDate);
  if (isNaN(implDate.getTime())) {
    return { ok: false, error: "Invalid implementation date" };
  }
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 180);
  if (implDate < cutoff) {
    return {
      ok: false,
      error: "Implementation date must be within the last 180 days",
    };
  }

  // Validate modules against enrollment
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
    return {
      ok: false,
      error: `Module(s) not found in your enrollment: ${invalid.join(", ")}`,
    };
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
      implementationDate: implDate,
      hasAttachment: !!input.attachmentUrl,
      attachmentUrl: input.attachmentUrl ?? null,
      consentToPublish: input.consentToPublish,
      wordCount,
      attempt,
      status: "pending_triage",
    },
  });

  // Run AI triage
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

    const newStatus =
      triage.bucket === "auto_approve" ? "approved" : "pending_review";

    await db.credentialSubmission.update({
      where: { id: submission.id },
      data: { status: newStatus },
    });
  } catch (err) {
    // Triage failed — fall back to manual review
    await db.credentialSubmission.update({
      where: { id: submission.id },
      data: { status: "pending_review" },
    });
    console.error("Triage error for submission", submission.id, err);
  }

  revalidatePath("/credentials");
  return { ok: true, id: submission.id };
}

export type ReviewInput = {
  submissionId: string;
  scoreWorkflow: number;
  scoreOutcome: number;
  scoreGovernance: number;
  scoreRole: number;
  decision: "approved" | "revision_requested" | "rejected";
  feedbackMessage?: string;
  isSpotCheck?: boolean;
};

export async function submitReview(
  input: ReviewInput
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };

  const reviewer = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (!reviewer || (reviewer.role !== "reviewer" && reviewer.role !== "admin")) {
    return { ok: false, error: "Forbidden" };
  }

  const sub = await db.credentialSubmission.findUnique({
    where: { id: input.submissionId },
  });
  if (!sub) return { ok: false, error: "Submission not found" };
  if (sub.status !== "pending_review") {
    return { ok: false, error: "Submission is not pending review" };
  }

  const totalScore =
    input.scoreWorkflow + input.scoreOutcome + input.scoreGovernance + input.scoreRole;

  await db.submissionReview.create({
    data: {
      submissionId: input.submissionId,
      reviewerId: session.user.id,
      scoreWorkflow: input.scoreWorkflow,
      scoreOutcome: input.scoreOutcome,
      scoreGovernance: input.scoreGovernance,
      scoreRole: input.scoreRole,
      totalScore,
      decision: input.decision,
      feedbackMessage: input.feedbackMessage ?? null,
      isSpotCheck: input.isSpotCheck ?? false,
    },
  });

  await db.credentialSubmission.update({
    where: { id: input.submissionId },
    data: { status: input.decision },
  });

  revalidatePath("/credentials/review");
  return { ok: true };
}
