import {
  boolean,
  pgTable,
  text,
  timestamptz,
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

  lastLoginAt: timestamptz("last_login_at"),

  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
