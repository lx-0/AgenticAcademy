"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitAssessmentAction } from "@/actions/assessment";
import Link from "next/link";

type Question = {
  question: string;
  options: string[];
  explanation: string;
};

type ReviewItem = {
  question: string;
  options: string[];
  correctIndex: number;
  selectedIndex: number | undefined;
  explanation: string;
};

type Result = {
  score: number;
  passed: boolean;
  passingScore: number;
  correct: number;
  total: number;
  review: ReviewItem[];
};

export function AssessmentQuiz({
  questions,
  moduleId,
  enrollmentId,
  passingScore,
  courseSlug,
}: {
  questions: Question[];
  moduleId: string;
  enrollmentId: string;
  passingScore: number;
  courseSlug: string;
}) {
  const [answers, setAnswers] = useState<(number | undefined)[]>(
    Array(questions.length).fill(undefined)
  );
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const allAnswered = answers.every((a) => a !== undefined);

  async function handleSubmit() {
    if (!allAnswered) return;
    setLoading(true);
    const res = await submitAssessmentAction(
      moduleId,
      enrollmentId,
      answers as number[]
    );
    setResult(res);
    setLoading(false);
    router.refresh();
  }

  if (result) {
    return (
      <div className="space-y-6">
        {/* Score card */}
        <div
          className={`rounded-xl border p-6 text-center ${
            result.passed
              ? "bg-green-50 border-green-200"
              : "bg-red-50 border-red-200"
          }`}
        >
          <div className="text-5xl font-bold mb-2">
            {result.passed ? "🎉" : "😔"}
          </div>
          <div
            className={`text-4xl font-bold mb-1 ${
              result.passed ? "text-green-700" : "text-red-700"
            }`}
          >
            {result.score}%
          </div>
          <p
            className={`text-sm font-medium ${
              result.passed ? "text-green-600" : "text-red-600"
            }`}
          >
            {result.passed ? "Passed!" : `Failed — need ${result.passingScore}% to pass`}
          </p>
          <p className="text-gray-500 text-sm mt-1">
            {result.correct}/{result.total} correct
          </p>
          <div className="flex justify-center gap-3 mt-5">
            {result.passed ? (
              <Link
                href={`/courses/${courseSlug}`}
                className="px-5 py-2.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors"
              >
                Back to Course →
              </Link>
            ) : (
              <button
                onClick={() => {
                  setAnswers(Array(questions.length).fill(undefined));
                  setResult(null);
                }}
                className="px-5 py-2.5 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 transition-colors"
              >
                Retry Assessment
              </button>
            )}
          </div>
        </div>

        {/* Review */}
        <div className="space-y-4">
          <h2 className="font-semibold text-gray-900 text-lg">Review</h2>
          {result.review.map((item, i) => {
            const correct = item.selectedIndex === item.correctIndex;
            return (
              <div
                key={i}
                className={`rounded-xl border p-5 ${
                  correct ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
                }`}
              >
                <p className="font-medium text-gray-900 mb-3">
                  {i + 1}. {item.question}
                </p>
                <div className="space-y-2">
                  {item.options.map((opt, j) => (
                    <div
                      key={j}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                        j === item.correctIndex
                          ? "bg-green-100 text-green-800 font-medium"
                          : j === item.selectedIndex && !correct
                          ? "bg-red-100 text-red-700 line-through"
                          : "text-gray-600"
                      }`}
                    >
                      {j === item.correctIndex ? "✓ " : j === item.selectedIndex && !correct ? "✗ " : "  "}
                      {opt}
                    </div>
                  ))}
                </div>
                {item.explanation && (
                  <p className="mt-3 text-sm text-gray-600 italic">{item.explanation}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {questions.map((q, i) => (
        <fieldset key={i} className="bg-white rounded-xl border border-gray-200 p-6">
          <legend className="font-medium text-gray-900 mb-4 w-full">
            {i + 1}. {q.question}
          </legend>
          <div className="space-y-2">
            {q.options.map((opt, j) => (
              <label
                key={j}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm transition-colors cursor-pointer ${
                  answers[i] === j
                    ? "border-brand-500 bg-brand-50 text-brand-800 font-medium"
                    : "border-gray-200 text-gray-700 hover:border-brand-300 hover:bg-brand-50"
                }`}
              >
                <input
                  type="radio"
                  name={`question-${i}`}
                  value={j}
                  checked={answers[i] === j}
                  onChange={() => {
                    const next = [...answers];
                    next[i] = j;
                    setAnswers(next);
                  }}
                  className="sr-only"
                />
                <span
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-current shrink-0 text-xs"
                  aria-hidden="true"
                >
                  {String.fromCharCode(65 + j)}
                </span>
                {opt}
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      <button
        onClick={handleSubmit}
        disabled={!allAnswered || loading}
        className="w-full py-3 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "Submitting..." : `Submit Assessment (${answers.filter((a) => a !== undefined).length}/${questions.length} answered)`}
      </button>
    </div>
  );
}
