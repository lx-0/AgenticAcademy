import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@agentic-academy/db";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(null);

  const moduleId = req.nextUrl.searchParams.get("moduleId");
  if (!moduleId) return NextResponse.json(null);

  const userId = session.user.id;

  // Already responded?
  const existing = await db.microSurveyResponse.findUnique({
    where: { userId_moduleId: { userId, moduleId } },
  });
  if (existing) return NextResponse.json(null);

  const questions = await db.microSurveyQuestion.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  if (questions.length === 0) return NextResponse.json(null);

  // Deterministic rotation: hash(userId + moduleId)
  const hash = Array.from(userId + moduleId).reduce(
    (acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0,
    0
  );
  const idx = Math.abs(hash) % questions.length;
  const q = questions[idx];

  return NextResponse.json({ questionId: q.id, question: q.question });
}
