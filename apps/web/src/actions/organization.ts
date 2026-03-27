"use server";

import { auth } from "@/auth";
import { db } from "@agentic-academy/db";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function requireOrgAdmin(userId: string, orgId: string) {
  const membership = await db.orgMembership.findUnique({
    where: { orgId_userId: { orgId, userId } },
  });
  if (!membership || !["org_admin", "manager"].includes(membership.role)) {
    return null;
  }
  return membership;
}

export async function createOrgAction(
  formData: FormData
): Promise<{ error?: string; orgId?: string }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const domain = String(formData.get("domain") ?? "").trim() || null;

  if (!name) return { error: "Organization name is required" };

  const org = await db.organization.create({
    data: {
      name,
      domain: domain ?? undefined,
      memberships: { create: { userId: session.user.id, role: "org_admin" } },
    },
  });

  revalidatePath("/dashboard/team");
  return { orgId: org.id };
}

export async function generateInviteLinkAction(
  orgId: string,
  role: "org_admin" | "manager" | "learner" = "learner"
): Promise<{ token?: string; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await requireOrgAdmin(session.user.id, orgId);
  if (!membership) return { error: "Not authorized" };

  const invite = await db.orgInvite.create({
    data: {
      orgId,
      role,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  });

  return { token: invite.token };
}

export async function useInviteAction(
  token: string
): Promise<{ error?: string; orgId?: string }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const invite = await db.orgInvite.findUnique({ where: { token } });
  if (!invite) return { error: "Invite not found" };
  if (invite.usedAt) return { error: "This invite has already been used" };
  if (invite.expiresAt < new Date()) return { error: "This invite has expired" };

  if (invite.email) {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { email: true },
    });
    if (!user || user.email.toLowerCase() !== invite.email.toLowerCase()) {
      return { error: "This invite is for a different email address" };
    }
  }

  await db.orgMembership.upsert({
    where: { orgId_userId: { orgId: invite.orgId, userId: session.user.id } },
    create: { orgId: invite.orgId, userId: session.user.id, role: invite.role },
    update: {},
  });

  await db.orgInvite.update({
    where: { id: invite.id },
    data: { usedAt: new Date() },
  });

  revalidatePath("/dashboard/team");
  return { orgId: invite.orgId };
}

export async function bulkEnrollAction(
  formData: FormData
): Promise<{ error?: string; successCount?: number; failedCount?: number }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const orgId = String(formData.get("orgId") ?? "");
  const courseId = String(formData.get("courseId") ?? "");
  const memberIdsRaw = String(formData.get("memberIds") ?? "");

  const membership = await requireOrgAdmin(session.user.id, orgId);
  if (!membership) return { error: "Not authorized" };

  const memberIds = memberIdsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!memberIds.length) return { error: "No members selected" };

  const course = await db.course.findUnique({ where: { id: courseId } });
  if (!course || course.status !== "published") return { error: "Course not found" };

  const orgMembers = await db.orgMembership.findMany({
    where: { orgId, userId: { in: memberIds } },
    select: { userId: true },
  });
  const validIds = orgMembers.map((m) => m.userId);

  const bulk = await db.bulkEnrollment.create({
    data: {
      orgId,
      courseId,
      requestedBy: session.user.id,
      totalCount: validIds.length,
      status: "processing",
    },
  });

  let successCount = 0;
  let failedCount = 0;
  const results: { userId: string; status: string; enrollmentId?: string }[] = [];

  for (const userId of validIds) {
    try {
      const enrollment = await db.enrollment.upsert({
        where: { userId_courseId: { userId, courseId } },
        create: { userId, courseId },
        update: {},
      });
      results.push({ userId, status: "enrolled", enrollmentId: enrollment.id });
      successCount++;
    } catch {
      results.push({ userId, status: "failed" });
      failedCount++;
    }
  }

  await db.bulkEnrollment.update({
    where: { id: bulk.id },
    data: { status: "completed", successCount, failedCount, completedAt: new Date(), results },
  });

  revalidatePath("/dashboard/team");
  return { successCount, failedCount };
}

export async function createTrackAction(
  formData: FormData
): Promise<{ error?: string; trackId?: string }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const orgId = String(formData.get("orgId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const courseIdsRaw = String(formData.get("courseIds") ?? "");
  const roleTarget = String(formData.get("roleTarget") ?? "").trim() || null;

  if (!name) return { error: "Track name required" };

  const membership = await requireOrgAdmin(session.user.id, orgId);
  if (!membership) return { error: "Not authorized" };

  const courseIds = courseIdsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  if (!courseIds.length) return { error: "Select at least one course" };

  const track = await db.learningTrack.create({
    data: { orgId, name, description, courseIds, roleTarget },
  });

  revalidatePath("/dashboard/team");
  return { trackId: track.id };
}
