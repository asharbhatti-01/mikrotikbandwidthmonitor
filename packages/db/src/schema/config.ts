import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamptz,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { devices } from "./devices.js";
import { organizations } from "./organizations.js";
import { users } from "./users.js";

/**
 * What caused a configuration snapshot to be taken.
 */
export const snapshotTriggerEnum = pgEnum("snapshot_trigger", [
  "scheduled",
  "manual",
  "pre_change",
  "post_change",
]);

/**
 * Lifecycle states for a command sent to a device.
 */
export const commandStatusEnum = pgEnum("command_status", [
  "pending",
  "sent",
  "acked",
  "failed",
  "rolled_back",
]);

/**
 * Point-in-time export of a device's `/export` output.
 * `exportRsc` contains the raw RouterOS script text.
 * `storageKey` is an object-storage key if the payload has been offloaded
 * to S3/R2 due to size constraints.
 */
export const configSnapshots = pgTable("config_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),

  deviceId: uuid("device_id")
    .notNull()
    .references(() => devices.id, { onDelete: "cascade" }),

  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),

  takenAt: timestamptz("taken_at").notNull().defaultNow(),

  triggeredBy: snapshotTriggerEnum("triggered_by").notNull(),

  triggeredByUserId: uuid("triggered_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),

  /** Full `/export` text from RouterOS. May be large for complex configs. */
  exportRsc: text("export_rsc").notNull(),

  sizeBytes: integer("size_bytes"),

  /** Object-storage key when `exportRsc` has been moved to cold storage. */
  storageKey: text("storage_key"),

  /** SHA-256 hex digest of `exportRsc` for change detection. */
  checksum: varchar("checksum", { length: 64 }),
});

export type ConfigSnapshot = typeof configSnapshots.$inferSelect;
export type NewConfigSnapshot = typeof configSnapshots.$inferInsert;

/**
 * Outbound commands queued for delivery to a device.
 *
 * `idempotencyKey` lets callers safely retry without duplicating commands.
 * `rollbackPayload` carries the inverse operation for automated rollback.
 */
export const pendingCommands = pgTable("pending_commands", {
  id: uuid("id").primaryKey().defaultRandom(),

  deviceId: uuid("device_id")
    .notNull()
    .references(() => devices.id, { onDelete: "cascade" }),

  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),

  /** Caller-supplied UUID to prevent duplicate command delivery. */
  idempotencyKey: uuid("idempotency_key").notNull().unique(),

  /** Namespaced command identifier, e.g. 'interface.disable'. */
  commandType: varchar("command_type", { length: 100 }).notNull(),

  /** Command arguments as a structured JSON object. */
  payload: jsonb("payload").notNull(),

  status: commandStatusEnum("status").notNull().default("pending"),

  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),

  createdAt: timestamptz("created_at").notNull().defaultNow(),

  sentAt: timestamptz("sent_at"),

  ackedAt: timestamptz("acked_at"),

  /** Response payload returned by the device after execution. */
  result: jsonb("result"),

  errorMessage: text("error_message"),

  /** Payload to send if an automated rollback is triggered. */
  rollbackPayload: jsonb("rollback_payload"),
});

export type PendingCommand = typeof pendingCommands.$inferSelect;
export type NewPendingCommand = typeof pendingCommands.$inferInsert;
