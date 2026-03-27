import Link from "next/link";
import { PRICING_TIERS } from "@/lib/stripe";

export const metadata = { title: "Pricing — AgenticAcademy" };

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">AA</span>
            </div>
            <span className="font-semibold text-gray-900">AgenticAcademy</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/courses" className="text-gray-600 hover:text-gray-900">
              Courses
            </Link>
            <Link href="/login" className="text-gray-600 hover:text-gray-900">
              Sign in
            </Link>
            <Link
              href="/register"
              className="bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 transition-colors font-medium"
            >
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-16">
        {/* Hero */}
        <div className="text-center mb-14">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Start free with one course. Upgrade to Pro for unlimited access and
            verified certificates — or talk to us about an Enterprise plan.
          </p>
        </div>

        {/* Tier cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {PRICING_TIERS.map((tier) => (
            <div
              key={tier.id}
              className={`relative flex flex-col rounded-2xl border p-6 shadow-sm ${
                tier.highlighted
                  ? "border-brand-500 bg-brand-600 text-white shadow-brand-200 shadow-lg"
                  : "border-gray-200 bg-white text-gray-900"
              }`}
            >
              {tier.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-400 text-amber-900 text-xs font-bold px-3 py-1 rounded-full">
                  Most Popular
                </span>
              )}

              <div className="mb-4">
                <h2
                  className={`text-lg font-bold mb-1 ${
                    tier.highlighted ? "text-white" : "text-gray-900"
                  }`}
                >
                  {tier.name}
                </h2>
                <p
                  className={`text-sm ${
                    tier.highlighted ? "text-brand-100" : "text-gray-500"
                  }`}
                >
                  {tier.description}
                </p>
              </div>

              {/* Price display */}
              <div className="mb-6">
                {"price" in tier && tier.price === null ? (
                  <div className="text-3xl font-bold">Free</div>
                ) : "monthlyPrice" in tier ? (
                  <div>
                    <span className="text-3xl font-bold">${tier.monthlyPrice}</span>
                    <span
                      className={`text-sm ml-1 ${
                        tier.highlighted ? "text-brand-200" : "text-gray-500"
                      }`}
                    >
                      /month
                    </span>
                    <p
                      className={`text-xs mt-1 ${
                        tier.highlighted ? "text-brand-200" : "text-gray-500"
                      }`}
                    >
                      or ${tier.annualPrice}/year (save 15%)
                    </p>
                  </div>
                ) : "flatPrice" in tier ? (
                  <div>
                    <span className="text-3xl font-bold">
                      ${tier.flatPrice.toLocaleString()}
                    </span>
                    <p
                      className={`text-xs mt-1 ${
                        tier.highlighted ? "text-brand-200" : "text-gray-500"
                      }`}
                    >
                      flat fee · {tier.seats} seats · {tier.durationDays} days
                    </p>
                  </div>
                ) : "pricePerSeat" in tier ? (
                  <div>
                    <span className="text-3xl font-bold">
                      ${tier.pricePerSeat}
                    </span>
                    <span
                      className={`text-sm ml-1 ${
                        tier.highlighted ? "text-brand-200" : "text-gray-500"
                      }`}
                    >
                      /seat/year
                    </span>
                    <p
                      className={`text-xs mt-1 ${
                        tier.highlighted ? "text-brand-200" : "text-gray-500"
                      }`}
                    >
                      minimum {tier.minSeats} seats
                    </p>
                  </div>
                ) : null}
              </div>

              {/* Features */}
              <ul className="flex-1 space-y-2 mb-6">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <span
                      className={`mt-0.5 flex-shrink-0 ${
                        tier.highlighted ? "text-brand-200" : "text-green-500"
                      }`}
                    >
                      ✓
                    </span>
                    <span
                      className={tier.highlighted ? "text-brand-100" : "text-gray-600"}
                    >
                      {f}
                    </span>
                  </li>
                ))}
                {"limitations" in tier &&
                  tier.limitations.map((l) => (
                    <li key={l} className="flex items-start gap-2 text-sm">
                      <span
                        className={`mt-0.5 flex-shrink-0 ${
                          tier.highlighted ? "text-brand-300" : "text-gray-400"
                        }`}
                      >
                        ✗
                      </span>
                      <span
                        className={
                          tier.highlighted ? "text-brand-200" : "text-gray-400"
                        }
                      >
                        {l}
                      </span>
                    </li>
                  ))}
              </ul>

              <Link
                href={tier.ctaHref}
                className={`block text-center py-3 px-6 rounded-xl font-semibold text-sm transition-colors ${
                  tier.highlighted
                    ? "bg-white text-brand-700 hover:bg-brand-50"
                    : "bg-brand-600 text-white hover:bg-brand-700"
                }`}
              >
                {tier.cta}
              </Link>
            </div>
          ))}
        </div>

        {/* FAQ / note */}
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center max-w-2xl mx-auto">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Questions about Enterprise?
          </h2>
          <p className="text-gray-600 text-sm mb-4">
            We offer custom onboarding, SSO integration, and SLA agreements for
            teams of 25 or more. The Enterprise Pilot lets you validate ROI
            before an annual commitment.
          </p>
          <a
            href="mailto:enterprise@agenticacademy.ai"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors text-sm"
          >
            Talk to Sales →
          </a>
        </div>
      </main>
    </div>
  );
}
