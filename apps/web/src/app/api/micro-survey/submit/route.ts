import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@agentic-academy/db";
import { z } from "zod";

const submitSchema = z.object({
  moduleId: z.string(),
  questionId: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { moduleId, questionId, rating, comment } = parsed.data;
  const userId = session.user.id;

  await db.microSurveyResponse.upsert({
    where: { userId_moduleId: { userId, moduleId } },
    create: { userId, moduleId, questionId, rating, comment: comment ?? null },
    update: {},
  });

  return NextResponse.json({ success: true });
}
