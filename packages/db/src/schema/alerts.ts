import {
  boolean,
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
import { organizations } from "./organizations.js";
import { devices } from "./devices.js";

/**
 * Comparison operators for threshold-based alert rules.
 */
export const alertOperatorEnum = pgEnum("alert_operator", [
  "gt",
  "lt",
  "gte",
  "lte",
  "eq",
]);

/**
 * Notification channels an alert event can be dispatched to.
 */
export const alertChannelEnum = pgEnum("alert_channel", [
  "email",
  "webhook",
  "slack",
]);

/**
 * Configuration for a threshold alert.
 *
 * When `deviceId` is null the rule applies to every device in the org.
 * `cooldownMinutes` prevents notification storms by suppressing re-alerts
 * for that duration after the last event.
 */
export const alertRules = pgTable("alert_rules", {
  id: uuid("id").primaryKey().defaultRandom(),

  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),

  /** Null = org-wide rule; non-null = scoped to a single device. */
  deviceId: uuid("device_id").references(() => devices.id, {
    onDelete: "cascade",
  }),

  name: varchar("name", { length: 255 }).notNull(),

  /** Metric key, e.g. 'cpu_load', 'free_memory', 'interface.rx_bytes'. */
  metric: varchar("metric", { length: 100 }).notNull(),

  operator: alertOperatorEnum("operator").notNull(),

  threshold: numeric("threshold").notNull(),

  /** Ordered list of channels to notify, e.g. ['email', 'slack']. */
  channels: text("channels")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),

  cooldownMinutes: integer("cooldown_minutes").notNull().default(15),

  enabled: boolean("enabled").notNull().default(true),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AlertRule = typeof alertRules.$inferSelect;
export type NewAlertRule = typeof alertRules.$inferInsert;

/**
 * Fired instances of an alert rule for a specific device.
 * `resolvedAt` is set when the metric returns to a healthy range.
 */
export const alertEvents = pgTable("alert_events", {
  id: uuid("id").primaryKey().defaultRandom(),

  ruleId: uuid("rule_id")
    .notNull()
    .references(() => alertRules.id, { onDelete: "cascade" }),

  deviceId: uuid("device_id")
    .notNull()
    .references(() => devices.id, { onDelete: "cascade" }),

  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),

  firedAt: timestamp("fired_at").notNull().defaultNow(),

  resolvedAt: timestamp("resolved_at"),

  /** The raw metric value that triggered the rule. */
  metricValue: numeric("metric_value").notNull(),

  /** False until notification worker has dispatched the event. */
  notified: boolean("notified").notNull().default(false),
});

export type AlertEvent = typeof alertEvents.$inferSelect;
export type NewAlertEvent = typeof alertEvents.$inferInsert;
