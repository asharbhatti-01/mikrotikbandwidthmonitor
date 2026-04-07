import type { Context, Next } from "hono";
import { auth } from "../auth.js";

/**
 * Hono middleware that verifies the Better Auth session and attaches
 * `user` and `session` to the Hono context variables.
 *
 * Routes that require authentication should use this middleware.
 * The tRPC `protectedProcedure` re-uses `createContext` for the same
 * validation path, so this middleware is primarily for non-tRPC routes.
 */
export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("user", session.user);
  c.set("session", session.session);

  await next();
}

/**
 * Hono middleware that verifies session AND requires the user to have
 * an active organisation context (x-org-id header or session org).
 */
export async function orgAuthMiddleware(c: Context, next: Next): Promise<Response | void> {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const orgId =
    c.req.header("x-org-id") ??
    (session.session as Record<string, unknown> & { activeOrganizationId?: string })
      .activeOrganizationId;

  if (!orgId) {
    return c.json({ error: "No active organisation" }, 403);
  }

  c.set("user", session.user);
  c.set("session", session.session);
  c.set("orgId", orgId);

  await next();
}
