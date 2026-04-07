import {
  bigint,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { devices } from "./devices.js";

/**
 * Time-series device metrics collected by agents or pollers.
 *
 * The composite primary key `(deviceId, collectedAt)` makes this table
 * compatible with TimescaleDB hypertables if the project later migrates to
 * that extension. For vanilla Postgres, partition by range on `collectedAt`
 * for large deployments.
 *
 * `interfaces` stores an array of per-interface counters:
 * ```json
 * [{ "name": "ether1", "rxBytes": 1024, "txBytes": 2048, "running": true }]
 * ```
 */
export const deviceMetrics = pgTable(
  "device_metrics",
  {
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),

    collectedAt: timestamp("collected_at", { withTimezone: true }).notNull(),

    /** CPU load percentage (0-100). */
    cpuLoad: smallint("cpu_load"),

    /** Free memory in bytes as reported by RouterOS. */
    freeMemory: integer("free_memory"),

    /** Total installed memory in bytes. */
    totalMemory: integer("total_memory"),

    /** Device uptime in seconds at collection time. */
    uptime: bigint("uptime", { mode: "number" }),

    /** Per-interface traffic counters and state. */
    interfaces: jsonb("interfaces")
      .notNull()
      .default(sql`'[]'::jsonb`),
  },
  (t) => [primaryKey({ columns: [t.deviceId, t.collectedAt] })]
);

export type DeviceMetric = typeof deviceMetrics.$inferSelect;
export type NewDeviceMetric = typeof deviceMetrics.$inferInsert;
