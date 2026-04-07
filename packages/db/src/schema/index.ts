/**
 * Central barrel — re-exports every table, enum, and inferred type from the
 * schema layer so consumers can import from `@mikrotik/db/schema` without
 * needing to know individual file names.
 *
 * Import order matters for Drizzle's schema introspection: tables that are
 * referenced by FK must be exported before the tables that reference them.
 * The ordering below satisfies all FK dependencies.
 */

// 1. No external FK deps
export * from "./billing.js"; // plans (referenced by orgs + subscriptions)
export * from "./users.js"; // users (referenced by orgs, memberships, etc.)

// 2. Reference billing + users
export * from "./organizations.js"; // orgs → plans, users

// 3. Reference organizations
export * from "./sites.js"; // sites → orgs
export * from "./memberships.js"; // memberships → orgs, users
export * from "./api-keys.js"; // apiKeys → orgs, users

// 4. Reference orgs + sites
export * from "./devices.js"; // devices → orgs, sites

// 5. Reference devices
export * from "./agent-enrollments.js";
export * from "./metrics.js";

// 6. Reference devices + orgs + users
export * from "./config.js";
export * from "./alerts.js";

// 7. Reference orgs + users + apiKeys + devices (all above)
export * from "./audit.js";
