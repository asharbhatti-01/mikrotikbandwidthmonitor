import {
  boolean,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Platform users — one row per human identity.
 * Users are global; their membership in an org is tracked via `orgMemberships`.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),

  email: varchar("email", { length: 255 }).notNull().unique(),

  name: varchar("name", { length: 255 }),

  avatarUrl: text("avatar_url"),

  mfaEnabled: boolean("mfa_enabled").notNull().default(false),

  lastLoginAt: timestamp("last_login_at"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
