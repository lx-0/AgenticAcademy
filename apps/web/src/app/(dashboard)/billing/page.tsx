import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@agentic-academy/db";
import Link from "next/link";
import { tierLabel, isPaidTier } from "@/lib/entitlements";
import { BillingActions } from "./billing-actions";

export const metadata = { title: "Billing — AgenticAcademy" };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; plan?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { success, plan } = await searchParams;

  const user = await db.user.findUnique({
    where: { id: session.user.id! },
    select: {
      subscriptionTier: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      subscriptionEndsAt: true,
    },
  });
  if (!user) redirect("/login");

  const tierInfo = {
    subscriptionTier: user.subscriptionTier as "free" | "pro" | "enterprise_pilot" | "enterprise",
    subscriptionEndsAt: user.subscriptionEndsAt,
  };
  const paid = isPaidTier(tierInfo);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">AA</span>
            </div>
            <span className="font-semibold text-gray-900">AgenticAcademy</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
              Dashboard
            </Link>
            <Link href="/courses" className="text-gray-600 hover:text-gray-900">
              Courses
            </Link>
            <span className="text-gray-900 font-medium">Billing</span>
          </nav>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        {success === "1" && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4 text-green-800 text-sm font-medium">
            Payment successful!{" "}
            {plan === "enterprise_pilot"
              ? "Your Enterprise Pilot is now active."
              : "Your Pro subscription is now active."}
          </div>
        )}

        <h1 className="text-2xl font-bold text-gray-900 mb-8">Billing &amp; Subscription</h1>

        {/* Current plan card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 shadow-sm">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
            Current plan
          </h2>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xl font-bold text-gray-900">
                {tierLabel(tierInfo.subscriptionTier)}
              </div>
              {tierInfo.subscriptionEndsAt && (
                <p className="text-sm text-gray-500 mt-1">
                  {paid ? "Renews" : "Expires"}:{" "}
                  {tierInfo.subscriptionEndsAt.toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              )}
            </div>
            {!paid && (
              <Link
                href="/pricing"
                className="text-sm px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium transition-colors"
              >
                Upgrade
              </Link>
            )}
          </div>
        </div>

        {/* Billing portal or upgrade CTA */}
        <BillingActions hasPaidPlan={paid} hasStripeCustomer={!!user.stripeCustomerId} />
      </main>
    </div>
  );
}
