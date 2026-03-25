import { auth } from "@/auth";
import { db } from "@agentic-academy/db";
import { redirect } from "next/navigation";
import Link from "next/link";

export const metadata = { title: "My Credentials — AgenticAcademy" };

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_triage: { label: "Triage in progress", color: "bg-yellow-100 text-yellow-800" },
  pending_review: { label: "Under review", color: "bg-blue-100 text-blue-800" },
  approved: { label: "Approved", color: "bg-green-100 text-green-800" },
  revision_requested: { label: "Revision requested", color: "bg-orange-100 text-orange-800" },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-800" },
  payment_required: { label: "Payment required", color: "bg-gray-100 text-gray-700" },
};

export default async function CredentialsPage({
  searchParams,
}: {
  searchParams: { submitted?: string };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const submissions = await db.credentialSubmission.findMany({
    where: { userId: session.user.id, parentId: null },
    include: {
      triageResult: true,
      review: true,
      resubmissions: {
        include: { triageResult: true, review: true },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
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
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
              Dashboard
            </Link>
            <Link href="/courses" className="text-gray-600 hover:text-gray-900">
              Courses
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Tier 1 Credential
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              AgenticAcademy Practitioner — Workflow Certified
            </p>
          </div>
          <Link
            href="/credentials/submit"
            className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            New Submission
          </Link>
        </div>

        {searchParams.submitted === "1" && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 text-green-800 text-sm">
            ✓ Submission received. Our AI triage is processing it now —
            you&apos;ll see a status update shortly.
          </div>
        )}

        {submissions.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
            <div className="w-12 h-12 bg-brand-50 rounded-xl flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🎖️</span>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              No submissions yet
            </h2>
            <p className="text-gray-600 text-sm mb-6 max-w-sm mx-auto">
              Document a real agentic AI workflow transformation from your
              professional work to earn the Tier 1 credential.
            </p>
            <Link
              href="/credentials/submit"
              className="inline-block px-5 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700"
            >
              Start your submission
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {submissions.map((sub) => {
              const statusInfo = STATUS_LABELS[sub.status] ?? {
                label: sub.status,
                color: "bg-gray-100 text-gray-700",
              };
              const allVersions = [sub, ...sub.resubmissions];

              return (
                <div
                  key={sub.id}
                  className="bg-white rounded-xl border border-gray-200 p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {sub.submitterRole} · {sub.industry}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}
                        >
                          {statusInfo.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        Submitted{" "}
                        {new Date(sub.createdAt).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}{" "}
                        · {sub.wordCount} words
                      </p>

                      {/* Triage info */}
                      {sub.triageResult && (
                        <div className="mt-3 flex items-center gap-3 text-xs text-gray-600">
                          <span>
                            AI score:{" "}
                            <strong>{sub.triageResult.totalScore}/12</strong>
                          </span>
                          <span className="text-gray-300">·</span>
                          <span>
                            Bucket:{" "}
                            <strong>
                              {sub.triageResult.bucket.replace(/_/g, " ")}
                            </strong>
                          </span>
                          {sub.triageResult.flagReason && (
                            <>
                              <span className="text-gray-300">·</span>
                              <span className="text-red-600">
                                Flag: {sub.triageResult.flagReason}
                              </span>
                            </>
                          )}
                        </div>
                      )}

                      {/* Review feedback */}
                      {sub.review?.feedbackMessage && (
                        <div className="mt-3 bg-orange-50 border border-orange-100 rounded-lg p-3 text-sm text-orange-800">
                          <p className="font-medium mb-1">Reviewer feedback:</p>
                          <p>{sub.review.feedbackMessage}</p>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2 shrink-0">
                      {sub.status === "revision_requested" &&
                        allVersions.length < 3 && (
                          <Link
                            href={`/credentials/submit?resubmit=${sub.id}`}
                            className="px-3 py-1.5 bg-brand-600 text-white rounded-md text-xs font-medium hover:bg-brand-700 text-center"
                          >
                            {allVersions.length === 1
                              ? "Resubmit (free)"
                              : "Resubmit ($15 fee)"}
                          </Link>
                        )}
                    </div>
                  </div>

                  {/* Resubmission versions */}
                  {sub.resubmissions.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Previous attempts
                      </p>
                      {sub.resubmissions.map((resub) => {
                        const rs = STATUS_LABELS[resub.status] ?? {
                          label: resub.status,
                          color: "bg-gray-100 text-gray-700",
                        };
                        return (
                          <div
                            key={resub.id}
                            className="flex items-center gap-3 text-xs text-gray-600"
                          >
                            <span
                              className={`px-1.5 py-0.5 rounded-full text-xs ${rs.color}`}
                            >
                              {rs.label}
                            </span>
                            <span>
                              Attempt {resub.attempt} ·{" "}
                              {new Date(resub.createdAt).toLocaleDateString()}
                            </span>
                            {resub.triageResult && (
                              <span>
                                Score: {resub.triageResult.totalScore}/12
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Rubric reference */}
        <div className="mt-10 bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            How credentials are scored
          </h3>
          <div className="grid grid-cols-2 gap-3 text-xs text-gray-700 sm:grid-cols-4">
            {[
              { title: "Workflow Specificity", desc: "Before/after clearly described" },
              { title: "Outcome Evidence", desc: "Measurable or observable impact" },
              { title: "Governance Awareness", desc: "Oversight, audit, compliance" },
              { title: "Role-Appropriate", desc: "Real professional context" },
            ].map((c) => (
              <div
                key={c.title}
                className="bg-gray-50 rounded-lg p-3 border border-gray-100"
              >
                <p className="font-medium text-gray-900">{c.title}</p>
                <p className="mt-0.5 text-gray-600">{c.desc}</p>
                <p className="mt-1 text-gray-400">0–3 points</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Pass: 8+/12 · Revise &amp; Resubmit: 6–7 · Rejected: 5 or below
          </p>
        </div>
      </main>
    </div>
  );
}
