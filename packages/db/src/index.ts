import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Provide a valid PostgreSQL connection string."
  );
}

/**
 * Low-level postgres.js connection pool.
 *
 * `max` is intentionally conservative; tune via DATABASE_POOL_SIZE env var
 * for high-throughput deployments.
 */
const connectionString = process.env.DATABASE_URL;

const pool = postgres(connectionString, {
  max: process.env.DATABASE_POOL_SIZE
    ? parseInt(process.env.DATABASE_POOL_SIZE, 10)
    : 10,
  idle_timeout: 30,
  connect_timeout: 10,
});

/**
 * Drizzle ORM client.
 *
 * Import `db` anywhere in the application for type-safe SQL queries.
 *
 * @example
 * ```ts
 * import { db } from "@mikrotik/db";
 * import { devices } from "@mikrotik/db/schema";
 *
 * const rows = await db.select().from(devices).where(eq(devices.orgId, orgId));
 * ```
 */
export const db = drizzle(pool, { schema });

// Re-export the entire schema so callers don't need a second import path.
export * from "./schema/index.js";

// Export the raw pool for cases that need direct SQL (e.g. migrations, health checks).
export { pool };

// Export the schema namespace as a named group for Drizzle relational queries.
export { schema };
