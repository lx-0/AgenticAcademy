import { db } from "@agentic-academy/db";
import { NextResponse } from "next/server";
import { getBaseUrl } from "@/lib/badges";

export async function GET(
  _req: Request,
  { params }: { params: { slug: string } }
) {
  const course = await db.course.findUnique({
    where: { slug: params.slug },
    select: { title: true, description: true, slug: true },
  });

  if (!course) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const base = getBaseUrl();
  return NextResponse.json(
    {
      "@context": "https://w3id.org/openbadges/v2",
      type: "BadgeClass",
      id: `${base}/api/badges/class/${course.slug}`,
      name: course.title,
      description: course.description,
      image: `${base}/api/badges/image/${course.slug}`,
      criteria: {
        narrative: `Complete all modules of "${course.title}" on AgenticAcademy and pass any required assessments.`,
      },
      issuer: `${base}/api/badges/issuer`,
    },
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}
