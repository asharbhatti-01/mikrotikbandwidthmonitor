import {
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { plans } from "./billing.js";
import { users } from "./users.js";

/**
 * Top-level tenant boundary.
 * Every resource in the platform is scoped to an organisation.
 *
 * Note: `ownerUserId` references `users` but the `users` table does NOT
 * reference `organizations` — this avoids a circular FK at the DB level.
 * Ownership semantics are enforced at the application layer.
 */
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),

  name: varchar("name", { length: 255 }).notNull(),

  /** URL-safe identifier used in routes, e.g. /org/<slug>/devices */
  slug: varchar("slug", { length: 100 }).notNull().unique(),

  planId: uuid("plan_id")
    .notNull()
    .references(() => plans.id),

  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id),

  /** Arbitrary key-value store for org-level feature flags and preferences. */
  settings: jsonb("settings")
    .notNull()
    .default(sql`'{}'::jsonb`),

  stripeCustomerId: varchar("stripe_customer_id", { length: 100 }).unique(),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
