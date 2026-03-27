"use server";

import { auth } from "@/auth";
import { db } from "@agentic-academy/db";
import { sendEmail } from "@/lib/resend";
import { AssessmentResultsEmail } from "@/emails/assessment-results";
import { CourseCompletionEmail } from "@/emails/course-completion";
import * as React from "react";
import { redirect } from "next/navigation";

const DEFAULT_SKILL_QUESTIONS = [
  {
    skillName: "Agent Architecture",
    question:
      "Which pattern best describes a multi-agent orchestration where a central agent delegates sub-tasks to specialist agents?",
    options: [
      "Peer-to-peer mesh",
      "Hierarchical orchestrator-worker",
      "Event-driven publish-subscribe",
      "Shared memory pool",
    ],
    correctIndex: 1,
    explanation:
      "Hierarchical orchestrator-worker patterns centralize coordination while allowing specialist agents to focus on scoped tasks.",
  },
  {
    skillName: "Observability",
    question:
      "What is the primary purpose of structured trace logging in agentic workflows?",
    options: [
      "Reduce LLM token usage",
      "Enable replay and root-cause analysis of agent decisions",
      "Encrypt agent-to-agent communication",
      "Cache tool call results",
    ],
    correctIndex: 1,
    explanation:
      "Structured traces let you reconstruct exactly what each agent decided and why, enabling post-incident analysis.",
  },
  {
    skillName: "Governance",
    question:
      "Which control mechanism prevents an agent from executing irreversible actions without human approval?",
    options: [
      "Rate limiting",
      "Human-in-the-loop checkpoint",
      "Output caching",
      "Prompt compression",
    ],
    correctIndex: 1,
    explanation:
      "Human-in-the-loop checkpoints require explicit approval before the agent proceeds with high-stakes or irreversible operations.",
  },
  {
    skillName: "Cost Management",
    question:
      "What strategy most effectively reduces LLM API costs in a long-running agentic workflow?",
    options: [
      "Increasing max_tokens to avoid truncation",
      "Using a single large model for all sub-tasks",
      "Routing simple sub-tasks to cheaper, smaller models",
      "Disabling streaming responses",
    ],
    correctIndex: 2,
    explanation:
      "Model routing — using cheaper models for simple tasks and expensive models only when needed — is the primary cost lever.",
  },
  {
    skillName: "Prompt Engineering",
    question:
      "In a ReAct-style agent loop, what does the 'Observation' step represent?",
    options: [
      "The agent's internal chain-of-thought reasoning",
      "The result returned by executing a tool call",
      "The user's original instruction",
      "The agent's final answer to the user",
    ],
    correctIndex: 1,
    explanation:
      "In ReAct, Observation is the external feedback the agent receives after taking an action (tool call result).",
  },
];

type SkillAssessmentResult = {
  overallScore: number;
  scores: Array<{ skillName: string; score: number }>;
  review: Array<{
    skillName: string;
    question: string;
    options: string[];
    correctIndex: number;
    selectedIndex: number | undefined;
    explanation: string;
  }>;
  error?: string;
};

export async function submitSkillAssessmentAction(
  enrollmentId: string,
  courseId: string,
  phase: "pre" | "post",
  answers: number[]
): Promise<SkillAssessmentResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      overallScore: 0,
      scores: [],
      review: [],
      error: "Not authenticated",
    };
  }

  const enrollment = await db.enrollment.findFirst({
    where: { id: enrollmentId, userId: session.user.id, courseId },
  });
  if (!enrollment) {
    return {
      overallScore: 0,
      scores: [],
      review: [],
      error: "Enrollment not found",
    };
  }

  const questions = DEFAULT_SKILL_QUESTIONS;
  const scores = questions.map((q, i) => ({
    skillName: q.skillName,
    score: answers[i] === q.correctIndex ? 100 : 0,
  }));
  const overallScore = Math.round(
    scores.reduce((sum, s) => sum + s.score, 0) / scores.length
  );

  const existing = await db.skillAssessment.findUnique({
    where: { enrollmentId_phase: { enrollmentId, phase } },
  });

  let assessmentId: string;
  if (existing) {
    await db.skillScore.deleteMany({ where: { skillAssessmentId: existing.id } });
    await db.skillAssessment.update({
      where: { id: existing.id },
      data: { questions: questions as object[], completedAt: new Date(), updatedAt: new Date() },
    });
    assessmentId = existing.id;
  } else {
    const created = await db.skillAssessment.create({
      data: {
        enrollmentId,
        courseId,
        phase,
        questions: questions as object[],
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    assessmentId = created.id;
  }

  await db.skillScore.createMany({
    data: scores.map((s) => ({
      skillAssessmentId: assessmentId,
      skillName: s.skillName,
      score: s.score,
    })),
  });

  // Post-assessment: issue certificate and send emails
  if (phase === "post") {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, name: true },
    });
    const cert = await db.certificate.upsert({
      where: { enrollmentId },
      create: { enrollmentId, recipientEmail: user?.email ?? undefined },
      update: {},
    });

    if (user?.email) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://agentic.academy";

      const course = await db.course.findUnique({
        where: { id: enrollment.courseId },
        select: { title: true, slug: true },
      });
      const courseTitle = course?.title ?? "the course";

      // Fetch pre-assessment scores for comparison
      const preAssessment = await db.skillAssessment.findUnique({
        where: { enrollmentId_phase: { enrollmentId, phase: "pre" } },
        include: { scores: true },
      });
      const preScoreMap = Object.fromEntries(
        (preAssessment?.scores ?? []).map((s) => [s.skillName, s.score])
      );

      const skillScoresForEmail = scores.map((s) => ({
        skillName: s.skillName,
        preScore: preScoreMap[s.skillName] ?? 0,
        postScore: s.score,
      }));
      const preOverall = preAssessment
        ? Math.round(
            (preAssessment.scores.reduce((sum, s) => sum + s.score, 0) /
              Math.max(preAssessment.scores.length, 1))
          )
        : 0;

      sendEmail({
        to: user.email,
        subject: "Your skill improvement results are in!",
        type: "assessment_results",
        userId: session.user.id,
        template: React.createElement(AssessmentResultsEmail, {
          name: user.name ?? user.email,
          courseTitle,
          preOverall,
          postOverall: overallScore,
          skillScores: skillScoresForEmail,
          dashboardUrl: `${appUrl}/dashboard`,
        }),
      });

      sendEmail({
        to: user.email,
        subject: `Congratulations! You completed ${courseTitle}`,
        type: "course_completion",
        userId: session.user.id,
        template: React.createElement(CourseCompletionEmail, {
          name: user.name ?? user.email,
          courseTitle,
          certificateUrl: `${appUrl}/dashboard/certificates/${cert.id}`,
          credentialId: cert.credentialId,
          linkedInShareUrl: `https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(`${appUrl}/certificates/${cert.credentialId}`)}&title=${encodeURIComponent(`I completed ${courseTitle} on AgenticAcademy`)}`,
          dashboardUrl: `${appUrl}/dashboard`,
        }),
      });
    }
  }

  return {
    overallScore,
    scores,
    review: questions.map((q, i) => ({
      skillName: q.skillName,
      question: q.question,
      options: q.options,
      correctIndex: q.correctIndex,
      selectedIndex: answers[i],
      explanation: q.explanation,
    })),
  };
}

// Skip pre-assessment and go straight to the course
export async function skipPreAssessmentAction(courseSlug: string): Promise<void> {
  redirect(`/courses/${courseSlug}`);
}

// Skip post-assessment and issue certificate directly
export async function skipPostAssessmentAction(
  enrollmentId: string,
  courseSlug: string
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { email: true },
  });
  await db.certificate.upsert({
    where: { enrollmentId },
    create: { enrollmentId, recipientEmail: user?.email ?? undefined },
    update: {},
  });

  redirect(`/courses/${courseSlug}`);
}
