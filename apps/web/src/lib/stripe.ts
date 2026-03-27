import Stripe from "stripe";

// Lazily initialized so builds don't fail when STRIPE_SECRET_KEY is absent
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(key, { apiVersion: "2026-03-25.dahlia" });
  }
  return _stripe;
}

// Convenience alias used by server code
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

// ─── Pricing constants ────────────────────────────────────────────────────────

export const STRIPE_PRICE_IDS = {
  PRO_MONTHLY: process.env.STRIPE_PRICE_PRO_MONTHLY ?? "",
  PRO_ANNUAL: process.env.STRIPE_PRICE_PRO_ANNUAL ?? "",
  ENTERPRISE_PILOT: process.env.STRIPE_PRICE_ENTERPRISE_PILOT ?? "",
} as const;

export const PRICING_TIERS = [
  {
    id: "free" as const,
    name: "Starter",
    price: null,
    description: "Get started with one course",
    features: [
      "Access to 1 course",
      "Module-by-module progress tracking",
      "Community forum access",
    ],
    limitations: ["No certificates", "Single course only"],
    cta: "Get Started Free",
    ctaHref: "/register",
    highlighted: false,
  },
  {
    id: "pro" as const,
    name: "Pro",
    monthlyPrice: 49,
    annualPrice: 499,
    description: "Full access for individual learners",
    features: [
      "Unlimited course access",
      "Verified digital certificates",
      "AI-personalized learning paths",
      "Skill assessment & ROI analytics",
      "Priority support",
    ],
    limitations: [],
    cta: "Start Pro",
    ctaHref: "/checkout/pro",
    highlighted: true,
  },
  {
    id: "enterprise_pilot" as const,
    name: "Enterprise Pilot",
    flatPrice: 12000,
    seats: 15,
    durationDays: 90,
    description: "90-day pilot for your team",
    features: [
      "15 seats for 90 days",
      "All Pro features",
      "Team management dashboard",
      "Bulk enrollment",
      "Dedicated onboarding",
    ],
    limitations: [],
    cta: "Start Pilot",
    ctaHref: "/checkout/enterprise-pilot",
    highlighted: false,
  },
  {
    id: "enterprise" as const,
    name: "Enterprise",
    pricePerSeat: 800,
    minSeats: 25,
    description: "Annual plan for large teams",
    features: [
      "25+ seats (annual)",
      "All Pro features",
      "SSO / SAML support",
      "Advanced analytics & reporting",
      "SLA + dedicated CSM",
    ],
    limitations: [],
    cta: "Contact Sales",
    ctaHref: "mailto:enterprise@agenticacademy.ai",
    highlighted: false,
  },
] as const;
