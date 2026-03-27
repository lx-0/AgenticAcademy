"use server";

import { trackFunnelEvent } from "@/lib/funnel";

export async function trackCertDownload(userId: string, courseId: string) {
  trackFunnelEvent({ userId, stage: "cert_downloaded", courseId });
}
