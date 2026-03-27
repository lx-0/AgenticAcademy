import { NextRequest, NextResponse } from "next/server";
import { db } from "@agentic-academy/db";
import { sendEmail } from "@/lib/resend";
import { AdminDigestEmail } from "@/emails/admin-digest";
import * as React from "react";

const DROP_OFF_THRESHOLDS: Record<string, number> = {
  "signup→profile_setup": 0.20,
  "profile_setup→pre_assessment_started": 0.25,
  "pre_assessment_completed→course_enrolled": 0.30,
  "module_started→module_completed": 0.35,
  "course_completed→cert_downloaded": 0.15,
};

const FUNNEL_STAGES = [
  "signup", "profile_setup", "pre_assessment_started", "pre_assessment_completed",
  "course_enrolled", "module_started", "module_completed", "course_completed", "cert_downloaded",
] as const;

/**
 * POST /api/cron/admin-digest
 * Send weekly team progress digest to enterprise admin users.
 * Includes: completion stats, NPS trend, and drop-off funnel alerts.
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
  const weekEnding = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // ── NPS stats ────────────────────────────────────────────────────────────────
  const npsResponded = await db.npsSurvey.findMany({
    where: { status: "responded", score: { not: null }, respondedAt: { gte: oneWeekAgo } },
    select: { score: true },
  });
  const npsSent = await db.npsSurvey.count({
    where: { status: { in: ["sent", "responded"] }, sentAt: { gte: oneWeekAgo } },
  });
  const npsScores = npsResponded.map((s) => s.score as number);
  const promoters = npsScores.filter((s) => s >= 9).length;
  const detractors = npsScores.filter((s) => s <= 6).length;
  const npsScore =
    npsScores.length > 0
      ? Math.round(((promoters - detractors) / npsScores.length) * 100)
      : null;
  const npsResponseRate = npsSent > 0 ? Math.round((npsResponded.length / npsSent) * 100) : 0;

  // ── Funnel drop-off alerts (last 7 days) ─────────────────────────────────────
  const funnelCounts = await Promise.all(
    FUNNEL_STAGES.map(async (stage) => {
      const result = await db.funnelEvent.groupBy({
        by: ["userId"],
        where: { stage, occurredAt: { gte: oneWeekAgo } },
      });
      return { stage, uniqueUsers: result.length };
    })
  );

  const funnelAlerts: { stage: string; dropoffRate: number; threshold: number }[] = [];
  for (let i = 1; i < funnelCounts.length; i++) {
    const prev = funnelCounts[i - 1].uniqueUsers;
    const curr = funnelCounts[i].uniqueUsers;
    const dropoffRate = prev > 0 ? (prev - curr) / prev : 0;
    const key = `${funnelCounts[i - 1].stage}→${funnelCounts[i].stage}`;
    const threshold = DROP_OFF_THRESHOLDS[key];
    if (threshold !== undefined && dropoffRate > threshold) {
      funnelAlerts.push({ stage: key, dropoffRate, threshold });
    }
  }

  // ── Learner activity ──────────────────────────────────────────────────────────
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

  const totalLearners = await db.user.count({ where: { role: "learner" } });
  const completionsThisWeek = await db.enrollment.count({
    where: { status: "completed", completedAt: { gte: oneWeekAgo } },
  });

  const recentEnrollments = await db.enrollment.findMany({
    where: { updatedAt: { gte: oneWeekAgo } },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  const activeUserIds = new Set(recentEnrollments.map((e) => e.userId));

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
        npsScore,
        npsResponseRate,
        funnelAlerts,
      }),
    });
    sent++;
  }

  return NextResponse.json({ digestsSent: sent, npsScore, funnelAlerts: funnelAlerts.length });
}
