import { WaitlistForm } from "@/components/waitlist-form";
import { db } from "@agentic-academy/db";

async function getPublishedCourses() {
  try {
    return await db.course.findMany({
      where: { status: "published" },
      include: {
        modules: { orderBy: { order: "asc" }, select: { id: true, title: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const courses = await getPublishedCourses();

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
          <div className="flex items-center gap-6">
            <a
              href="#preview"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Preview courses
            </a>
            <a
              href="/login"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Sign in
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 bg-brand-50 text-brand-700 text-sm font-medium px-3 py-1 rounded-full mb-6">
          <span className="w-2 h-2 rounded-full bg-brand-500"></span>
          Now in private beta
        </div>

        <h1 className="text-5xl font-bold text-gray-900 leading-tight mb-6">
          Take your team from{" "}
          <span className="text-brand-600">AI-curious</span>{" "}
          to AI-operational
        </h1>

        <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-4">
          The training platform built for engineers who build with AI — and the
          L&amp;D teams who need to prove it&apos;s working.
        </p>

        <p className="text-base text-gray-500 max-w-2xl mx-auto mb-10">
          Not another AI course. AgenticAcademy delivers hands-on production
          labs, governance frameworks, and adaptive learning paths that turn
          AI skills into measurable workflow change.
        </p>

        <WaitlistForm />

        <p className="mt-4 text-sm text-gray-500">
          Already have an account?{" "}
          <a href="/login" className="text-brand-600 hover:underline">
            Sign in
          </a>
        </p>
      </section>

      {/* Dual-persona strip */}
      <section className="border-y border-gray-100 py-16">
        <div className="max-w-5xl mx-auto px-6 grid md:grid-cols-2 gap-10">
          {/* For engineers */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-brand-600 mb-4">
              For engineers
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Production-grade skills, not toy demos
            </h2>
            <p className="text-gray-600 mb-6">
              AgenticAcademy was built by engineers who&apos;ve been paged at 3am
              when a multi-agent pipeline went sideways. The curriculum covers
              what production actually looks like — orchestration failures,
              non-deterministic debugging, SOC 2 audit trails, and agentic
              governance frameworks.
            </p>
            <ul className="space-y-2 text-sm text-gray-700">
              {[
                "Hands-on labs with real failure scenarios",
                "Multi-agent orchestration & observability",
                "Governance vocabulary for working with compliance teams",
                "Adaptive paths that match your experience level",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-0.5 w-4 h-4 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center shrink-0 text-xs font-bold">
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* For L&D */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-emerald-600 mb-4">
              For L&amp;D &amp; enterprise buyers
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              ROI you can show your CLO
            </h2>
            <p className="text-gray-600 mb-6">
              Completion rates are a vanity metric. AgenticAcademy tracks
              before/after skill assessments so you can demonstrate
              measurable AI competency growth — and make the case to legal,
              finance, and the CHRO without a six-month procurement saga.
            </p>
            <ul className="space-y-2 text-sm text-gray-700">
              {[
                "Pre/post skill assessment data in your admin dashboard",
                "Public course preview — share with CTOs and legal, no login needed",
                "Security & compliance documentation available before the sales call",
                "Pilot cohort pricing for teams of 15–25 (no CHRO sign-off required)",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-0.5 w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 text-xs font-bold">
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Public course preview */}
      <section id="preview" className="py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-600 mb-2">
              No login required
            </p>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">
              See the curriculum before you commit
            </h2>
            <p className="text-gray-600 max-w-xl mx-auto">
              Share this with your CTO, legal team, or CHRO. The full module
              list is public — because content you can&apos;t preview is content
              you can&apos;t approve.
            </p>
          </div>

          {courses.length > 0 ? (
            <div className="space-y-6">
              {courses.map((course) => (
                <div
                  key={course.id}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
                >
                  <div className="px-6 py-5 border-b border-gray-100">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {course.title}
                    </h3>
                    <p className="text-sm text-gray-600">{course.description}</p>
                    <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
                      <span>{course.modules.length} modules</span>
                      {course.duration && (
                        <span>~{Math.round(course.duration / 60)}h total</span>
                      )}
                    </div>
                  </div>
                  {course.modules.length > 0 && (
                    <div className="px-6 py-4">
                      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
                        Modules
                      </p>
                      <ol className="space-y-2">
                        {course.modules.map((mod, i) => (
                          <li
                            key={mod.id}
                            className="flex items-center gap-3 text-sm text-gray-700"
                          >
                            <span className="text-xs font-bold text-gray-400 w-5 shrink-0">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            {mod.title}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            /* Static preview when no courses are in DB yet */
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Agentic Engineering Fundamentals
                  </h3>
                  <span className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-medium">
                    Coming soon
                  </span>
                </div>
                <p className="text-sm text-gray-600">
                  Production-grade skills for engineers building multi-agent systems:
                  architecture patterns, orchestration, governance, and observability.
                </p>
                <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
                  <span>5 modules</span>
                  <span>~8h total</span>
                </div>
              </div>
              <div className="px-6 py-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
                  Modules
                </p>
                <ol className="space-y-2">
                  {[
                    "Agent Architecture Patterns",
                    "Multi-Agent Orchestration",
                    "Governance & Compliance",
                    "Observability & Debugging",
                    "Cost Management & Optimization",
                  ].map((title, i) => (
                    <li
                      key={title}
                      className="flex items-center gap-3 text-sm text-gray-700"
                    >
                      <span className="text-xs font-bold text-gray-400 w-5 shrink-0">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {title}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          <div className="text-center mt-8">
            <a
              href="/register"
              className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-medium px-6 py-3 rounded-lg transition-colors text-sm"
            >
              Join the waitlist to get early access
            </a>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white py-20">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-3">
            How it works
          </h2>
          <p className="text-center text-gray-600 mb-12 max-w-xl mx-auto">
            Most platforms stop at &ldquo;you watched the video.&rdquo; We track the
            skills you actually built.
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Baseline your team",
                description:
                  "Pre-assessments benchmark each learner's starting point. L&D admins see team-wide skill gaps before day one — no guesswork.",
              },
              {
                step: "02",
                title: "Learn in production context",
                description:
                  "Adaptive modules and hands-on labs match your role, tools, and workflow. Engineers debug real failure scenarios; non-technical roles work through agent decision-making in their own job context.",
              },
              {
                step: "03",
                title: "Prove the ROI",
                description:
                  "Post-assessments, completion data, and workflow change metrics flow into your admin dashboard. Share the results with leadership, not just the receipts.",
              },
            ].map((item) => (
              <div key={item.step} className="bg-gray-50 rounded-xl p-6">
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
