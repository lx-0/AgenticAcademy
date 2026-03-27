"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

const SCORES = Array.from({ length: 11 }, (_, i) => i); // 0–10

export default function NpsSurveyPage() {
  const { surveyId } = useParams<{ surveyId: string }>();
  const [step, setStep] = useState<"score" | "followup" | "done">("score");
  const [score, setScore] = useState<number | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [improveText, setImproveText] = useState("");
  const [recommendText, setRecommendText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitScore() {
    if (score === null) return;
    setStep("followup");
  }

  async function submitFull() {
    if (score === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/nps/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surveyId, score, reasonText, improveText, recommendText }),
      });
      if (!res.ok) throw new Error("Submission failed");
      setStep("done");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const scoreColor = (s: number) =>
    s >= 9 ? "bg-green-500 text-white" : s >= 7 ? "bg-yellow-400 text-gray-900" : "bg-red-400 text-white";

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 w-full max-w-lg">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">AA</span>
          </div>
        </div>

        {step === "done" && (
          <div className="text-center">
            <div className="text-4xl mb-4">🙏</div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Thank you for your feedback!</h1>
            <p className="text-gray-500">Your response helps us improve AgenticAcademy for everyone.</p>
            <a
              href="/dashboard"
              className="mt-6 inline-block px-6 py-2.5 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 transition-colors"
            >
              Back to dashboard
            </a>
          </div>
        )}

        {step === "score" && (
          <>
            <h1 className="text-xl font-bold text-gray-900 text-center mb-2">
              How likely are you to recommend AgenticAcademy to a colleague?
            </h1>
            <p className="text-sm text-gray-500 text-center mb-8">
              0 = Not at all likely · 10 = Extremely likely
            </p>

            <div className="flex flex-wrap justify-center gap-2 mb-8">
              {SCORES.map((s) => (
                <button
                  key={s}
                  onClick={() => setScore(s)}
                  className={`w-10 h-10 rounded-lg font-bold text-sm transition-all ${
                    score === s
                      ? scoreColor(s) + " ring-2 ring-offset-2 ring-brand-400 scale-110"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            <button
              onClick={submitScore}
              disabled={score === null}
              className="w-full py-3 bg-brand-600 text-white font-semibold rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </>
        )}

        {step === "followup" && (
          <>
            <h1 className="text-xl font-bold text-gray-900 text-center mb-6">
              A couple more questions (optional)
            </h1>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  What&apos;s the main reason for your score of <strong>{score}</strong>?
                </label>
                <textarea
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-400"
                  rows={3}
                  placeholder="Tell us what influenced your score..."
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  maxLength={1000}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  What could we improve?
                </label>
                <textarea
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-400"
                  rows={3}
                  placeholder="Any suggestions for making the experience better..."
                  value={improveText}
                  onChange={(e) => setImproveText(e.target.value)}
                  maxLength={1000}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Would you recommend AgenticAcademy to a colleague? Why?
                </label>
                <textarea
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-400"
                  rows={3}
                  placeholder="How would you describe us to someone else..."
                  value={recommendText}
                  onChange={(e) => setRecommendText(e.target.value)}
                  maxLength={1000}
                />
              </div>
            </div>

            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setStep("score")}
                className="flex-1 py-2.5 border border-gray-300 text-gray-600 font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={submitFull}
                disabled={submitting}
                className="flex-1 py-2.5 bg-brand-600 text-white font-semibold rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-60"
              >
                {submitting ? "Submitting…" : "Submit feedback"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
