import { auth } from "@/auth";
import { db } from "@agentic-academy/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Learner Profile — AgenticAcademy" };

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const existing = await db.learnerProfile.findUnique({
    where: { userId: session.user.id },
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">AA</span>
            </div>
            <span className="font-semibold text-gray-900">AgenticAcademy</span>
          </Link>
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">
            Skip for now
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            {existing ? "Update your learner profile" : "Set up your learner profile"}
          </h1>
          <p className="text-gray-600 mt-2">
            This takes 60 seconds and lets us build a personalized learning path for you.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
          <OnboardingForm existing={existing} />
        </div>
      </main>
    </div>
  );
}
