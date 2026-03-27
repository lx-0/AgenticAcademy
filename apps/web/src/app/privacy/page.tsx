import Link from "next/link";

export const metadata = { title: "Privacy Policy — AgenticAcademy" };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/" className="text-brand-600 hover:underline text-sm mb-8 block">
          ← Back to home
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: March 2026</p>
        <div className="prose prose-gray max-w-none space-y-6 text-gray-700">
          <p>
            AgenticAcademy (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) is committed to protecting your
            privacy. This Privacy Policy explains how we collect, use, and safeguard your information
            when you use our platform.
          </p>
          <h2 className="text-xl font-semibold text-gray-900 mt-8">Information We Collect</h2>
          <p>
            We collect information you provide directly to us, such as when you create an account,
            enroll in a course, or contact us for support. This may include your name, email address,
            and learning progress data.
          </p>
          <h2 className="text-xl font-semibold text-gray-900 mt-8">How We Use Your Information</h2>
          <p>
            We use the information we collect to provide, maintain, and improve our services,
            personalize your learning experience, and communicate with you about your account.
          </p>
          <h2 className="text-xl font-semibold text-gray-900 mt-8">Data Retention</h2>
          <p>
            We retain your personal data for as long as your account is active or as needed to provide
            you services. You may request deletion of your data at any time by contacting us.
          </p>
          <h2 className="text-xl font-semibold text-gray-900 mt-8">Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy, please contact us at{" "}
            <a href="mailto:privacy@agenticacademy.com" className="text-brand-600 hover:underline">
              privacy@agenticacademy.com
            </a>
            .
          </p>
          <p className="text-sm text-gray-400 mt-12 border-t pt-6">
            This is a beta version of our privacy policy. A full legal review will be completed prior
            to general availability.
          </p>
        </div>
      </div>
    </div>
  );
}
