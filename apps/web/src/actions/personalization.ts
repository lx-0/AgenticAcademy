"use server";

import { auth } from "@/auth";
import { db } from "@agentic-academy/db";
import { redirect } from "next/navigation";
import { z } from "zod";
import { generateLearningPath, recommendNextModule, type ModuleContext } from "@agentic-academy/ai";
import { trackFunnelEvent } from "@/lib/funnel";

const profileSchema = z.object({
  role: z.string().min(1, "Role is required").max(100),
  experienceLevel: z.enum(["beginner", "intermediate", "advanced"]),
  learningGoals: z.array(z.string().min(1).max(200)).min(1, "Select at least one goal").max(5),
  preferredPace: z.enum(["slow", "moderate", "fast"]),
});

export async function upsertProfileAction(
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string } | null> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const goals = formData.getAll("learningGoals") as string[];
  const parsed = profileSchema.safeParse({
    role: formData.get("role"),
    experienceLevel: formData.get("experienceLevel"),
    learningGoals: goals.filter(Boolean),
    preferredPace: formData.get("preferredPace"),
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  await db.learnerProfile.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, ...parsed.data },
    update: parsed.data,
  });

  trackFunnelEvent({ userId: session.user.id, stage: "profile_setup" });

  redirect("/dashboard");
}

export async function generatePathAction(courseId: string): Promise<{ error?: string } | null> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const userId = session.user.id;
  const profile = await db.learnerProfile.findUnique({ where: { userId } });
  if (!profile) return { error: "Complete your learner profile first." };

  const course = await db.course.findUnique({
    where: { id: courseId },
    include: {
      modules: {
        orderBy: { order: "asc" },
        include: { assessment: { select: { id: true } } },
      },
    },
  });
  if (!course) return { error: "Course not found." };

  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    include: { progress: true },
  });
  const progressMap = new Map(enrollment?.progress.map((p) => [p.moduleId, p]) ?? []);

  const moduleContexts: ModuleContext[] = course.modules.map((m) => {
    const prog = progressMap.get(m.id);
    return {
      id: m.id,
      title: m.title,
      description: m.description,
      order: m.order,
      hasAssessment: !!m.assessment,
      completionStatus: prog?.status as ModuleContext["completionStatus"],
      score: prog?.score,
    };
  });

  const learnerCtx = {
    role: profile.role,
    experienceLevel: profile.experienceLevel as "beginner" | "intermediate" | "advanced",
    learningGoals: profile.learningGoals,
    preferredPace: profile.preferredPace as "slow" | "moderate" | "fast",
  };

  const { moduleSequence, rationale } = await generateLearningPath(learnerCtx, moduleContexts);

  const path = await db.learningPath.upsert({
    where: { profileId_courseId: { profileId: profile.id, courseId } },
    create: { profileId: profile.id, courseId, moduleSequence, rationale },
    update: { moduleSequence, rationale, updatedAt: new Date() },
  });

  const nextRec = await recommendNextModule(learnerCtx, moduleContexts, moduleSequence);
  if (nextRec) {
    await db.pathRecommendation.deleteMany({ where: { pathId: path.id, dismissed: false } });
    await db.pathRecommendation.create({
      data: {
        pathId: path.id,
        moduleId: nextRec.moduleId,
        reasoning: nextRec.reasoning,
        priority: 0,
      },
    });
  }

  return null;
}
