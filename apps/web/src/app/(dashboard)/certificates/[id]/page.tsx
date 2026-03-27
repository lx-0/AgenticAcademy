import { auth } from "@/auth";
import { db } from "@agentic-academy/db";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { PrintButton } from "./print-button";
import { getBaseUrl, buildLinkedInUrl } from "@/lib/badges";
export const metadata = { title: "Certificate — AgenticAcademy" };

export default async function CertificatePage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const cert = await db.certificate.findUnique({
    where: { id: params.id },
    include: {
      enrollment: {
        include: {
          user: { select: { name: true, email: true } },
          course: { select: { title: true, description: true, slug: true } },
        },
      },
    },
  });

  if (!cert) notFound();
  if (cert.enrollment.userId !== session.user.id) redirect("/dashboard");

  const issuedDate = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(cert.issuedAt);

  const learnerName = cert.enrollment.user.name ?? cert.enrollment.user.email;
  const courseTitle = cert.enrollment.course.title;
  const base = getBaseUrl();
  const verifyUrl = `${base}/verify/${cert.credentialId}`;
  const linkedInUrl = buildLinkedInUrl({
    courseTitle,
    credentialId: cert.credentialId,
    issuedAt: cert.issuedAt,
    verifyUrl,
  });

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b border-gray-200 print:hidden">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">AA</span>
            </div>
            <span className="font-semibold text-gray-900">AgenticAcademy</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href={`/courses/${cert.enrollment.course.slug}`}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Back to course
            </Link>
            <PrintButton userId={session.user.id} courseId={cert.enrollment.courseId} />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 print:p-0 print:max-w-none">
        {/* Certificate card */}
        <div
          id="certificate"
          className="bg-white rounded-2xl shadow-xl border-4 border-brand-600 p-12 text-center relative overflow-hidden print:shadow-none print:rounded-none"
        >
          {/* Decorative background */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-brand-50 rounded-full opacity-40" />
            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-brand-50 rounded-full opacity-40" />
          </div>

          <div className="relative">
            {/* Logo */}
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-brand-600 flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-2xl">AA</span>
              </div>
            </div>

            <p className="text-sm font-semibold text-brand-600 uppercase tracking-widest mb-2">
              AgenticAcademy
            </p>

            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              Certificate of Completion
            </h1>

            <p className="text-gray-500 mb-10">This is to certify that</p>

            <div className="border-b-2 border-gray-800 inline-block mb-2 px-8">
              <p className="text-3xl font-bold text-gray-900 pb-1">{learnerName}</p>
            </div>

            <p className="text-gray-500 mb-8 mt-2">has successfully completed</p>

            <div className="bg-brand-50 border border-brand-200 rounded-xl px-8 py-5 mb-10 inline-block min-w-[300px]">
              <p className="text-2xl font-bold text-brand-900">
                {courseTitle}
              </p>
            </div>

            <div className="flex items-center justify-center gap-16 mb-8">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Issue Date</p>
                <p className="font-semibold text-gray-700">{issuedDate}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Certificate ID</p>
                <p className="font-mono text-xs text-gray-500">{cert.credentialId.slice(0, 8).toUpperCase()}</p>
              </div>
            </div>

            <div className="flex items-center justify-center">
              <div className="border-t-2 border-gray-300 pt-3 text-center min-w-[180px]">
                <p className="font-semibold text-gray-700 text-sm">AgenticAcademy</p>
                <p className="text-xs text-gray-400 mt-0.5">Learning Platform</p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions below certificate */}
        <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3 print:hidden">
          <Link
            href="/dashboard"
            className="text-center px-5 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            ← Dashboard
          </Link>
          <PrintButton userId={cert.enrollment.userId} courseId={cert.enrollment.courseId} />
          <Link
            href={verifyUrl}
            target="_blank"
            className="text-center px-5 py-2.5 border border-brand-300 text-brand-700 bg-brand-50 font-medium rounded-lg hover:bg-brand-100 transition-colors"
          >
            Share verify link →
          </Link>
          <a
            href={linkedInUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-center px-5 py-2.5 bg-[#0A66C2] text-white font-medium rounded-lg hover:bg-[#004182] transition-colors"
          >
            Add to LinkedIn
          </a>
        </div>

        {/* Share info */}
        <div className="mt-4 text-center print:hidden">
          <p className="text-xs text-gray-400">
            Public verify URL:{" "}
            <a href={verifyUrl} className="text-brand-600 hover:underline font-mono text-xs" target="_blank" rel="noopener noreferrer">
              {verifyUrl}
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
