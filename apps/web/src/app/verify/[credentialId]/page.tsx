import { db } from "@agentic-academy/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getBaseUrl } from "@/lib/badges";
import type { Metadata } from "next";

type Props = { params: { credentialId: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const cert = await getCert(params.credentialId);
  if (!cert) return { title: "Certificate Not Found" };
  const holderName =
    cert.enrollment.user.name ?? cert.enrollment.user.email ?? "Holder";
  const courseTitle = cert.enrollment.course.title;
  return {
    title: `${holderName} — ${courseTitle} Certificate | AgenticAcademy`,
    description: `Verified certificate issued by AgenticAcademy. ${holderName} completed "${courseTitle}".`,
    openGraph: {
      title: `${holderName} — ${courseTitle}`,
      description: `Verified AgenticAcademy certificate`,
      siteName: "AgenticAcademy",
    },
  };
}

async function getCert(credentialId: string) {
  return db.certificate.findUnique({
    where: { credentialId },
    include: {
      enrollment: {
        include: {
          user: { select: { name: true, email: true } },
          course: { select: { title: true, description: true, slug: true } },
        },
      },
    },
  });
}

export default async function VerifyPage({ params }: Props) {
  const cert = await getCert(params.credentialId);
  if (!cert) notFound();

  const base = getBaseUrl();
  const assertionUrl = `${base}/api/badges/${cert.credentialId}`;
  const holderName =
    cert.enrollment.user.name ?? cert.enrollment.user.email ?? "Certificate Holder";
  const courseTitle = cert.enrollment.course.title;

  const issuedDate = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(cert.issuedAt);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">AA</span>
            </div>
            <span className="font-semibold text-gray-900">AgenticAcademy</span>
          </Link>
          <span className="text-xs text-gray-400 font-mono">Certificate Verification</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* Verified badge */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-full px-4 py-1.5">
            <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-sm font-semibold text-green-700">Verified Certificate</span>
          </div>
        </div>

        {/* Certificate card */}
        <div className="bg-white rounded-2xl shadow-lg border-4 border-brand-600 p-10 text-center relative overflow-hidden mb-8">
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute -top-20 -right-20 w-56 h-56 bg-brand-50 rounded-full opacity-40" />
            <div className="absolute -bottom-20 -left-20 w-56 h-56 bg-brand-50 rounded-full opacity-40" />
          </div>

          <div className="relative">
            <div className="flex justify-center mb-5">
              <div className="w-14 h-14 rounded-2xl bg-brand-600 flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-xl">AA</span>
              </div>
            </div>

            <p className="text-xs font-semibold text-brand-600 uppercase tracking-widest mb-2">
              AgenticAcademy
            </p>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Certificate of Completion</h1>
            <p className="text-gray-500 mb-8">This is to certify that</p>

            <div className="border-b-2 border-gray-800 inline-block mb-2 px-8">
              <p className="text-3xl font-bold text-gray-900 pb-1">{holderName}</p>
            </div>

            <p className="text-gray-500 mb-6 mt-2">has successfully completed</p>

            <div className="bg-brand-50 border border-brand-200 rounded-xl px-8 py-4 mb-8 inline-block min-w-[280px]">
              <p className="text-xl font-bold text-brand-900">{courseTitle}</p>
            </div>

            <div className="flex items-center justify-center gap-12 mb-6">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Issue Date</p>
                <p className="font-semibold text-gray-700 text-sm">{issuedDate}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Credential ID</p>
                <p className="font-mono text-xs text-gray-500">{cert.credentialId.slice(0, 8).toUpperCase()}</p>
              </div>
            </div>

            <div className="flex items-center justify-center">
              <div className="border-t-2 border-gray-300 pt-3 text-center min-w-[160px]">
                <p className="font-semibold text-gray-700 text-sm">AgenticAcademy</p>
                <p className="text-xs text-gray-400 mt-0.5">Learning Platform</p>
              </div>
            </div>
          </div>
        </div>

        {/* Verification details */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Verification Details</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Credential ID</dt>
              <dd className="font-mono text-gray-700 text-xs">{cert.credentialId}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Standard</dt>
              <dd className="text-gray-700">Open Badges 2.0</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Issued by</dt>
              <dd className="text-gray-700">AgenticAcademy</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Issue date</dt>
              <dd className="text-gray-700">{issuedDate}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Assertion (OB 2.0)</dt>
              <dd>
                <a
                  href={assertionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-600 hover:underline font-mono text-xs"
                >
                  View JSON →
                </a>
              </dd>
            </div>
          </dl>
        </div>

        <p className="text-center text-xs text-gray-400">
          This certificate was issued by AgenticAcademy. To verify authenticity,
          the credential ID above uniquely identifies this award.
        </p>
      </main>
    </div>
  );
}
