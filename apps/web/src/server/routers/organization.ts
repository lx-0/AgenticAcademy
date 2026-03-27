import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import { db } from "@agentic-academy/db";
import { TRPCError } from "@trpc/server";

const ORG_INVITE_TTL_DAYS = 7;

// Helper — resolve orgId + assert the caller has the required role
async function requireOrgRole(
  userId: string,
  orgId: string,
  roles: ("org_admin" | "manager" | "learner")[]
) {
  const membership = await db.orgMembership.findUnique({
    where: { orgId_userId: { orgId, userId } },
  });
  if (!membership || !roles.includes(membership.role as "org_admin" | "manager" | "learner")) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Insufficient organization role",
    });
  }
  return membership;
}

export const organizationRouter = createTRPCRouter({
  // ── Create an organization ───────────────────────────────────────────────
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        domain: z.string().optional(), // e.g. "company.com"
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id!;

      const org = await db.organization.create({
        data: {
          name: input.name,
          domain: input.domain ?? null,
          memberships: {
            create: { userId, role: "org_admin" },
          },
        },
        include: { memberships: true },
      });

      return org;
    }),

  // ── Get the caller's org (first org they belong to) ─────────────────────
  myOrg: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id!;

    const membership = await db.orgMembership.findFirst({
      where: { userId },
      include: {
        org: {
          include: {
            memberships: {
              include: {
                user: { select: { id: true, name: true, email: true, role: true } },
              },
            },
            tracks: true,
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    });

    return membership ?? null;
  }),

  // ── List members with enrollment stats ───────────────────────────────────
  getMembers: protectedProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id!;
      await requireOrgRole(userId, input.orgId, ["org_admin", "manager"]);

      const memberships = await db.orgMembership.findMany({
        where: { orgId: input.orgId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              enrollments: {
                select: {
                  id: true,
                  status: true,
                  courseId: true,
                  completedAt: true,
                  course: { select: { title: true, slug: true } },
                  progress: { select: { status: true } },
                },
              },
              trackAssignments: {
                select: {
                  track: { select: { id: true, name: true, courseIds: true } },
                },
              },
            },
          },
        },
        orderBy: { joinedAt: "asc" },
      });

      return memberships.map((m) => ({
        userId: m.userId,
        role: m.role,
        joinedAt: m.joinedAt,
        name: m.user.name,
        email: m.user.email,
        enrollments: m.user.enrollments,
        tracks: m.user.trackAssignments.map((ta) => ta.track),
      }));
    }),

  // ── Generate a generic invite link ───────────────────────────────────────
  generateInviteLink: protectedProcedure
    .input(
      z.object({
        orgId: z.string(),
        role: z.enum(["org_admin", "manager", "learner"]).default("learner"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id!;
      await requireOrgRole(userId, input.orgId, ["org_admin"]);

      const invite = await db.orgInvite.create({
        data: {
          orgId: input.orgId,
          role: input.role,
          expiresAt: new Date(Date.now() + ORG_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
        },
      });

      return { token: invite.token, expiresAt: invite.expiresAt };
    }),

  // ── Invite a specific email address ──────────────────────────────────────
  inviteByEmail: protectedProcedure
    .input(
      z.object({
        orgId: z.string(),
        email: z.string().email(),
        role: z.enum(["org_admin", "manager", "learner"]).default("learner"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id!;
      await requireOrgRole(userId, input.orgId, ["org_admin", "manager"]);

      // Revoke any existing unused invite for this email in this org
      await db.orgInvite.deleteMany({
        where: { orgId: input.orgId, email: input.email, usedAt: null },
      });

      const invite = await db.orgInvite.create({
        data: {
          orgId: input.orgId,
          email: input.email,
          role: input.role,
          expiresAt: new Date(Date.now() + ORG_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
        },
      });

      return { token: invite.token, expiresAt: invite.expiresAt };
    }),

  // ── Redeem an invite token ────────────────────────────────────────────────
  useInvite: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id!;

      const invite = await db.orgInvite.findUnique({ where: { token: input.token } });
      if (!invite) throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found" });
      if (invite.usedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Invite already used" });
      if (invite.expiresAt < new Date())
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invite has expired" });

      // If email-specific, verify match
      if (invite.email) {
        const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
        if (!user || user.email.toLowerCase() !== invite.email.toLowerCase()) {
          throw new TRPCError({ code: "FORBIDDEN", message: "This invite is for a different email address" });
        }
      }

      // Join org (upsert to handle re-join gracefully)
      const membership = await db.orgMembership.upsert({
        where: { orgId_userId: { orgId: invite.orgId, userId } },
        create: { orgId: invite.orgId, userId, role: invite.role },
        update: {},
      });

      // Mark invite as used
      await db.orgInvite.update({
        where: { id: invite.id },
        data: { usedAt: new Date() },
      });

      return { orgId: invite.orgId, membership };
    }),

  // ── Bulk enroll org members in a course ──────────────────────────────────
  bulkEnroll: protectedProcedure
    .input(
      z.object({
        orgId: z.string(),
        courseId: z.string(),
        memberIds: z.array(z.string()).min(1).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const requesterId = ctx.session.user.id!;
      await requireOrgRole(requesterId, input.orgId, ["org_admin", "manager"]);

      const course = await db.course.findUnique({ where: { id: input.courseId } });
      if (!course || course.status !== "published") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found or not published" });
      }

      // Verify all memberIds belong to this org
      const orgMembers = await db.orgMembership.findMany({
        where: { orgId: input.orgId, userId: { in: input.memberIds } },
        select: { userId: true },
      });
      const validMemberIds = new Set(orgMembers.map((m) => m.userId));

      // Create bulk enrollment record
      const bulk = await db.bulkEnrollment.create({
        data: {
          orgId: input.orgId,
          courseId: input.courseId,
          requestedBy: requesterId,
          totalCount: validMemberIds.size,
          status: "processing",
        },
      });

      // Process enrollments
      const results: { userId: string; status: string; enrollmentId?: string }[] = [];
      let successCount = 0;
      let failedCount = 0;

      for (const userId of validMemberIds) {
        try {
          const enrollment = await db.enrollment.upsert({
            where: { userId_courseId: { userId, courseId: input.courseId } },
            create: { userId, courseId: input.courseId },
            update: {},
          });
          results.push({ userId, status: "enrolled", enrollmentId: enrollment.id });
          successCount++;
        } catch {
          results.push({ userId, status: "failed" });
          failedCount++;
        }
      }

      // Update bulk enrollment record
      const updated = await db.bulkEnrollment.update({
        where: { id: bulk.id },
        data: {
          status: "completed",
          successCount,
          failedCount,
          completedAt: new Date(),
          results,
        },
      });

      return updated;
    }),

  // ── Create a learning track ───────────────────────────────────────────────
  createTrack: protectedProcedure
    .input(
      z.object({
        orgId: z.string(),
        name: z.string().min(1).max(100),
        description: z.string().optional(),
        courseIds: z.array(z.string()).min(1),
        roleTarget: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id!;
      await requireOrgRole(userId, input.orgId, ["org_admin", "manager"]);

      return db.learningTrack.create({
        data: {
          orgId: input.orgId,
          name: input.name,
          description: input.description ?? null,
          courseIds: input.courseIds,
          roleTarget: input.roleTarget ?? null,
        },
      });
    }),

  // ── Assign a track to members ─────────────────────────────────────────────
  assignTrack: protectedProcedure
    .input(
      z.object({
        orgId: z.string(),
        trackId: z.string(),
        memberIds: z.array(z.string()).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id!;
      await requireOrgRole(userId, input.orgId, ["org_admin", "manager"]);

      // Verify track belongs to org
      const track = await db.learningTrack.findFirst({
        where: { id: input.trackId, orgId: input.orgId },
      });
      if (!track) throw new TRPCError({ code: "NOT_FOUND", message: "Track not found" });

      // Upsert assignments
      await db.trackAssignment.createMany({
        data: input.memberIds.map((memberId) => ({
          trackId: input.trackId,
          userId: memberId,
        })),
        skipDuplicates: true,
      });

      return { trackId: input.trackId, assigned: input.memberIds.length };
    }),

  // ── Team progress dashboard data ─────────────────────────────────────────
  teamProgress: protectedProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id!;
      await requireOrgRole(userId, input.orgId, ["org_admin", "manager"]);

      const memberships = await db.orgMembership.findMany({
        where: { orgId: input.orgId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              enrollments: {
                select: {
                  id: true,
                  status: true,
                  courseId: true,
                  enrolledAt: true,
                  completedAt: true,
                  course: { select: { title: true, slug: true } },
                  progress: { select: { status: true } },
                  certificate: { select: { id: true } },
                },
              },
            },
          },
        },
      });

      const totalMembers = memberships.length;
      let totalEnrollments = 0;
      let totalCompleted = 0;

      const memberStats = memberships.map((m) => {
        const enrollments = m.user.enrollments;
        const completed = enrollments.filter((e) => e.status === "completed").length;
        totalEnrollments += enrollments.length;
        totalCompleted += completed;

        return {
          userId: m.userId,
          name: m.user.name,
          email: m.user.email,
          role: m.role,
          enrollmentCount: enrollments.length,
          completedCount: completed,
          certificates: enrollments.filter((e) => e.certificate).length,
          enrollments,
        };
      });

      // Course-level aggregates
      const courseMap = new Map<
        string,
        { title: string; slug: string; enrolledCount: number; completedCount: number }
      >();
      for (const m of memberships) {
        for (const e of m.user.enrollments) {
          const existing = courseMap.get(e.courseId);
          if (existing) {
            existing.enrolledCount++;
            if (e.status === "completed") existing.completedCount++;
          } else {
            courseMap.set(e.courseId, {
              title: e.course.title,
              slug: e.course.slug,
              enrolledCount: 1,
              completedCount: e.status === "completed" ? 1 : 0,
            });
          }
        }
      }

      return {
        totalMembers,
        totalEnrollments,
        totalCompleted,
        completionRate: totalEnrollments > 0 ? Math.round((totalCompleted / totalEnrollments) * 100) : 0,
        memberStats,
        courseBreakdown: Array.from(courseMap.entries()).map(([id, data]) => ({ courseId: id, ...data })),
      };
    }),

  // ── List bulk enrollment history ─────────────────────────────────────────
  bulkEnrollHistory: protectedProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id!;
      await requireOrgRole(userId, input.orgId, ["org_admin", "manager"]);

      return db.bulkEnrollment.findMany({
        where: { orgId: input.orgId },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
    }),
});
