import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { auth } from "../auth.js";
import { db } from "../lib/db.js";
import { redis } from "../lib/redis.js";
import type { Db } from "../lib/db.js";
import type { RedisClient } from "../lib/redis.js";

/**
 * Shape of the authenticated user extracted from a Better Auth session.
 * Mirrors the structure returned by `auth.api.getSession`.
 */
export interface SessionUser {
  id: string;
  email: string;
  name: string | null | undefined;
  image: string | null | undefined;
}

/**
 * Active organisation context resolved from the request headers.
 * The client should send `x-org-id` on every authenticated request.
 */
export interface OrgContext {
  id: string;
}

/**
 * Full tRPC request context available in every procedure.
 *
 * `user` and `org` are null for unauthenticated / anonymous requests.
 * `protectedProcedure` middleware rejects requests where they are null.
 */
export interface TRPCContext {
  user: SessionUser | null;
  org: OrgContext | null;
  db: Db;
  redis: RedisClient;
  /** Raw request headers — available for downstream procedures if needed. */
  headers: Headers;
}

/**
 * Factory consumed by `@hono/trpc-server`.
 * Extracts the Better Auth session and org ID on every request.
 */
export async function createContext(
  opts: FetchCreateContextFnOptions
): Promise<TRPCContext> {
  const session = await auth.api.getSession({ headers: opts.req.headers });

  let user: SessionUser | null = null;
  let org: OrgContext | null = null;

  if (session) {
    user = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
    };

    // The active org comes from the x-org-id request header.
    // Better Auth's organisation plugin also stores activeOrganizationId on
    // the session object — fall back to that if the header is absent.
    const orgId =
      opts.req.headers.get("x-org-id") ??
      (
        session.session as Record<string, unknown> & {
          activeOrganizationId?: string;
        }
      ).activeOrganizationId ??
      null;

    if (orgId) {
      org = { id: orgId };
    }
  }

  return {
    user,
    org,
    db,
    redis,
    headers: opts.req.headers,
  };
}
