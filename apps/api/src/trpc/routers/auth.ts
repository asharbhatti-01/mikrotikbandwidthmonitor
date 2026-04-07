import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, authedProcedure } from "../init.js";
import { auth } from "../../auth.js";

/**
 * Auth router — session introspection and sign-out.
 *
 * Sign-in / sign-up flows are handled directly by Better Auth's HTTP handler
 * mounted at `/auth/**`; they are NOT proxied through tRPC.
 */
export const authRouter = router({
  /**
   * Returns the current session user and session metadata, or null when
   * the request carries no valid session cookie / bearer token.
   */
  getSession: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return null;

    return {
      user: {
        id: ctx.user.id,
        email: ctx.user.email,
        name: ctx.user.name,
        image: ctx.user.image,
      },
    };
  }),

  /**
   * Invalidates the current session server-side.
   * Requires an active session; returns `{ success: true }` on completion.
   */
  signOut: authedProcedure
    .input(z.void())
    .mutation(async ({ ctx }) => {
      const result = await auth.api.signOut({ headers: ctx.headers });

      if (!result) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to sign out",
        });
      }

      return { success: true };
    }),
});
