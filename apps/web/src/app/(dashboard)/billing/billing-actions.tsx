"use client";

import { useTransition } from "react";
import {
  createCheckoutSessionAction,
  createPortalSessionAction,
} from "@/actions/billing";

export function BillingActions({
  hasPaidPlan,
  hasStripeCustomer,
}: {
  hasPaidPlan: boolean;
  hasStripeCustomer: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  if (hasPaidPlan && hasStripeCustomer) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
          Manage subscription
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          Update your payment method, view invoices, or cancel your subscription
          via the Stripe billing portal.
        </p>
        <button
          onClick={() => startTransition(async () => { await createPortalSessionAction(); })}
          disabled={isPending}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Opening…" : "Open Billing Portal →"}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
      <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
        Upgrade to Pro
      </h2>
      <p className="text-sm text-gray-600 mb-5">
        Unlock unlimited courses, verified certificates, and AI-personalized
        learning paths.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() =>
            startTransition(async () => { await createCheckoutSessionAction("pro_monthly"); })
          }
          disabled={isPending}
          className="flex-1 py-3 px-5 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Loading…" : "$49 / month"}
        </button>
        <button
          onClick={() =>
            startTransition(async () => { await createCheckoutSessionAction("pro_annual"); })
          }
          disabled={isPending}
          className="flex-1 py-3 px-5 border border-brand-600 text-brand-700 text-sm font-semibold rounded-xl hover:bg-brand-50 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Loading…" : "$499 / year (save 15%)"}
        </button>
      </div>
    </div>
  );
}
