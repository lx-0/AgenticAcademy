"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markLessonReadAction } from "@/actions/enrollment";

export function MarkCompleteButton({
  enrollmentId,
  moduleId,
  courseSlug,
}: {
  enrollmentId: string;
  moduleId: string;
  courseSlug: string;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      await markLessonReadAction(enrollmentId, moduleId);
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {isPending ? "Saving..." : "✓ Mark Complete"}
    </button>
  );
}
