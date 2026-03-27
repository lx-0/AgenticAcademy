"use client";

import { useState, useTransition, useRef } from "react";
import Link from "next/link";
import { searchAction, studyAssistantAction, type SearchResult } from "@/actions/search";

// ─── Search Results ───────────────────────────────────────────────────────────

function ResultCard({ result }: { result: SearchResult }) {
  const kindLabel = {
    course: "Course",
    module: "Module",
    lesson: "Lesson",
  }[result.kind];

  const kindColor = {
    course: "bg-brand-100 text-brand-700",
    module: "bg-purple-100 text-purple-700",
    lesson: "bg-green-100 text-green-700",
  }[result.kind];

  const href =
    result.kind === "course"
      ? `/courses/${result.slug}`
      : result.course_slug
      ? `/courses/${result.course_slug}`
      : "#";

  return (
    <Link
      href={href}
      className="block bg-white rounded-xl border border-gray-200 p-5 hover:border-brand-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${kindColor}`}>
              {kindLabel}
            </span>
            {result.course_title && result.kind !== "course" && (
              <span className="text-xs text-gray-400 truncate">{result.course_title}</span>
            )}
          </div>
          <h3 className="font-semibold text-gray-900 truncate">{result.title}</h3>
          {result.description && (
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">{result.description}</p>
          )}
        </div>
        <span className="shrink-0 text-xs text-gray-400 font-mono mt-1">
          {(result.score * 100).toFixed(0)}%
        </span>
      </div>
    </Link>
  );
}

// ─── Study Assistant ──────────────────────────────────────────────────────────

function StudyAssistant() {
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<{
    answer?: string;
    sources?: Array<{ lessonTitle: string; moduleTitle: string; courseTitle: string; score: number }>;
    error?: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    startTransition(async () => {
      const result = await studyAssistantAction(question);
      if ("error" in result) {
        setResponse({ error: result.error });
      } else {
        setResponse({ answer: result.answer, sources: result.sources });
      }
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <div>
          <h2 className="font-semibold text-gray-900">Study Assistant</h2>
          <p className="text-xs text-gray-500">Ask anything about the course content</p>
        </div>
      </div>

      <form onSubmit={handleAsk} className="mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="How do I handle agent failures?"
            className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={isPending || !question.trim()}
            className="px-4 py-2.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? "Thinking..." : "Ask"}
          </button>
        </div>
      </form>

      {response && (
        <div className="space-y-4">
          {response.error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {response.error}
            </div>
          )}
          {response.answer && (
            <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <p className="text-sm text-gray-800 leading-relaxed">{response.answer}</p>
            </div>
          )}
          {response.sources && response.sources.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Sources</p>
              <div className="space-y-1.5">
                {response.sources.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center font-medium text-gray-600 shrink-0">
                      {i + 1}
                    </span>
                    <span>
                      {s.courseTitle} › {s.moduleTitle} › {s.lessonTitle}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Search Client Component ────────────────────────────────────────────

export function SearchClient({ initialQuery }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [mode, setMode] = useState<"semantic" | "keyword" | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setHasSearched(true);
    startTransition(async () => {
      const res = await searchAction(query);
      setResults(res.results);
      setMode(res.mode);
    });
  }

  return (
    <div className="space-y-8">
      {/* Search Bar */}
      <form onSubmit={handleSearch}>
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search courses, modules, lessons..."
              className="w-full pl-12 pr-4 py-3.5 text-base rounded-xl border border-gray-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            disabled={isPending || !query.trim()}
            className="px-6 py-3.5 bg-brand-600 text-white font-medium rounded-xl hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? "Searching..." : "Search"}
          </button>
        </div>

        {/* Example queries */}
        {!hasSearched && (
          <div className="flex flex-wrap gap-2 mt-3">
            {[
              "how do I handle agent failures",
              "prompt engineering techniques",
              "tool use patterns",
              "memory and context",
            ].map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  setQuery(example);
                  inputRef.current?.focus();
                }}
                className="text-xs px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              >
                {example}
              </button>
            ))}
          </div>
        )}
      </form>

      {/* Results */}
      {hasSearched && (
        <div>
          {isPending ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-1/4 mb-3" />
                  <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
                  <div className="h-4 bg-gray-200 rounded w-full" />
                </div>
              ))}
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="font-medium">No results for &ldquo;{query}&rdquo;</p>
              <p className="text-sm mt-1">Try different keywords or browse the course catalog.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-500">
                  {results.length} result{results.length !== 1 ? "s" : ""} for &ldquo;{query}&rdquo;
                </p>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  mode === "semantic"
                    ? "bg-brand-100 text-brand-700"
                    : "bg-gray-100 text-gray-600"
                }`}>
                  {mode === "semantic" ? "Semantic search" : "Keyword search"}
                </span>
              </div>
              <div className="space-y-3">
                {results.map((result) => (
                  <ResultCard key={`${result.kind}-${result.id}`} result={result} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Study Assistant */}
      <StudyAssistant />
    </div>
  );
}
