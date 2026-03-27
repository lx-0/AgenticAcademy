/**
 * Entitlement helpers — enforce tier-based access limits.
 *
 * Tier rules:
 *   free             → 1 course max, no certificates
 *   pro              → unlimited courses + certificates
 *   enterprise_pilot → unlimited courses + certificates (time-gated via subscriptionEndsAt)
 *   enterprise       → unlimited courses + certificates
 */

import { db } from "@agentic-academy/db";

type Tier = "free" | "pro" | "enterprise_pilot" | "enterprise";

type TierInfo = {
  subscriptionTier: Tier;
  subscriptionEndsAt: Date | null;
};

/** Is the user on an active paid tier? */
export function isPaidTier(info: TierInfo): boolean {
  if (info.subscriptionTier === "free") return false;
  if (
    info.subscriptionTier === "enterprise_pilot" &&
    info.subscriptionEndsAt &&
    info.subscriptionEndsAt < new Date()
  ) {
    return false; // pilot expired
  }
  return true;
}

/** Can the user enroll in an additional course? */
export async function canEnrollCourse(userId: string, info: TierInfo): Promise<boolean> {
  if (isPaidTier(info)) return true;

  // Free tier: max 1 enrollment
  const count = await db.enrollment.count({ where: { userId } });
  return count < 1;
}

/** Can the user receive a certificate after completing a course? */
export function canAccessCertificate(info: TierInfo): boolean {
  return isPaidTier(info);
}

/** Can the user access team/org features? */
export function canAccessTeamFeatures(info: TierInfo): boolean {
  return (
    info.subscriptionTier === "enterprise_pilot" ||
    info.subscriptionTier === "enterprise"
  );
}

/** Human-readable tier label */
export function tierLabel(tier: Tier): string {
  switch (tier) {
    case "free":
      return "Starter (Free)";
    case "pro":
      return "Pro";
    case "enterprise_pilot":
      return "Enterprise Pilot";
    case "enterprise":
      return "Enterprise";
  }
}
