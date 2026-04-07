import {
  boolean,
  pgTable,
  text,
  timestamptz,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { devices } from "./devices.js";

/**
 * Tracks the enrolment lifecycle for agent-connected devices.
 *
 * When a new device is added with `connectionType = 'agent'`, an enrolment
 * record is created containing a one-time `enrollToken`. The agent uses this
 * token on first contact to prove its identity; afterwards `tokenUsed` is set
 * to true and mutual TLS takes over (`clientCertFingerprint`).
 */
export const agentEnrollments = pgTable("agent_enrollments", {
  id: uuid("id").primaryKey().defaultRandom(),

  deviceId: uuid("device_id")
    .notNull()
    .references(() => devices.id, { onDelete: "cascade" }),

  /** Cryptographically random token presented by the agent during bootstrap. */
  enrollToken: text("enroll_token").notNull().unique(),

  /** True once the agent has successfully exchanged the token for a certificate. */
  tokenUsed: boolean("token_used").notNull().default(false),

  agentVersion: varchar("agent_version", { length: 20 }),

  /** SHA-256 fingerprint of the client TLS certificate, set after enrolment. */
  clientCertFingerprint: text("client_cert_fingerprint"),

  lastConnectedAt: timestamptz("last_connected_at"),

  connectedIp: text("connected_ip"),

  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export type AgentEnrollment = typeof agentEnrollments.$inferSelect;
export type NewAgentEnrollment = typeof agentEnrollments.$inferInsert;
