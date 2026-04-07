import {
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Subscription lifecycle states mirroring Stripe statuses.
 */
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "past_due",
  "canceled",
  "trialing",
]);

/**
 * Plans define feature entitlements and limits per organisation.
 * Rows are typically seeded and rarely mutated at runtime.
 */
export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),

  name: varchar("name", { length: 50 }).notNull(),

  maxDevices: integer("max_devices"),

  maxUsers: integer("max_users"),

  metricRetentionDays: integer("metric_retention_days").notNull().default(7),

  /** Array of feature flag strings, e.g. ['config_backups', 'alerting']. */
  features: text("features")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),

  stripePriceId: varchar("stripe_price_id", { length: 100 }),

  /** Per-device monthly price in USD with 4 decimal places. */
  pricePerDeviceUsd: numeric("price_per_device_usd", {
    precision: 10,
    scale: 4,
  }),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;

/**
 * One active subscription per organisation.
 * Stripe fields are nullable so the record can be created before Stripe
 * checkout completes (e.g. free-tier sign-ups).
 */
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),

  /**
   * Each org has at most one subscription row.
   *
   * NOTE: No FK reference to `organizations` here because `organizations`
   * already imports `billing` (for `plans`), which would create a circular
   * module dependency.  The referential integrity is enforced at the
   * application layer, and a DB-level FK can be added via a raw migration
   * after both tables exist:
   *   ALTER TABLE subscriptions
   *     ADD CONSTRAINT fk_subscriptions_org
   *     FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
   */
  orgId: uuid("org_id").notNull().unique(),

  planId: uuid("plan_id")
    .notNull()
    .references(() => plans.id),

  status: subscriptionStatusEnum("status").notNull().default("trialing"),

  stripeSubscriptionId: varchar("stripe_subscription_id", {
    length: 100,
  }).unique(),

  currentPeriodStart: timestamp("current_period_start"),

  currentPeriodEnd: timestamp("current_period_end"),

  trialEnd: timestamp("trial_end"),

  canceledAt: timestamp("canceled_at"),

  createdAt: timestamp("created_at").notNull().defaultNow(),

  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
