"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { generatePathAction } from "@/actions/personalization";

interface Props {
  courseId: string;
  hasPath: boolean;
}

export function GeneratePathButton({ courseId, hasPath }: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      const result = await generatePathAction(courseId);
      if (!result?.error) {
        router.refresh();
      } else {
        alert(result.error);
      }
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="shrink-0 text-sm font-medium px-4 py-2 border border-brand-600 text-brand-600 rounded-lg hover:bg-brand-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {isPending ? "Generating..." : hasPath ? "Regenerate path" : "Generate my path"}
    </button>
  );
}
