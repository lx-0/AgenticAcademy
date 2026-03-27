"use server";

import { auth } from "@/auth";
import { db } from "@agentic-academy/db";
import { redirect } from "next/navigation";
import { canEnrollCourse } from "@/lib/entitlements";
import { sendEmail } from "@/lib/resend";
import { EnrollmentConfirmationEmail } from "@/emails/enrollment-confirmation";
import { ModuleCompletionEmail } from "@/emails/module-completion";
import { CourseCompletionEmail } from "@/emails/course-completion";
import * as React from "react";

export async function enrollAction(courseId: string): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const course = await db.course.findUnique({ where: { id: courseId } });
  if (!course || course.status !== "published") {
    return { error: "Course not found" };
  }

  // Check if user already enrolled (skip tier check for re-enroll)
  const existing = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: session.user.id, courseId } },
  });

  if (!existing) {
    // Enforce tier-based enrollment limits for new enrollments
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { subscriptionTier: true, subscriptionEndsAt: true },
    });

    const tierInfo = {
      subscriptionTier: (user?.subscriptionTier ?? "free") as "free" | "pro" | "enterprise_pilot" | "enterprise",
      subscriptionEndsAt: user?.subscriptionEndsAt ?? null,
    };

    const allowed = await canEnrollCourse(session.user.id, tierInfo);
    if (!allowed) {
      return {
        error: "You've reached the free tier limit of 1 course. Upgrade to Pro for unlimited access.",
      };
    }
  }

  let isNewEnrollment = false;
  try {
    const result = await db.enrollment.upsert({
      where: { userId_courseId: { userId: session.user.id, courseId } },
      create: { userId: session.user.id, courseId },
      update: {},
    });
    isNewEnrollment = result.enrolledAt.getTime() > Date.now() - 5000;
  } catch {
    return { error: "Failed to enroll" };
  }

  if (isNewEnrollment) {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, name: true },
    });
    if (user?.email) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://agentic.academy";
      sendEmail({
        to: user.email,
        subject: `You're enrolled in ${course.title}!`,
        type: "enrollment_confirmation",
        userId: session.user.id,
        template: React.createElement(EnrollmentConfirmationEmail, {
          name: user.name ?? user.email,
          courseTitle: course.title,
          preAssessmentUrl: `${appUrl}/courses/${course.slug}/pre-assessment`,
        }),
      });
    }
  }

  // Redirect to pre-assessment to capture baseline skill scores
  redirect(`/courses/${course.slug}/pre-assessment`);
}

export async function markLessonReadAction(
  enrollmentId: string,
  moduleId: string
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const enrollment = await db.enrollment.findFirst({
    where: { id: enrollmentId, userId: session.user.id },
    include: {
      course: {
        include: {
          modules: { select: { id: true, title: true, order: true } },
        },
      },
    },
  });
  if (!enrollment) return { error: "Enrollment not found" };

  // Check if this module has an assessment — if so, don't auto-complete
  const assessment = await db.assessment.findUnique({ where: { moduleId } });

  const status = assessment ? "in_progress" : "completed";

  await db.moduleProgress.upsert({
    where: { enrollmentId_moduleId: { enrollmentId, moduleId } },
    create: {
      enrollmentId,
      moduleId,
      status,
      completedAt: status === "completed" ? new Date() : undefined,
    },
    update: {
      status,
      completedAt: status === "completed" ? new Date() : undefined,
    },
  });

  // If no assessment and all modules are now complete, finalize enrollment
  if (!assessment) {
    const completedCount = await db.moduleProgress.count({
      where: { enrollmentId, status: "completed" },
    });
    const courseComplete = completedCount >= enrollment.course.modules.length;

    if (courseComplete) {
      await db.enrollment.update({
        where: { id: enrollmentId },
        data: { status: "completed", completedAt: new Date() },
      });
      // Only auto-issue certificate if learner has no pre-assessment (legacy flow).
      // If a pre-assessment exists, the post-assessment page issues the certificate.
      const hasPreAssessment = await db.skillAssessment.findUnique({
        where: { enrollmentId_phase: { enrollmentId, phase: "pre" } },
      });
      if (!hasPreAssessment) {
        const user = await db.user.findUnique({
          where: { id: session.user.id! },
          select: { email: true, name: true },
        });
        const cert = await db.certificate.upsert({
          where: { enrollmentId },
          create: { enrollmentId, recipientEmail: user?.email ?? undefined },
          update: {},
        });
        if (user?.email) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://agentic.academy";
          sendEmail({
            to: user.email,
            subject: `Congratulations! You completed ${enrollment.course.title}`,
            type: "course_completion",
            userId: session.user.id,
            template: React.createElement(CourseCompletionEmail, {
              name: user.name ?? user.email,
              courseTitle: enrollment.course.title,
              certificateUrl: `${appUrl}/dashboard/certificates/${cert.id}`,
              credentialId: cert.credentialId,
              linkedInShareUrl: `https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(`${appUrl}/certificates/${cert.credentialId}`)}&title=${encodeURIComponent(`I completed ${enrollment.course.title} on AgenticAcademy`)}`,
              dashboardUrl: `${appUrl}/dashboard`,
            }),
          });
        }
      }
    } else {
      // Module completion nudge (opt-outable)
      const user = await db.user.findUnique({
        where: { id: session.user.id! },
        select: { email: true, name: true, emailPreference: true },
      });
      const nudgesEnabled = user?.emailPreference?.nudges !== false;
      if (user?.email && nudgesEnabled) {
        const completedModule = enrollment.course.modules.find((m) => m.id === moduleId);
        const nextModule = enrollment.course.modules
          .filter((m) => m.id !== moduleId)
          .sort((a, b) => a.order - b.order)
          .find((m) => m.order > (completedModule?.order ?? 0));
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://agentic.academy";
        sendEmail({
          to: user.email,
          subject: `Module complete: ${completedModule?.title ?? "module"}`,
          type: "module_completion",
          userId: session.user.id,
          template: React.createElement(ModuleCompletionEmail, {
            name: user.name ?? user.email,
            moduleTitle: completedModule?.title ?? "the module",
            nextModuleTitle: nextModule?.title,
            nextModuleUrl: nextModule
              ? `${appUrl}/courses/${enrollment.course.slug}`
              : undefined,
            courseUrl: `${appUrl}/courses/${enrollment.course.slug}`,
          }),
        });
      }
    }
  }

  return {};
}
