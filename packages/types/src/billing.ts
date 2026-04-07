import { z } from "zod";

/**
 * Available subscription plan tiers.
 */
export const planNames = ["free", "pro", "business", "enterprise"] as const;

const planNameEnum = z.enum(planNames);

/**
 * Schema for initiating a Stripe checkout session for a plan upgrade.
 */
export const createCheckoutSchema = z.object({
  planId: z.string().uuid(),
});

export type PlanName = z.infer<typeof planNameEnum>;
export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>;
