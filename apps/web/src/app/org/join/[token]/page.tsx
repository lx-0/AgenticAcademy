import { auth } from "@/auth";
import { db } from "@agentic-academy/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { useInviteAction } from "@/actions/organization";

export const metadata = { title: "Join Organization — AgenticAcademy" };

export default async function JoinOrgPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await auth();

  // Validate the invite token first (before requiring login)
  const invite = await db.orgInvite.findUnique({
    where: { token },
    include: { org: { select: { name: true } } },
  });

  // Token not found
  if (!invite) {
    return (
      <ErrorPage
        title="Invite not found"
        message="This invite link doesn't exist. Ask your organization admin to generate a new one."
      />
    );
  }

  // Token used
  if (invite.usedAt) {
    return (
      <ErrorPage
        title="Invite already used"
        message="This invite link has already been redeemed. Ask your organization admin for a new one."
      />
    );
  }

  // Token expired
  if (invite.expiresAt < new Date()) {
    return (
      <ErrorPage
        title="Invite expired"
        message="This invite link has expired. Ask your organization admin to generate a fresh one."
      />
    );
  }

  // Not logged in — redirect to register/login with return URL
  if (!session?.user?.id) {
    const returnUrl = encodeURIComponent(`/org/join/${token}`);
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 max-w-sm w-full text-center">
          <div className="w-12 h-12 rounded-xl bg-brand-600 flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold">AA</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Join {invite.org.name}
          </h1>
          <p className="text-sm text-gray-600 mb-6">
            Sign in or create an account to join this organization.
          </p>
          <div className="space-y-3">
            <Link
              href={`/register?returnUrl=${returnUrl}`}
              className="block w-full py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
            >
              Create account
            </Link>
            <Link
              href={`/login?returnUrl=${returnUrl}`}
              className="block w-full py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Email-specific invite — check mismatch
  if (invite.email) {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { email: true },
    });
    if (!user || user.email.toLowerCase() !== invite.email.toLowerCase()) {
      return (
        <ErrorPage
          title="Wrong account"
          message={`This invite is for ${invite.email}. Please sign in with that account to accept.`}
        />
      );
    }
  }

  // Check if already a member
  const existing = await db.orgMembership.findUnique({
    where: { orgId_userId: { orgId: invite.orgId, userId: session.user.id } },
  });

  if (existing) {
    redirect("/dashboard/team");
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 max-w-sm w-full text-center">
        <div className="w-12 h-12 rounded-xl bg-brand-600 flex items-center justify-center mx-auto mb-4">
          <span className="text-white font-bold">AA</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          Join {invite.org.name}
        </h1>
        <p className="text-sm text-gray-600 mb-2">
          You&apos;ve been invited to join as a{" "}
          <span className="font-medium">{invite.role.replace("_", " ")}</span>.
        </p>
        <p className="text-xs text-gray-400 mb-6">
          Expires {invite.expiresAt.toLocaleDateString()}
        </p>

        <form
          action={async () => {
            "use server";
            // eslint-disable-next-line react-hooks/rules-of-hooks
            const result = await useInviteAction(token);
            if (!result.error) redirect("/dashboard/team");
            // On error, just go to team page — they'll see a message there
            redirect("/dashboard/team");
          }}
        >
          <button
            type="submit"
            className="w-full py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
          >
            Accept invitation
          </button>
        </form>

        <Link
          href="/dashboard"
          className="block mt-3 text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          Maybe later
        </Link>
      </div>
    </div>
  );
}

function ErrorPage({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 max-w-sm w-full text-center">
        <div className="text-4xl mb-4">🔗</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">{title}</h1>
        <p className="text-sm text-gray-600 mb-6">{message}</p>
        <Link
          href="/dashboard"
          className="inline-block px-6 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
