import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations.js";
import { users } from "./users.js";
import { apiKeys } from "./api-keys.js";
import { devices } from "./devices.js";

/**
 * Immutable append-only audit trail for all significant platform actions.
 *
 * Rows are never updated or deleted; retention is handled by a background
 * archival job that moves old rows to cold storage.
 *
 * Actor identity is captured as either:
 *   - a human user (`actorUserId`)
 *   - a programmatic API key (`actorApiKeyId`)
 *   - an internal service (`actorType = 'system'`, both FK columns null)
 *
 * `payloadBefore` / `payloadAfter` store redacted snapshots of the
 * resource state to enable diff views in the UI.
 */
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),

  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),

  actorUserId: uuid("actor_user_id").references(() => users.id, {
    onDelete: "set null",
  }),

  actorApiKeyId: uuid("actor_api_key_id").references(() => apiKeys.id, {
    onDelete: "set null",
  }),

  /** 'user' | 'api_key' | 'system' */
  actorType: varchar("actor_type", { length: 50 }).notNull().default("user"),

  /** Namespaced action identifier, e.g. 'device.config.snapshot.created'. */
  action: varchar("action", { length: 200 }).notNull(),

  targetDeviceId: uuid("target_device_id").references(() => devices.id, {
    onDelete: "set null",
  }),

  /** Generic target reference for non-device resources, e.g. 'alert_rule:uuid'. */
  targetResource: varchar("target_resource", { length: 200 }),

  /** Resource state before the action (redacted). */
  payloadBefore: jsonb("payload_before"),

  /** Resource state after the action (redacted). */
  payloadAfter: jsonb("payload_after"),

  ipAddress: text("ip_address"),

  userAgent: text("user_agent"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
