import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { db } from "@agentic-academy/db";
import type Stripe from "stripe";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig || !WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature or secret" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error(`Error handling Stripe event ${event.type}:`, err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  if (!userId) return;

  if (session.mode === "subscription" && session.subscription) {
    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : (session.subscription as Stripe.Subscription).id;

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const tier = resolveSubscriptionTier(subscription);
    // Use cancel_at as end date when scheduled cancellation exists
    const endsAt = subscription.cancel_at
      ? new Date(subscription.cancel_at * 1000)
      : null;

    await db.user.update({
      where: { id: userId },
      data: {
        subscriptionTier: tier,
        stripeSubscriptionId: subscription.id,
        subscriptionEndsAt: endsAt,
      },
    });
  } else if (session.mode === "payment" && session.metadata?.plan === "enterprise_pilot") {
    const ninetyDaysFromNow = new Date();
    ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

    await db.user.update({
      where: { id: userId },
      data: {
        subscriptionTier: "enterprise_pilot",
        subscriptionEndsAt: ninetyDaysFromNow,
      },
    });
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId;
  if (!userId) return;

  const tier = resolveSubscriptionTier(subscription);
  const endsAt = subscription.cancel_at
    ? new Date(subscription.cancel_at * 1000)
    : null;

  await db.user.update({
    where: { id: userId },
    data: {
      subscriptionTier: tier,
      stripeSubscriptionId: subscription.id,
      subscriptionEndsAt: endsAt,
    },
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId;
  if (!userId) return;

  await db.user.update({
    where: { id: userId },
    data: {
      subscriptionTier: "free",
      stripeSubscriptionId: null,
      subscriptionEndsAt: null,
    },
  });
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;

  const user = await db.user.findUnique({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  if (user) {
    console.warn(`Payment failed for user ${user.id} (Stripe customer ${customerId})`);
  }
}

function resolveSubscriptionTier(
  subscription: Stripe.Subscription
): "free" | "pro" | "enterprise_pilot" | "enterprise" {
  if (subscription.status === "active" || subscription.status === "trialing") {
    return "pro";
  }
  return "free";
}
