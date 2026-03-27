import { db } from "@agentic-academy/db";
import { NextResponse } from "next/server";
import { buildOb2Assertion } from "@/lib/badges";

export async function GET(
  _req: Request,
  { params }: { params: { credentialId: string } }
) {
  const cert = await db.certificate.findUnique({
    where: { credentialId: params.credentialId },
    include: {
      enrollment: {
        include: {
          course: { select: { title: true, description: true, slug: true } },
          user: { select: { email: true } },
        },
      },
    },
  });

  if (!cert || !cert.recipientEmail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const assertion = buildOb2Assertion({
    credentialId: cert.credentialId,
    recipientEmail: cert.recipientEmail,
    issuedAt: cert.issuedAt,
    courseTitle: cert.enrollment.course.title,
    courseDescription: cert.enrollment.course.description,
    courseSlug: cert.enrollment.course.slug,
  });

  return NextResponse.json(assertion, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
