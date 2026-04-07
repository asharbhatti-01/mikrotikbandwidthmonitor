import {
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations.js";
import { users } from "./users.js";

/**
 * API keys for programmatic access to the platform.
 *
 * Only the `keyHash` (SHA-256 of the raw key) is stored; the raw key is
 * shown once at creation time and never persisted.
 * `keyPrefix` (e.g. `mtk_live_`) is stored in plaintext so callers can
 * identify which key they are using without needing the full secret.
 *
 * `scopes` contains permission strings, e.g. ['devices:read', 'metrics:read'].
 */
export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),

  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),

  name: varchar("name", { length: 255 }).notNull(),

  /** SHA-256 hex digest of the raw API key. */
  keyHash: varchar("key_hash", { length: 64 }).notNull().unique(),

  /** Human-readable prefix shown in the UI, e.g. 'mtk_live_abc1'. */
  keyPrefix: varchar("key_prefix", { length: 10 }).notNull(),

  scopes: text("scopes")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),

  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),

  lastUsedAt: timestamp("last_used_at"),

  expiresAt: timestamp("expires_at"),

  /** Set when the key is explicitly revoked; null = still active. */
  revokedAt: timestamp("revoked_at"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
