import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">AA</span>
            </div>
            <span className="font-semibold text-gray-900">AgenticAcademy</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              {session.user.name ?? session.user.email}
            </span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back{session.user.name ? `, ${session.user.name}` : ""}!
          </h1>
          <p className="text-gray-600 mt-1">
            Your personalized learning dashboard is coming soon.
          </p>
        </div>

        {/* Empty state cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-10">
          {[
            {
              title: "My Learning Path",
              description: "Adaptive modules tailored to your role and goals.",
              icon: "🎯",
              badge: "Coming M2",
            },
            {
              title: "Current Course",
              description: "Agentic Engineering Fundamentals — 5 modules.",
              icon: "📚",
              badge: "Coming M2",
            },
            {
              title: "Skill Assessment",
              description: "See where you stand and what to learn next.",
              icon: "📊",
              badge: "Coming M3",
            },
          ].map((card) => (
            <div
              key={card.title}
              className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm"
            >
              <div className="text-3xl mb-3">{card.icon}</div>
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-semibold text-gray-900">{card.title}</h3>
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full whitespace-nowrap">
                  {card.badge}
                </span>
              </div>
              <p className="text-sm text-gray-600">{card.description}</p>
            </div>
          ))}
        </div>

        {/* Beta notice */}
        <div className="bg-brand-50 border border-brand-100 rounded-xl p-6">
          <h2 className="font-semibold text-brand-900 mb-1">
            You&apos;re in the beta!
          </h2>
          <p className="text-sm text-brand-700">
            The first course track — Agentic Engineering Fundamentals — launches
            in M2. You&apos;ll be notified the moment it&apos;s ready.
            Thank you for joining early.
          </p>
        </div>
      </main>
    </div>
  );
}
