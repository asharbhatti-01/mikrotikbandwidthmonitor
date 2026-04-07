import type { Context, Next } from "hono";
import { sql as pgSql } from "../lib/db.js";

/**
 * Hono middleware that sets the `app.current_org_id` and
 * `app.current_user_id` Postgres session-local settings so that
 * Row Level Security policies can use them via `current_setting(...)`.
 *
 * Must run AFTER `orgAuthMiddleware` so that `orgId` and `userId` are
 * available on the context.
 *
 * Usage:
 * ```ts
 * app.use('/api/*', orgAuthMiddleware, rlsMiddleware)
 * ```
 *
 * Corresponding RLS policy example:
 * ```sql
 * CREATE POLICY org_isolation ON devices
 *   USING (org_id = current_setting('app.current_org_id')::uuid);
 * ```
 */
export async function rlsMiddleware(c: Context, next: Next): Promise<void> {
  const orgId = c.get("orgId") as string | undefined;
  const userId = (c.get("user") as { id?: string } | undefined)?.id;

  if (orgId || userId) {
    await pgSql`
      SELECT
        set_config('app.current_org_id',  ${orgId  ?? ""}, true),
        set_config('app.current_user_id', ${userId ?? ""}, true)
    `;
  }

  await next();
}

/**
 * Sets RLS context variables directly on a postgres.js transaction/connection
 * for use inside Drizzle transactions where you need per-statement isolation.
 *
 * @param orgId  - UUID of the current organisation
 * @param userId - UUID of the current user
 */
export async function setRlsContext(orgId: string, userId: string): Promise<void> {
  await pgSql`
    SELECT
      set_config('app.current_org_id',  ${orgId},  true),
      set_config('app.current_user_id', ${userId}, true)
  `;
}
