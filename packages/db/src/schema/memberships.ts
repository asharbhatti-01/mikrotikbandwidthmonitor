import {
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations.js";
import { users } from "./users.js";

/**
 * Roles available within an organisation, ordered from most to least privileged.
 */
export const orgRoleEnum = pgEnum("org_role", [
  "owner",
  "admin",
  "operator",
  "viewer",
]);

/**
 * Membership linking a user to an organisation with a role.
 * A user may belong to many organisations; each (org, user) pair is unique.
 */
export const orgMemberships = pgTable(
  "org_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    role: orgRoleEnum("role").notNull().default("viewer"),

    /** Who sent the invitation that resulted in this membership. */
    invitedBy: uuid("invited_by").references(() => users.id, {
      onDelete: "set null",
    }),

    /** Null until the invited user explicitly accepts. */
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("uq_org_memberships_org_user").on(t.orgId, t.userId)]
);

export type OrgMembership = typeof orgMemberships.$inferSelect;
export type NewOrgMembership = typeof orgMemberships.$inferInsert;
