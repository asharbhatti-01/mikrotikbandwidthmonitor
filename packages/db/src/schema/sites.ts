import {
  numeric,
  pgTable,
  text,
  timestamptz,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations.js";

/**
 * Physical or logical grouping of devices within an organisation.
 * Latitude/longitude allow mapping integrations.
 */
export const sites = pgTable("sites", {
  id: uuid("id").primaryKey().defaultRandom(),

  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),

  name: varchar("name", { length: 255 }).notNull(),

  location: text("location"),

  latitude: numeric("latitude"),

  longitude: numeric("longitude"),

  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;
