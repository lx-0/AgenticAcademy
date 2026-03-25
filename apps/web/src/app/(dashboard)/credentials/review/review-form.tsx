"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitReview } from "@/actions/credential";

interface Props {
  submissionId: string;
  triageScores?: {
    scoreWorkflow: number;
    scoreOutcome: number;
    scoreGovernance: number;
    scoreRole: number;
    totalScore: number;
    bucket: string;
    flagReason: string | null;
  } | null;
}

const CRITERIA = [
  {
    key: "scoreWorkflow" as const,
    label: "Workflow Change Specificity",
    desc: "Is a specific before/after change described? Could a reviewer replicate it?",
  },
  {
    key: "scoreOutcome" as const,
    label: "Outcome Evidence",
    desc: "Is there measurable or observable evidence the change made a difference?",
  },
  {
    key: "scoreGovernance" as const,
    label: "Governance & Compliance Awareness",
    desc: "Does the learner show awareness of oversight, auditability, or compliance?",
  },
  {
    key: "scoreRole" as const,
    label: "Role-Appropriate Application",
    desc: "Is this a real professional context? Not a sandbox or hypothetical?",
  },
] as const;

const SCORE_LABELS = ["Missing/Failing (0)", "Marginal (1)", "Passing (2)", "Exemplary (3)"];

export function ReviewForm({ submissionId, triageScores }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [scores, setScores] = useState({
    scoreWorkflow: triageScores?.scoreWorkflow ?? 2,
    scoreOutcome: triageScores?.scoreOutcome ?? 2,
    scoreGovernance: triageScores?.scoreGovernance ?? 2,
    scoreRole: triageScores?.scoreRole ?? 2,
  });
  const [decision, setDecision] = useState<"approved" | "revision_requested" | "rejected">("approved");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [isSpotCheck, setIsSpotCheck] = useState(false);

  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await submitReview({
        submissionId,
        ...scores,
        decision,
        feedbackMessage: feedbackMessage || undefined,
        isSpotCheck,
      });
      if (result.ok) {
        router.push("/credentials/review?reviewed=1");
        router.refresh();
      } else {
        setError(result.error ?? "Unknown error");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* AI triage context */}
      {triageScores && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
          <p className="font-medium text-blue-900 mb-2">
            AI Triage: {triageScores.totalScore}/12 —{" "}
            <span className="capitalize">
              {triageScores.bucket.replace(/_/g, " ")}
            </span>
          </p>
          {triageScores.flagReason && (
            <p className="text-red-700">
              <strong>Flag:</strong> {triageScores.flagReason}
            </p>
          )}
          <p className="text-blue-700 mt-1 text-xs">
            Scores pre-filled from triage — override as needed.
          </p>
        </div>
      )}

      {/* Scoring criteria */}
      <div className="space-y-5">
        {CRITERIA.map((c) => (
          <div key={c.key}>
            <div className="flex items-start justify-between gap-4 mb-1">
              <div>
                <p className="text-sm font-medium text-gray-900">{c.label}</p>
                <p className="text-xs text-gray-500">{c.desc}</p>
              </div>
              <span className="text-sm font-bold text-gray-900 shrink-0">
                {scores[c.key]}/3
              </span>
            </div>
            <div className="flex gap-2">
              {[0, 1, 2, 3].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setScores((s) => ({ ...s, [c.key]: val }))}
                  className={`flex-1 py-2 rounded-md text-xs font-medium border transition-colors ${
                    scores[c.key] === val
                      ? "bg-brand-600 text-white border-brand-600"
                      : "bg-white text-gray-700 border-gray-300 hover:border-brand-400"
                  }`}
                  title={SCORE_LABELS[val]}
                >
                  {val}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {SCORE_LABELS[scores[c.key]]}
            </p>
          </div>
        ))}
      </div>

      {/* Total score */}
      <div
        className={`flex items-center justify-between p-4 rounded-lg border ${
          totalScore >= 8
            ? "bg-green-50 border-green-200"
            : totalScore >= 6
            ? "bg-amber-50 border-amber-200"
            : "bg-red-50 border-red-200"
        }`}
      >
        <span className="text-sm font-medium text-gray-700">Total Score</span>
        <span className="text-xl font-bold text-gray-900">{totalScore}/12</span>
      </div>

      {/* Decision */}
      <div>
        <p className="text-sm font-medium text-gray-900 mb-2">Decision *</p>
        <div className="flex gap-3">
          {(
            [
              { value: "approved", label: "Approve", color: "green" },
              { value: "revision_requested", label: "Request Revision", color: "amber" },
              { value: "rejected", label: "Reject", color: "red" },
            ] as const
          ).map((opt) => (
            <label
              key={opt.value}
              className={`flex-1 cursor-pointer rounded-lg border-2 p-3 text-center text-sm font-medium transition-colors ${
                decision === opt.value
                  ? opt.color === "green"
                    ? "border-green-500 bg-green-50 text-green-800"
                    : opt.color === "amber"
                    ? "border-amber-500 bg-amber-50 text-amber-800"
                    : "border-red-500 bg-red-50 text-red-800"
                  : "border-gray-200 text-gray-600 hover:border-gray-400"
              }`}
            >
              <input
                type="radio"
                name="decision"
                value={opt.value}
                checked={decision === opt.value}
                onChange={() => setDecision(opt.value)}
                className="sr-only"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {/* Feedback message */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Feedback to learner{" "}
          {decision !== "approved" && (
            <span className="text-red-500">*</span>
          )}
        </label>
        <textarea
          rows={4}
          required={decision !== "approved"}
          value={feedbackMessage}
          onChange={(e) => setFeedbackMessage(e.target.value)}
          placeholder={
            decision === "approved"
              ? "Optional: add a note for the learner"
              : "Explain what needs to improve for the learner to resubmit or understand the rejection…"
          }
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {/* Spot-check */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={isSpotCheck}
          onChange={(e) => setIsSpotCheck(e.target.checked)}
        />
        <span className="text-sm text-gray-700">
          This is a spot-check of an AI auto-approved submission (mark for
          triage calibration)
        </span>
      </label>

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? "Submitting review…" : "Submit Review"}
      </button>
    </form>
  );
}
