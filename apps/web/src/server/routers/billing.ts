import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import { db } from "@agentic-academy/db";
import { TRPCError } from "@trpc/server";
import { stripe, STRIPE_PRICE_IDS } from "@/lib/stripe";
import { headers } from "next/headers";

export const billingRouter = createTRPCRouter({
  /** Get the current user's subscription info */
  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id!;
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        subscriptionTier: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        subscriptionEndsAt: true,
      },
    });
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });
    return user;
  }),

  /** Create a Stripe Checkout session for Pro monthly or annual */
  createCheckoutSession: protectedProcedure
    .input(
      z.object({
        plan: z.enum(["pro_monthly", "pro_annual"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id!;
      const userEmail = ctx.session.user.email!;

      const priceId =
        input.plan === "pro_monthly"
          ? STRIPE_PRICE_IDS.PRO_MONTHLY
          : STRIPE_PRICE_IDS.PRO_ANNUAL;

      if (!priceId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Stripe price IDs are not configured",
        });
      }

      // Get or create Stripe customer
      let stripeCustomerId: string;
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { stripeCustomerId: true },
      });

      if (user?.stripeCustomerId) {
        stripeCustomerId = user.stripeCustomerId;
      } else {
        const customer = await stripe.customers.create({
          email: userEmail,
          metadata: { userId },
        });
        stripeCustomerId = customer.id;
        await db.user.update({
          where: { id: userId },
          data: { stripeCustomerId },
        });
      }

      const headersList = await headers();
      const origin = headersList.get("origin") ?? "http://localhost:3000";

      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/billing?success=1`,
        cancel_url: `${origin}/pricing`,
        metadata: { userId },
        subscription_data: {
          metadata: { userId },
        },
      });

      return { url: session.url };
    }),

  /** Create a Stripe Billing Portal session for self-service management */
  createPortalSession: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id!;
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true },
    });

    if (!user?.stripeCustomerId) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "No Stripe customer found. Subscribe to a plan first.",
      });
    }

    const headersList = await headers();
    const origin = headersList.get("origin") ?? "http://localhost:3000";

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${origin}/billing`,
    });

    return { url: session.url };
  }),

  /** Create checkout for the Enterprise Pilot flat-fee package */
  createEnterprisePilotSession: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id!;
    const userEmail = ctx.session.user.email!;

    if (!STRIPE_PRICE_IDS.ENTERPRISE_PILOT) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Enterprise pilot price ID is not configured",
      });
    }

    let stripeCustomerId: string;
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true },
    });

    if (user?.stripeCustomerId) {
      stripeCustomerId = user.stripeCustomerId;
    } else {
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: { userId },
      });
      stripeCustomerId = customer.id;
      await db.user.update({
        where: { id: userId },
        data: { stripeCustomerId },
      });
    }

    const headersList = await headers();
    const origin = headersList.get("origin") ?? "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "payment",
      line_items: [{ price: STRIPE_PRICE_IDS.ENTERPRISE_PILOT, quantity: 1 }],
      success_url: `${origin}/billing?success=1&plan=enterprise_pilot`,
      cancel_url: `${origin}/pricing`,
      metadata: { userId, plan: "enterprise_pilot" },
    });

    return { url: session.url };
  }),
});
