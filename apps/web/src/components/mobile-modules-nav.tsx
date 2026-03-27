"use client";

import { useState } from "react";
import Link from "next/link";

type ModuleItem = {
  id: string;
  title: string;
  order: number;
  status: "completed" | "failed" | "current" | "default";
};

export function MobileModulesNav({
  modules,
  courseSlug,
  currentTitle,
}: {
  modules: ModuleItem[];
  courseSlug: string;
  currentTitle: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden mb-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-modules-nav"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-gray-200 text-sm font-medium text-gray-900 hover:border-brand-300 transition-colors"
      >
        <span className="truncate text-left">{currentTitle}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`w-4 h-4 shrink-0 ml-2 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <nav
          id="mobile-modules-nav"
          aria-label="Course modules"
          className="mt-1 bg-white rounded-xl border border-gray-200 overflow-hidden"
        >
          {modules.map((m) => (
            <Link
              key={m.id}
              href={`/courses/${courseSlug}/modules/${m.id}`}
              className={`flex items-center gap-3 px-4 py-3 text-sm border-b border-gray-100 last:border-0 transition-colors ${
                m.status === "current"
                  ? "bg-brand-50 text-brand-700 font-medium"
                  : m.status === "completed"
                  ? "text-green-700 hover:bg-green-50"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
              onClick={() => setOpen(false)}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  m.status === "completed"
                    ? "bg-green-500 text-white"
                    : m.status === "failed"
                    ? "bg-red-100 text-red-600"
                    : m.status === "current"
                    ? "bg-brand-500 text-white"
                    : "bg-gray-200 text-gray-500"
                }`}
                aria-hidden="true"
              >
                {m.status === "completed" ? "✓" : m.order}
              </span>
              <span className="truncate">{m.title}</span>
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
