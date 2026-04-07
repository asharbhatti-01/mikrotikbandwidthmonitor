import { initTRPC, TRPCError } from "@trpc/server";
import SuperJSON from "superjson";
import type { TRPCContext } from "./context.js";

const t = initTRPC.context<TRPCContext>().create({
  transformer: SuperJSON,
  errorFormatter({ shape }) {
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

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
  return next({ ctx: { ...ctx, user: ctx.user, org: ctx.org } });
});
