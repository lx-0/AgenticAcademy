import { auth } from "@/auth";
import { db } from "@agentic-academy/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ReviewForm } from "./review-form";

export const metadata = { title: "Review Queue — AgenticAcademy" };

export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams: { id?: string; reviewed?: string };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const reviewer = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });

  if (!reviewer || (reviewer.role !== "reviewer" && reviewer.role !== "admin")) {
    notFound();
  }

  // If reviewing a specific submission
  if (searchParams.id) {
    return <ReviewDetail submissionId={searchParams.id} />;
  }

  return <ReviewQueue reviewed={searchParams.reviewed === "1"} />;
}

async function ReviewQueue({ reviewed }: { reviewed: boolean }) {
  const queue = await db.credentialSubmission.findMany({
    where: { status: "pending_review" },
    include: {
      triageResult: true,
      user: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">AA</span>
            </div>
            <span className="font-semibold text-gray-900">AgenticAcademy</span>
          </Link>
          <span className="text-sm text-gray-500">Reviewer Queue</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Credential Review Queue
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              {queue.length} submission{queue.length !== 1 ? "s" : ""} pending
              review
            </p>
          </div>
        </div>

        {reviewed && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 text-green-800 text-sm">
            ✓ Review submitted successfully.
          </div>
        )}

        {queue.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
            <p className="text-gray-500 text-sm">
              No submissions pending review. Check back later.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {queue.map((sub) => (
              <Link
                key={sub.id}
                href={`/credentials/review?id=${sub.id}`}
                className="block bg-white rounded-xl border border-gray-200 p-5 hover:border-brand-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">
                        {sub.submitterRole} · {sub.industry}
                      </p>
                      {sub.triageResult && (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            sub.triageResult.bucket === "flag_rejection"
                              ? "bg-red-100 text-red-800"
                              : sub.triageResult.bucket === "standard_review"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-green-100 text-green-800"
                          }`}
                        >
                          {sub.triageResult.bucket.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {sub.user.name ?? sub.user.email} ·{" "}
                      {new Date(sub.createdAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      · {sub.wordCount} words · Attempt {sub.attempt}
                    </p>
                    {sub.triageResult && (
                      <p className="mt-1.5 text-xs text-gray-600">
                        AI score:{" "}
                        <strong>{sub.triageResult.totalScore}/12</strong>
                        {sub.triageResult.flagReason && (
                          <span className="ml-2 text-red-600">
                            Flag: {sub.triageResult.flagReason}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-brand-600 font-medium shrink-0">
                    Review →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

async function ReviewDetail({ submissionId }: { submissionId: string }) {
  const sub = await db.credentialSubmission.findUnique({
    where: { id: submissionId },
    include: {
      triageResult: true,
      user: { select: { name: true, email: true } },
      parent: true,
    },
  });

  if (!sub || sub.status !== "pending_review") notFound();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">AA</span>
            </div>
            <span className="font-semibold text-gray-900">AgenticAcademy</span>
          </Link>
          <Link
            href="/credentials/review"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            ← Back to queue
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex gap-8">
          {/* Left: Submission content */}
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="mb-5 pb-5 border-b border-gray-100">
                <h1 className="text-lg font-bold text-gray-900">
                  Submission Review
                </h1>
                <div className="mt-1 flex items-center gap-3 text-sm text-gray-600 flex-wrap">
                  <span>
                    <strong>{sub.user.name ?? sub.user.email}</strong>
                  </span>
                  <span>·</span>
                  <span>{sub.submitterRole}</span>
                  <span>·</span>
                  <span>{sub.industry}</span>
                  <span>·</span>
                  <span>{sub.wordCount} words</span>
                  <span>·</span>
                  <span>
                    Attempt {sub.attempt}
                    {sub.parentId ? " (resubmission)" : ""}
                  </span>
                </div>
              </div>

              <Section title="Section 1 — Before State" body={sub.beforeState} />
              <Section title="Section 2 — What I Changed" body={sub.whatChanged} />
              <Section title="Section 3 — Outcome Evidence" body={sub.outcomeEvidence} />
              <Section
                title="Section 4 — Governance Awareness Statement"
                body={sub.governanceStatement}
              />

              {sub.attachmentUrl && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <a
                    href={sub.attachmentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-brand-600 hover:underline"
                  >
                    View attached file →
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Right: Review form */}
          <div className="w-80 shrink-0">
            <div className="bg-white rounded-xl border border-gray-200 p-5 sticky top-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">
                Your Review
              </h2>
              <ReviewForm
                submissionId={sub.id}
                triageScores={sub.triageResult}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{title}</h3>
      <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
        {body}
      </div>
    </div>
  );
}
