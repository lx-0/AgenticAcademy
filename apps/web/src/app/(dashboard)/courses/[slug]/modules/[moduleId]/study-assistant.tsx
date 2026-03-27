"use client";

import { useState, useTransition } from "react";
import { studyAssistantAction } from "@/actions/search";

export function StudyAssistantWidget({ courseId }: { courseId: string }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<{
    answer?: string;
    sources?: Array<{ lessonTitle: string; moduleTitle: string; courseTitle: string }>;
    error?: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    startTransition(async () => {
      const result = await studyAssistantAction(question, courseId);
      if ("error" in result) {
        setResponse({ error: result.error });
      } else {
        setResponse({ answer: result.answer, sources: result.sources });
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 w-full px-4 py-3 bg-purple-50 border border-purple-200 rounded-xl text-sm font-medium text-purple-700 hover:bg-purple-100 transition-colors"
      >
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        Ask the study assistant
      </button>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-purple-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-purple-600 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-gray-900">Study Assistant</span>
        </div>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mb-3">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask anything about this course..."
          rows={2}
          className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-300 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent mb-2"
        />
        <button
          type="submit"
          disabled={isPending || !question.trim()}
          className="w-full py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? "Thinking..." : "Ask"}
        </button>
      </form>

      {response && (
        <div className="space-y-3">
          {response.error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {response.error}
            </div>
          )}
          {response.answer && (
            <div className="p-3 bg-purple-50 rounded-lg">
              <p className="text-sm text-gray-800 leading-relaxed">{response.answer}</p>
            </div>
          )}
          {response.sources && response.sources.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Sources</p>
              {response.sources.map((s, i) => (
                <p key={i} className="text-xs text-gray-500">
                  {i + 1}. {s.moduleTitle} › {s.lessonTitle}
                </p>
              ))}
            </div>
          )}
          <button
            onClick={() => { setResponse(null); setQuestion(""); }}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Ask another question
          </button>
        </div>
      )}
    </div>
  );
}
