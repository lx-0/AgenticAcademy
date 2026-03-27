"use client";

import { trackCertDownload } from "./actions";

interface PrintButtonProps {
  userId: string;
  courseId: string;
}

export function PrintButton({ userId, courseId }: PrintButtonProps) {
  async function handlePrint() {
    await trackCertDownload(userId, courseId);
    window.print();
  }

  return (
    <button
      onClick={handlePrint}
      className="text-sm px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
    >
      Print / Save PDF
    </button>
  );
}
