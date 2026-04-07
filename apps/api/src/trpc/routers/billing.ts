import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { router, protectedProcedure } from "../index.js";
import { createCheckoutSchema } from "@mikrotik/types";
import { plans, subscriptions, organizations } from "@mikrotik/db/schema";

/**
 * Billing router — subscription plan queries and Stripe session creation.
 *
 * Stripe operations are placeholders: replace the TODO blocks with your
 * Stripe SDK calls once the secret keys are configured.
 */
export const billingRouter = router({
  /**
   * Returns the current plan and subscription details for the org.
   */
  getPlan: protectedProcedure.query(async ({ ctx }) => {
    const { db, org } = ctx;

    const [result] = await db
      .select({
        plan: plans,
        subscription: subscriptions,
      })
      .from(organizations)
      .innerJoin(plans, eq(organizations.planId, plans.id))
      .leftJoin(subscriptions, eq(subscriptions.orgId, org.id))
      .where(eq(organizations.id, org.id))
      .limit(1);

    if (!result) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Organisation or plan not found",
      });
    }

    return {
      plan: result.plan,
      subscription: result.subscription ?? null,
    };
  }),

  /**
   * Create a Stripe Checkout Session for upgrading to a paid plan.
   * Returns `{ url }` — the client redirects to this Stripe-hosted URL.
   *
   * TODO: Integrate with the Stripe SDK.
   * Required env vars: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, WEB_URL
   */
  createCheckoutSession: protectedProcedure
    .input(createCheckoutSchema)
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;

      // Resolve the target plan to get the Stripe price ID
      const [plan] = await db
        .select({
          id: plans.id,
          name: plans.name,
          stripePriceId: plans.stripePriceId,
        })
        .from(plans)
        .where(eq(plans.id, input.planId))
        .limit(1);

      if (!plan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
      }

      if (!plan.stripePriceId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selected plan is not available for purchase",
        });
      }

      // Retrieve or create the Stripe customer ID for this org
      const [orgRow] = await db
        .select({ stripeCustomerId: organizations.stripeCustomerId })
        .from(organizations)
        .where(eq(organizations.id, org.id))
        .limit(1);

      const webUrl = process.env["WEB_URL"] ?? "http://localhost:3000";

      // TODO: Replace with real Stripe SDK call:
      // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
      // const session = await stripe.checkout.sessions.create({
      //   mode: "subscription",
      //   customer: orgRow?.stripeCustomerId ?? undefined,
      //   customer_email: orgRow?.stripeCustomerId ? undefined : user.email,
      //   line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      //   success_url: `${webUrl}/settings/billing?session_id={CHECKOUT_SESSION_ID}`,
      //   cancel_url: `${webUrl}/settings/billing`,
      //   metadata: { orgId: org.id, planId: plan.id },
      // });
      // return { url: session.url! };

      void orgRow; // used once Stripe is wired up
      void user;

      throw new TRPCError({
        code: "NOT_IMPLEMENTED",
        message: "Stripe integration not yet configured",
      });
    }),

  /**
   * Create a Stripe Customer Portal session so the user can manage their
   * existing subscription, update payment methods, download invoices, etc.
   *
   * TODO: Integrate with the Stripe SDK.
   */
  createPortalSession: protectedProcedure
    .input(z.void())
    .mutation(async ({ ctx }) => {
      const { db, org } = ctx;

      const [orgRow] = await db
        .select({ stripeCustomerId: organizations.stripeCustomerId })
        .from(organizations)
        .where(eq(organizations.id, org.id))
        .limit(1);

      if (!orgRow?.stripeCustomerId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No Stripe customer found for this organisation",
        });
      }

      const webUrl = process.env["WEB_URL"] ?? "http://localhost:3000";

      // TODO: Replace with real Stripe SDK call:
      // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
      // const session = await stripe.billingPortal.sessions.create({
      //   customer: orgRow.stripeCustomerId,
      //   return_url: `${webUrl}/settings/billing`,
      // });
      // return { url: session.url };

      void webUrl;

      throw new TRPCError({
        code: "NOT_IMPLEMENTED",
        message: "Stripe integration not yet configured",
      });
    }),
});
