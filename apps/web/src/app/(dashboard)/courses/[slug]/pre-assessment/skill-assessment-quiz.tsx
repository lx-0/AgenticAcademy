"use client";

import { useState } from "react";
import { submitSkillAssessmentAction } from "@/actions/skill-assessment";
import { useRouter } from "next/navigation";

type Question = {
  skillName: string;
  question: string;
  options: string[];
};

type Props = {
  questions: Question[];
  enrollmentId: string;
  courseId: string;
  courseSlug: string;
  phase: "pre" | "post";
  redirectPath: string;
};

export function SkillAssessmentQuiz({
  questions,
  enrollmentId,
  courseId,
  courseSlug,
  phase,
  redirectPath,
}: Props) {
  const router = useRouter();
  const [answers, setAnswers] = useState<(number | null)[]>(
    Array(questions.length).fill(null)
  );
  const [result, setResult] = useState<{
    overallScore: number;
    scores: Array<{ skillName: string; score: number }>;
    review: Array<{
      skillName: string;
      question: string;
      options: string[];
      correctIndex: number;
      selectedIndex: number | undefined;
      explanation: string;
    }>;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allAnswered = answers.every((a) => a !== null);

  async function handleSubmit() {
    if (!allAnswered) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await submitSkillAssessmentAction(
        enrollmentId,
        courseId,
        phase,
        answers as number[]
      );
      if (res.error) {
        setError(res.error);
      } else {
        setResult(res);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-6">
        {/* Score summary */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
          <div className="text-5xl mb-3">
            {result.overallScore >= 80 ? "🌟" : result.overallScore >= 60 ? "📈" : "🌱"}
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">
            {phase === "pre" ? "Baseline captured!" : "Assessment complete!"}
          </h2>
          <p className="text-gray-600 mb-4">
            {phase === "pre"
              ? "We've recorded your current skill levels. After completing the course, you'll take a post-assessment to measure your improvement."
              : "Your post-course skill levels have been recorded. Check your improvement below."}
          </p>
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-brand-50 border-4 border-brand-200 mb-6">
            <span className="text-3xl font-bold text-brand-600">{result.overallScore}%</span>
          </div>

          {/* Per-skill scores */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6 text-left">
            {result.scores.map((s) => (
              <div
                key={s.skillName}
                className="bg-gray-50 rounded-xl border border-gray-200 p-4"
              >
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  {s.skillName}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-brand-500 h-2 rounded-full transition-all"
                      style={{ width: `${s.score}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-gray-700 w-10 text-right">
                    {s.score}%
                  </span>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => router.push(redirectPath)}
            className="px-8 py-3 bg-brand-600 text-white font-medium rounded-xl hover:bg-brand-700 transition-colors"
          >
            {phase === "pre" ? "Start Learning →" : "View My Certificate →"}
          </button>
        </div>

        {/* Answer review */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <h3 className="font-semibold text-gray-900 mb-4">Answer Review</h3>
          <div className="space-y-6">
            {result.review.map((item, i) => (
              <div key={i} className="border-b border-gray-100 pb-6 last:border-0 last:pb-0">
                <div className="text-xs font-semibold text-brand-600 uppercase tracking-wide mb-1">
                  {item.skillName}
                </div>
                <p className="font-medium text-gray-900 mb-3">{item.question}</p>
                <div className="space-y-2">
                  {item.options.map((opt, j) => (
                    <div
                      key={j}
                      className={`px-4 py-2 rounded-lg text-sm border ${
                        j === item.correctIndex
                          ? "bg-green-50 border-green-300 text-green-800"
                          : j === item.selectedIndex && j !== item.correctIndex
                          ? "bg-red-50 border-red-300 text-red-800"
                          : "bg-gray-50 border-gray-200 text-gray-600"
                      }`}
                    >
                      {opt}
                      {j === item.correctIndex && (
                        <span className="ml-2 text-green-600 font-medium">✓ Correct</span>
                      )}
                      {j === item.selectedIndex && j !== item.correctIndex && (
                        <span className="ml-2 text-red-600 font-medium">✗ Your answer</span>
                      )}
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-sm text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                  <span className="font-medium text-blue-700">Explanation:</span>{" "}
                  {item.explanation}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
      <div className="space-y-8">
        {questions.map((q, i) => (
          <fieldset key={i} className="border-b border-gray-100 pb-8 last:border-0 last:pb-0">
            <div className="flex items-start gap-4">
              <span className="shrink-0 w-7 h-7 rounded-full bg-brand-100 text-brand-700 font-bold text-sm flex items-center justify-center mt-0.5" aria-hidden="true">
                {i + 1}
              </span>
              <div className="flex-1">
                <div className="text-xs font-semibold text-brand-600 uppercase tracking-wide mb-1">
                  {q.skillName}
                </div>
                <legend className="font-medium text-gray-900 mb-4">{q.question}</legend>
                <div className="space-y-2">
                  {q.options.map((opt, j) => (
                    <label
                      key={j}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
                        answers[i] === j
                          ? "bg-brand-50 border-brand-400 text-brand-900"
                          : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q-${i}`}
                        value={j}
                        checked={answers[i] === j}
                        onChange={() => {
                          const next = [...answers];
                          next[i] = j;
                          setAnswers(next);
                        }}
                        className="accent-brand-600"
                      />
                      <span className="text-sm">{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </fieldset>
        ))}
      </div>

      {error && (
        <p
          role="alert"
          aria-live="polite"
          className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2"
        >
          {error}
        </p>
      )}

      <div className="mt-8 flex items-center justify-between">
        <span className="text-sm text-gray-500">
          {answers.filter((a) => a !== null).length} / {questions.length} answered
        </span>
        <button
          onClick={handleSubmit}
          disabled={!allAnswered || submitting}
          className="px-8 py-3 bg-brand-600 text-white font-medium rounded-xl hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Submitting..." : "Submit Assessment"}
        </button>
      </div>
    </div>
  );
}
