import { NextRequest, NextResponse } from "next/server";
import { db } from "@agentic-academy/db";
import { sendEmail } from "@/lib/resend";
import { ProgressNudgeEmail } from "@/emails/progress-nudge";
import * as React from "react";

/**
 * POST /api/cron/nudge
 * Send progress nudge emails to learners who haven't logged in for 7+ days
 * while they have active enrollments.
 *
 * Invoke via a cron service (e.g. Railway cron, Vercel cron) with:
 *   Authorization: Bearer <CRON_SECRET>
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://agentic.academy";

  // Find users with active enrollments who haven't logged in for 7+ days.
  // We use updatedAt on the enrollment as a proxy for last activity.
  const staleEnrollments = await db.enrollment.findMany({
    where: {
      status: "active",
      updatedAt: { lte: sevenDaysAgo },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          emailPreference: { select: { nudges: true } },
        },
      },
      course: { select: { title: true, slug: true } },
      progress: {
        where: { status: "in_progress" },
        include: { module: { select: { title: true } } },
        take: 1,
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  let sent = 0;
  for (const enrollment of staleEnrollments) {
    const { user, course } = enrollment;
    if (!user.email) continue;
    if (user.emailPreference?.nudges === false) continue;

    // Deduplicate: don't send if we already sent a nudge for this enrollment this week
    const recentNudge = await db.emailLog.findFirst({
      where: {
        userId: user.id,
        type: "progress_nudge",
        createdAt: { gte: sevenDaysAgo },
      },
    });
    if (recentNudge) continue;

    const lastModule = enrollment.progress[0]?.module;
    sendEmail({
      to: user.email,
      subject: `Ready to continue ${course.title}?`,
      type: "progress_nudge",
      userId: user.id,
      template: React.createElement(ProgressNudgeEmail, {
        name: user.name ?? user.email,
        courseTitle: course.title,
        resumeUrl: `${appUrl}/courses/${course.slug}`,
        lastModuleTitle: lastModule?.title,
      }),
    });
    sent++;
  }

  return NextResponse.json({ nudgesSent: sent });
}
