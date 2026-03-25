import { WaitlistForm } from "@/components/waitlist-form";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">AA</span>
            </div>
            <span className="font-semibold text-gray-900">AgenticAcademy</span>
          </div>
          <a
            href="/login"
            className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            Sign in
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 bg-brand-50 text-brand-700 text-sm font-medium px-3 py-1 rounded-full mb-6">
          <span className="w-2 h-2 rounded-full bg-brand-500"></span>
          Now in private beta
        </div>

        <h1 className="text-5xl font-bold text-gray-900 leading-tight mb-6">
          Master the skills that{" "}
          <span className="text-brand-600">the agentic economy</span>{" "}
          demands
        </h1>

        <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-10">
          AgenticAcademy delivers adaptive, continuously updated learning paths
          for professionals who need to design, govern, and operate AI agent
          systems — starting today.
        </p>

        <WaitlistForm />

        <p className="mt-4 text-sm text-gray-500">
          Already have an account?{" "}
          <a href="/login" className="text-brand-600 hover:underline">
            Sign in
          </a>
        </p>
      </section>

      {/* How it works */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
            How it works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Assess your starting point",
                description:
                  "Tell us your role, experience level, and learning goals. Claude builds your personalized baseline.",
              },
              {
                step: "02",
                title: "Learn with adaptive modules",
                description:
                  "Interactive lessons and simulations adapt to your performance. No two learners get the same path.",
              },
              {
                step: "03",
                title: "Apply in production simulations",
                description:
                  "Practice real multi-agent failure scenarios and governance decisions in a safe environment.",
              },
            ].map((item) => (
              <div key={item.step} className="bg-white rounded-xl p-6 shadow-sm">
                <div className="text-4xl font-bold text-brand-100 mb-3">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {item.title}
                </h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between text-sm text-gray-500">
          <span>© 2026 AgenticAcademy. All rights reserved.</span>
          <div className="flex gap-6">
            <a href="/privacy" className="hover:text-gray-900">Privacy</a>
            <a href="/terms" className="hover:text-gray-900">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
