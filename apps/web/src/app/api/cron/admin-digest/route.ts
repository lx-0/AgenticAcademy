import { NextRequest, NextResponse } from "next/server";
import { db } from "@agentic-academy/db";
import { sendEmail } from "@/lib/resend";
import { AdminDigestEmail } from "@/emails/admin-digest";
import * as React from "react";

/**
 * POST /api/cron/admin-digest
 * Send weekly team progress digest to enterprise admin users.
 *
 * Invoke weekly via cron with:
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

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://agentic.academy";
  const weekEnding = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // Find all admin users with enterprise/enterprise_pilot tier
  const admins = await db.user.findMany({
    where: {
      role: "admin",
      subscriptionTier: { in: ["enterprise", "enterprise_pilot"] },
    },
    select: {
      id: true,
      email: true,
      name: true,
      emailPreference: { select: { digest: true } },
    },
  });

  // Org-level stats
  const totalLearners = await db.user.count({ where: { role: "learner" } });
  const completionsThisWeek = await db.enrollment.count({
    where: { status: "completed", completedAt: { gte: oneWeekAgo } },
  });

  // Enrollments updated this week (active learners)
  const recentEnrollments = await db.enrollment.findMany({
    where: { updatedAt: { gte: oneWeekAgo } },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  // Unique active user count
  const activeUserIds = new Set(recentEnrollments.map((e) => e.userId));

  // Build per-learner summary
  const learnerMap = new Map<
    string,
    { name: string; email: string; activeEnrollments: number; completedThisWeek: number }
  >();
  for (const e of recentEnrollments) {
    const key = e.user.id;
    const existing = learnerMap.get(key) ?? {
      name: e.user.name ?? e.user.email,
      email: e.user.email,
      activeEnrollments: 0,
      completedThisWeek: 0,
    };
    existing.activeEnrollments += e.status === "active" ? 1 : 0;
    existing.completedThisWeek +=
      e.status === "completed" && e.completedAt && e.completedAt >= oneWeekAgo ? 1 : 0;
    learnerMap.set(key, existing);
  }
  const learners = Array.from(learnerMap.values()).slice(0, 20);

  let sent = 0;
  for (const admin of admins) {
    if (!admin.email) continue;
    if (admin.emailPreference?.digest === false) continue;

    sendEmail({
      to: admin.email,
      subject: `AgenticAcademy weekly digest — ${weekEnding}`,
      type: "admin_digest",
      userId: admin.id,
      template: React.createElement(AdminDigestEmail, {
        orgName: "Your Organisation",
        weekEnding,
        totalLearners,
        activeThisWeek: activeUserIds.size,
        completionsThisWeek,
        learners,
      }),
    });
    sent++;
  }

  return NextResponse.json({ digestsSent: sent });
}
