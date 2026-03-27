import { NextRequest, NextResponse } from "next/server";
import { db } from "@agentic-academy/db";
import { z } from "zod";

const submitSchema = z.object({
  surveyId: z.string(),
  score: z.number().int().min(0).max(10),
  reasonText: z.string().max(1000).optional(),
  improveText: z.string().max(1000).optional(),
  recommendText: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { surveyId, score, reasonText, improveText, recommendText } = parsed.data;

  const survey = await db.npsSurvey.findUnique({ where: { id: surveyId } });
  if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  if (survey.status === "responded") {
    return NextResponse.json({ error: "Already responded" }, { status: 409 });
  }

  await db.npsSurvey.update({
    where: { id: surveyId },
    data: {
      status: "responded",
      respondedAt: new Date(),
      score,
      reasonText: reasonText ?? null,
      improveText: improveText ?? null,
      recommendText: recommendText ?? null,
    },
  });

  return NextResponse.json({ success: true });
}
