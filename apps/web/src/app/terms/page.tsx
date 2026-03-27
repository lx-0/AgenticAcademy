import Link from "next/link";

export const metadata = { title: "Terms of Service — AgenticAcademy" };

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/" className="text-brand-600 hover:underline text-sm mb-8 block">
          ← Back to home
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Terms of Service</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: March 2026</p>
        <div className="prose prose-gray max-w-none space-y-6 text-gray-700">
          <p>
            By accessing or using AgenticAcademy, you agree to be bound by these Terms of Service.
            Please read them carefully before using our platform.
          </p>
          <h2 className="text-xl font-semibold text-gray-900 mt-8">Use of the Platform</h2>
          <p>
            AgenticAcademy grants you a limited, non-exclusive, non-transferable license to access
            and use our platform for your personal, non-commercial learning purposes.
          </p>
          <h2 className="text-xl font-semibold text-gray-900 mt-8">Account Responsibilities</h2>
          <p>
            You are responsible for maintaining the confidentiality of your account credentials and
            for all activities that occur under your account. You agree to notify us immediately of
            any unauthorized use of your account.
          </p>
          <h2 className="text-xl font-semibold text-gray-900 mt-8">Intellectual Property</h2>
          <p>
            All content on AgenticAcademy, including course materials, videos, and assessments, is
            owned by AgenticAcademy or its licensors and is protected by intellectual property laws.
          </p>
          <h2 className="text-xl font-semibold text-gray-900 mt-8">Limitation of Liability</h2>
          <p>
            AgenticAcademy shall not be liable for any indirect, incidental, special, or
            consequential damages arising from your use of the platform.
          </p>
          <h2 className="text-xl font-semibold text-gray-900 mt-8">Contact Us</h2>
          <p>
            For questions about these Terms, please contact us at{" "}
            <a href="mailto:legal@agenticacademy.com" className="text-brand-600 hover:underline">
              legal@agenticacademy.com
            </a>
            .
          </p>
          <p className="text-sm text-gray-400 mt-12 border-t pt-6">
            This is a beta version of our terms of service. A full legal review will be completed
            prior to general availability.
          </p>
        </div>
      </div>
    </div>
  );
}
