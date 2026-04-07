import { initTRPC, TRPCError } from "@trpc/server";
import SuperJSON from "superjson";
import type { TRPCContext } from "./context.js";
import { authRouter } from "./routers/auth.js";
import { devicesRouter } from "./routers/devices.js";
import { orgsRouter } from "./routers/orgs.js";
import { configRouter } from "./routers/config.js";
import { alertsRouter } from "./routers/alerts.js";
import { billingRouter } from "./routers/billing.js";
import { auditRouter } from "./routers/audit.js";

/**
 * tRPC v11 initialisation.
 *
 * SuperJSON is used as the transformer so that Dates, Maps, Sets, BigInts,
 * undefined values, and other non-JSON-native types survive serialisation
 * over the wire without manual conversion.
 */
const t = initTRPC.context<TRPCContext>().create({
  transformer: SuperJSON,
  errorFormatter({ shape }) {
    return shape;
  },
});

/** Base router factory — re-exported so sub-routers can use the same instance. */
export const router = t.router;

/** Unprotected procedure — no session required. */
export const publicProcedure = t.procedure;

/**
 * Protected procedure — requires an authenticated user.
 * Throws UNAUTHORIZED if `ctx.user` is null.
 */
export const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

/**
 * Protected procedure — requires an authenticated user AND an active org.
 * Throws UNAUTHORIZED / FORBIDDEN as appropriate.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  if (!ctx.org) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No active organisation — include x-org-id header",
    });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      org: ctx.org,
    },
  });
});

/**
 * Root application router merging all sub-routers.
 * The key names here form the first segment of every tRPC path,
 * e.g. `trpc.devices.list`, `trpc.alerts.createRule`, etc.
 */
export const appRouter = router({
  auth: authRouter,
  devices: devicesRouter,
  orgs: orgsRouter,
  config: configRouter,
  alerts: alertsRouter,
  billing: billingRouter,
  audit: auditRouter,
});

/** Inferred type exported for use by the web client package. */
export type AppRouter = typeof appRouter;
