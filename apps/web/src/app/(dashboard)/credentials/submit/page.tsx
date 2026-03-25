import { auth } from "@/auth";
import { db } from "@agentic-academy/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SubmissionForm } from "./submission-form";

export const metadata = { title: "Submit Credential — AgenticAcademy" };

export default async function SubmitCredentialPage({
  searchParams,
}: {
  searchParams: { resubmit?: string };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;

  // Fetch enrolled modules for the module-selector
  const moduleProgress = await db.moduleProgress.findMany({
    where: {
      enrollment: { userId },
      status: { in: ["completed", "in_progress"] },
    },
    include: {
      module: {
        include: {
          course: { select: { title: true } },
        },
      },
    },
    orderBy: { module: { order: "asc" } },
  });

  const enrolledModules = moduleProgress.map((mp) => ({
    id: mp.moduleId,
    title: mp.module.title,
    courseTitle: mp.module.course.title,
  }));

  // Handle resubmission context
  let parentId: string | undefined;
  if (searchParams.resubmit) {
    const parent = await db.credentialSubmission.findUnique({
      where: { id: searchParams.resubmit },
    });
    if (parent && parent.userId === userId && parent.status === "revision_requested") {
      parentId = parent.id;
    }
  }

  if (enrolledModules.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="max-w-3xl mx-auto px-6 py-12">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
            <h2 className="text-lg font-semibold text-amber-900 mb-2">
              No modules in progress
            </h2>
            <p className="text-amber-700 text-sm mb-4">
              You need to complete at least one module before submitting a
              credential. The credential documents real workflow transformations
              from your professional work.
            </p>
            <Link
              href="/courses"
              className="inline-block px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700"
            >
              Browse courses
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            {parentId ? "Resubmit Your Credential" : "Submit Your Tier 1 Credential"}
          </h1>
          <p className="mt-2 text-gray-600 text-sm">
            Document a real agentic AI workflow transformation you implemented
            in your professional work. Minimum 300 words across all four
            sections. Submissions below threshold are returned without review.
          </p>
          {!parentId && (
            <div className="mt-4 flex gap-3">
              <Link
                href="/credentials"
                className="text-sm text-brand-600 hover:underline"
              >
                ← Back to my submissions
              </Link>
              <span className="text-gray-300">|</span>
              <a
                href="https://agenticacademy.com/credential-rubric"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-brand-600 hover:underline"
              >
                View scoring rubric
              </a>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <SubmissionForm
            enrolledModules={enrolledModules}
            parentId={parentId}
          />
        </div>

        {/* Rubric reminder */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">
            Scoring criteria (4 criteria × 3 points = 12 max)
          </h3>
          <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
            <li>
              <strong>Workflow Change Specificity</strong> — specific before/after
              described; replicable
            </li>
            <li>
              <strong>Outcome Evidence</strong> — measurable metric or observable
              impact
            </li>
            <li>
              <strong>Governance Awareness</strong> — oversight, auditability, or
              compliance consideration
            </li>
            <li>
              <strong>Role-Appropriate Application</strong> — real professional
              context, not sandbox
            </li>
          </ul>
          <p className="mt-2 text-xs text-blue-700">
            Pass threshold: 8/12. Score 6–7: revise and resubmit (free once).
            Score 5 or below: rejected with feedback.
          </p>
        </div>
      </main>
    </div>
  );
}

function Header() {
  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">AA</span>
          </div>
          <span className="font-semibold text-gray-900">AgenticAcademy</span>
        </Link>
        <Link href="/credentials" className="text-sm text-gray-600 hover:text-gray-900">
          My Credentials
        </Link>
      </div>
    </header>
  );
}
