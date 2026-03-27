import { db } from "@agentic-academy/db";
import type { FunnelStage } from "@agentic-academy/db";

interface TrackFunnelEventOptions {
  userId: string;
  stage: FunnelStage;
  courseId?: string;
  moduleId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Fire-and-forget funnel event tracker.
 * Never throws — analytics must not block user-facing flows.
 */
export function trackFunnelEvent(opts: TrackFunnelEventOptions): void {
  db.funnelEvent
    .create({
      data: {
        userId: opts.userId,
        stage: opts.stage,
        courseId: opts.courseId ?? null,
        moduleId: opts.moduleId ?? null,
        metadata: (opts.metadata ?? {}) as object,
      },
    })
    .catch((err) => {
      console.error("[funnel] Failed to track event:", opts.stage, err);
    });
}
