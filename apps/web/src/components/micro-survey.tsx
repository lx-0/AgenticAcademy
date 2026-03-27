"use client";

import { useState, useEffect } from "react";

interface Props {
  moduleId: string;
}

const RATINGS = [1, 2, 3, 4, 5];
const RATING_LABELS: Record<number, string> = {
  1: "Poor",
  2: "Fair",
  3: "Good",
  4: "Great",
  5: "Excellent",
};

export function MicroSurvey({ moduleId }: Props) {
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/micro-survey/question?moduleId=${encodeURIComponent(moduleId)}`)
      .then((r) => r.json())
      .then((data: { questionId?: string; question?: string } | null) => {
        if (data?.questionId) {
          setQuestionId(data.questionId);
          setQuestion(data.question ?? null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [moduleId]);

  async function handleSubmit() {
    if (!rating || !questionId) return;
    try {
      await fetch("/api/micro-survey/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId, questionId, rating, comment }),
      });
    } catch {
      // fire-and-forget — don't surface errors to the user
    }
    setSubmitted(true);
  }

  if (loading || !question || dismissed) return null;

  if (submitted) {
    return (
      <div className="mt-4 bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex items-center gap-3 text-sm text-green-700">
        <span className="text-lg">✓</span>
        <span>Thanks for your feedback!</span>
      </div>
    );
  }

  return (
    <div className="mt-4 bg-brand-50 border border-brand-200 rounded-xl p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <p className="text-sm font-medium text-brand-900">{question}</p>
        <button
          onClick={() => setDismissed(true)}
          className="text-brand-400 hover:text-brand-600 text-lg leading-none shrink-0 mt-0.5"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>

      {/* Rating buttons 1–5 */}
      <div className="flex gap-2 mb-1">
        {RATINGS.map((r) => (
          <button
            key={r}
            onClick={() => setRating(r)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-all ${
              rating === r
                ? "bg-brand-600 text-white border-brand-600"
                : "bg-white text-gray-700 border-gray-300 hover:border-brand-400"
            }`}
            title={RATING_LABELS[r]}
          >
            {r}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-xs text-gray-400 mb-4 px-1">
        <span>Poor</span>
        <span>Excellent</span>
      </div>

      {rating !== null && (
        <>
          <textarea
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-brand-400 mb-3"
            rows={2}
            placeholder="Optional: add a comment..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
          />
          <button
            onClick={handleSubmit}
            className="w-full py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors"
          >
            Submit feedback
          </button>
        </>
      )}
    </div>
  );
}
