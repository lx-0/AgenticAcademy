"use server";

import { auth } from "@/auth";
import { db } from "@agentic-academy/db";
import { stripe, STRIPE_PRICE_IDS } from "@/lib/stripe";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

async function getOrCreateStripeCustomer(userId: string, email: string): Promise<string> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true },
  });

  if (user?.stripeCustomerId) return user.stripeCustomerId;

  const customer = await stripe.customers.create({
    email,
    metadata: { userId },
  });

  await db.user.update({
    where: { id: userId },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}

function getOrigin(headersList: Awaited<ReturnType<typeof headers>>): string {
  return headersList.get("origin") ?? headersList.get("x-forwarded-proto")
    ? `${headersList.get("x-forwarded-proto")}://${headersList.get("host")}`
    : "http://localhost:3000";
}

export async function createCheckoutSessionAction(
  plan: "pro_monthly" | "pro_annual"
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) redirect("/login");

  const priceId =
    plan === "pro_monthly" ? STRIPE_PRICE_IDS.PRO_MONTHLY : STRIPE_PRICE_IDS.PRO_ANNUAL;

  if (!priceId) {
    return { error: "Stripe price IDs not configured. Please set STRIPE_PRICE_PRO_MONTHLY / STRIPE_PRICE_PRO_ANNUAL." };
  }

  const headersList = await headers();
  const origin = getOrigin(headersList);
  const stripeCustomerId = await getOrCreateStripeCustomer(
    session.user.id,
    session.user.email
  );

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/billing?success=1`,
    cancel_url: `${origin}/pricing`,
    metadata: { userId: session.user.id },
    subscription_data: { metadata: { userId: session.user.id } },
  });

  if (checkoutSession.url) {
    redirect(checkoutSession.url);
  }

  return { error: "Failed to create checkout session" };
}

export async function createEnterprisePilotSessionAction(): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) redirect("/login");

  if (!STRIPE_PRICE_IDS.ENTERPRISE_PILOT) {
    return { error: "Enterprise pilot price ID not configured." };
  }

  const headersList = await headers();
  const origin = getOrigin(headersList);
  const stripeCustomerId = await getOrCreateStripeCustomer(
    session.user.id,
    session.user.email
  );

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: "payment",
    line_items: [{ price: STRIPE_PRICE_IDS.ENTERPRISE_PILOT, quantity: 1 }],
    success_url: `${origin}/billing?success=1&plan=enterprise_pilot`,
    cancel_url: `${origin}/pricing`,
    metadata: { userId: session.user.id, plan: "enterprise_pilot" },
  });

  if (checkoutSession.url) {
    redirect(checkoutSession.url);
  }

  return { error: "Failed to create checkout session" };
}

export async function createPortalSessionAction(): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { stripeCustomerId: true },
  });

  if (!user?.stripeCustomerId) {
    return { error: "No active subscription found." };
  }

  const headersList = await headers();
  const origin = getOrigin(headersList);

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${origin}/billing`,
  });

  if (portalSession.url) {
    redirect(portalSession.url);
  }

  return { error: "Failed to open billing portal" };
}
