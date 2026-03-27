import { NextRequest, NextResponse } from "next/server";
import { db } from "@agentic-academy/db";
import { sendEmail } from "@/lib/resend";
import { NpsSurveyEmail } from "@/emails/nps-survey";
import * as React from "react";

/**
 * POST /api/cron/nps-trigger
 * Daily cron: find enrollments completed 24h ago, schedule NPS surveys, and send emails.
 *
 * Invoke via Railway/Vercel cron:
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

  const now = new Date();
  const windowStart = new Date(now.getTime() - 25 * 60 * 60 * 1000); // 25h ago (1h buffer)
  const windowEnd = new Date(now.getTime() - 23 * 60 * 60 * 1000);   // 23h ago

  // Find enrollments completed in the 24h window that don't yet have an NPS survey
  const completedEnrollments = await db.enrollment.findMany({
    where: {
      status: "completed",
      completedAt: { gte: windowStart, lte: windowEnd },
      npsSurvey: null,
    },
    include: {
      user: {
        select: { id: true, email: true, name: true, emailPreference: { select: { nudges: true } } },
      },
      course: { select: { title: true, slug: true } },
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://agentic.academy";
  let created = 0;
  let sent = 0;

  for (const enrollment of completedEnrollments) {
    const { user, course } = enrollment;
    if (!user.email) continue;

    // Create NPS survey record
    const survey = await db.npsSurvey.create({
      data: {
        userId: user.id,
        enrollmentId: enrollment.id,
        scheduledAt: now,
        status: "pending",
      },
    });
    created++;

    // Send email (respects nudge preferences)
    if (user.emailPreference?.nudges !== false) {
      const surveyUrl = `${appUrl}/nps/${survey.id}`;
      sendEmail({
        to: user.email,
        subject: `How was ${course.title}? Share your feedback`,
        type: "nps_survey",
        userId: user.id,
        template: React.createElement(NpsSurveyEmail, {
          name: user.name ?? user.email,
          courseTitle: course.title,
          surveyUrl,
        }),
      });

      await db.npsSurvey.update({
        where: { id: survey.id },
        data: { status: "sent", sentAt: now },
      });
      sent++;
    }
  }

  return NextResponse.json({ created, sent });
}
