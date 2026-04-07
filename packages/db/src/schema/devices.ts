import {
  bigint,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations.js";
import { sites } from "./sites.js";

/**
 * How the platform connects to a MikroTik device.
 * - agent:      a lightweight agent process runs on the device and calls home
 * - rest:       REST API (RouterOS 7+)
 * - binary_api: RouterOS binary API (port 8728/8729)
 * - snmp:       read-only SNMP polling
 */
export const connectionTypeEnum = pgEnum("connection_type", [
  "agent",
  "rest",
  "binary_api",
  "snmp",
]);

/**
 * Last-known reachability state of a device.
 */
export const deviceStatusEnum = pgEnum("device_status", [
  "online",
  "offline",
  "warning",
  "unreachable",
]);

/**
 * Central device registry for an organisation.
 * Credentials are stored encrypted (suffixed `Enc`); decryption happens in
 * the application layer using a KMS-backed key.
 */
export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    name: varchar("name", { length: 255 }).notNull(),

    description: text("description"),

    connectionType: connectionTypeEnum("connection_type").notNull(),

    ipAddress: text("ip_address"),

    /** RouterOS API port; defaults to 8728 (plain). TLS uses 8729. */
    apiPort: integer("api_port").notNull().default(8728),

    apiUsernameEnc: text("api_username_enc"),

    apiPasswordEnc: text("api_password_enc"),

    snmpCommunity: text("snmp_community"),

    rosVersion: varchar("ros_version", { length: 20 }),

    boardName: varchar("board_name", { length: 100 }),

    model: varchar("model", { length: 100 }),

    macAddress: varchar("mac_address", { length: 17 }),

    status: deviceStatusEnum("status").notNull().default("offline"),

    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),

    /** Uptime reported by the device in seconds. */
    uptimeSeconds: bigint("uptime_seconds", { mode: "number" }),

    siteId: uuid("site_id").references(() => sites.id, {
      onDelete: "set null",
    }),

    /** Free-form labels for filtering and grouping, e.g. ['core', 'region:eu']. */
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_devices_org_id").on(t.orgId),
    index("idx_devices_status").on(t.status),
    /** GIN index enables efficient `tags @> ARRAY['label']` queries. */
    index("idx_devices_tags_gin").using("gin", t.tags),
  ]
);

export type Device = typeof devices.$inferSelect;
export type NewDevice = typeof devices.$inferInsert;
