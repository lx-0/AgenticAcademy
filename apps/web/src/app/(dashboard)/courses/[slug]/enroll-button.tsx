"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { enrollAction } from "@/actions/enrollment";

export function EnrollButton({ courseId }: { courseId: string }) {
  const [isPending, startTransition] = useTransition();
  const [tierError, setTierError] = useState(false);

  function handleEnroll() {
    setTierError(false);
    startTransition(async () => {
      const result = await enrollAction(courseId);
      if (result?.error?.includes("free tier limit")) {
        setTierError(true);
      }
    });
  }

  if (tierError) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          You&apos;ve used your free course slot.{" "}
          <Link href="/pricing" className="font-semibold underline hover:no-underline">
            Upgrade to Pro
          </Link>{" "}
          for unlimited access + certificates.
        </p>
      </div>
    );
  }

  return (
    <button
      onClick={handleEnroll}
      disabled={isPending}
      className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {isPending ? "Enrolling..." : "Enroll Now — Free"}
    </button>
  );
}
