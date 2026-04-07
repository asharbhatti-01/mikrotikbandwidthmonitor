/**
 * Re-exports the shared Drizzle ORM client from `@mikrotik/db`.
 *
 * All application code in `apps/api` should import `db` from here rather than
 * directly from `@mikrotik/db` so that any future changes to the connection
 * strategy (e.g. per-request pooling, PgBouncer) are centralised.
 *
 * The raw postgres.js `pool` is re-exported as `sql` for middleware that needs
 * to issue raw SQL — for example the RLS middleware that runs SET LOCAL.
 */
import { db, pool, schema } from "@mikrotik/db";

export { db, pool as sql, schema };
export type Db = typeof db;
